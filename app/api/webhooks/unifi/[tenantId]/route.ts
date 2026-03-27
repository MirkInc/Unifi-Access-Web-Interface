import crypto from 'crypto'
import { isValidObjectId } from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import WebhookEvent from '@/models/WebhookEvent'
import ActorCache from '@/models/ActorCache'
import { clientForTenant } from '@/lib/unifi'
import { recordWebhookDeliveryMetric } from '@/lib/webhookHealth'
import type { UnifiLogEntry } from '@/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ tenantId: string }> }

function safeCompareHex(aHex: string, bHex: string): boolean {
  const normalizedA = aHex.trim().toLowerCase()
  const normalizedB = bHex.trim().toLowerCase()
  const hex64 = /^[a-f0-9]{64}$/
  if (!hex64.test(normalizedA) || !hex64.test(normalizedB)) return false
  const a = Buffer.from(normalizedA, 'hex')
  const b = Buffer.from(normalizedB, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function getPayloadActor(payload: Record<string, unknown>): { id?: string; name?: string } | null {
  const data = payload.data as Record<string, unknown> | undefined
  const actor = data?.actor as Record<string, unknown> | undefined
  if (!actor) return null
  const id = typeof actor.id === 'string' ? actor.id : undefined
  const name = typeof actor.name === 'string' ? actor.name : undefined
  if (!id && !name) return null
  return { id, name }
}

function setPayloadActor(
  payload: Record<string, unknown>,
  actor: { id: string; name: string; type?: string }
): Record<string, unknown> {
  const next = { ...payload }
  const data = { ...((next.data as Record<string, unknown>) ?? {}) }
  data.actor = {
    id: actor.id,
    name: actor.name,
    type: actor.type ?? 'user',
  }
  next.data = data
  return next
}

function looksUsableActor(log: UnifiLogEntry): boolean {
  const name = log.actor?.display_name?.trim()
  return !!(name && name.toLowerCase() !== 'n/a' && log.actor?.id && log.actor?.type !== 'door')
}

function bestLogMatch(
  logs: UnifiLogEntry[],
  unifiDoorId: string,
  event: string,
  targetTs: number
): UnifiLogEntry | null {
  const byDoor = logs.filter((l) => l.event?.object_id === unifiDoorId && looksUsableActor(l))
  if (byDoor.length === 0) return null

  const keywordForEvent: Record<string, string[]> = {
    'access.door.unlock': ['unlock', 'remote_unlock'],
    'access.temporary_unlock.start': ['temporary', 'keep_unlock', 'custom', 'unlock'],
    'access.temporary_unlock.end': ['temporary', 'reset', 'lock_rule', 'unlock'],
    'access.unlock_schedule.activate': ['schedule', 'unlock_schedule'],
    'access.unlock_schedule.deactivate': ['schedule', 'unlock_schedule', 'lock_early'],
  }

  const preferred = byDoor.filter((l) => {
    const key = (l.event?.log_key ?? '').toLowerCase()
    const type = (l.event?.type ?? '').toLowerCase()
    const words = keywordForEvent[event] ?? []
    if (words.length === 0) return true
    return words.some((w) => key.includes(w) || type.includes(w))
  })

  const pool = preferred.length > 0 ? preferred : byDoor
  pool.sort((a, b) => {
    const ad = Math.abs((a.event?.timestamp ?? 0) - targetTs)
    const bd = Math.abs((b.event?.timestamp ?? 0) - targetTs)
    return ad - bd
  })
  return pool[0] ?? null
}

async function resolveActorForWebhookEvent(
  tenant: { _id: unknown; unifiHost: string; unifiApiKey: string },
  payload: Record<string, unknown>,
  unifiDoorId: string,
  event: string,
  timestampSec: number
): Promise<Record<string, unknown>> {
  const existing = getPayloadActor(payload)
  if (existing?.name) return payload

  const topics = ['door_openings', 'door_lock_rule']
  const since = Math.max(0, timestampSec - 180)
  const until = timestampSec + 30

  try {
    const client = clientForTenant(tenant)
    const all: UnifiLogEntry[] = []
    for (const topic of topics) {
      try {
        const logs = await client.getLogs({ topic, since, until, pageSize: 200 })
        all.push(...logs)
      } catch {
        // Topic may not exist on this controller version
      }
    }

    const match = bestLogMatch(all, unifiDoorId, event, timestampSec)
    if (!match?.actor?.id || !match.actor.display_name) return payload

    await ActorCache.findOneAndUpdate(
      { tenantId: tenant._id, actorId: match.actor.id },
      { $set: { actorName: match.actor.display_name, lastSeenAt: new Date() } },
      { upsert: true }
    )

    return setPayloadActor(payload, {
      id: match.actor.id,
      name: match.actor.display_name,
      type: match.actor.type,
    })
  } catch {
    return payload
  }
}

async function processWebhookEvent(tenantId: string, payload: Record<string, unknown>) {
  try {
    await connectDB()
    const data = payload.data as Record<string, unknown> | undefined
    const location = data?.location as Record<string, unknown> | undefined
    const device = data?.device as Record<string, unknown> | undefined
    const unifiDoorId = (location?.id ?? device?.location_id) as string | undefined
    if (!unifiDoorId) return

    const event = payload.event as string ?? ''
    const timestamp = new Date()
    const timestampSec = Math.floor(timestamp.getTime() / 1000)

    const tenant = await Tenant.findById(tenantId).select('unifiHost unifiApiKey').lean()
    const shouldResolveActor = event.startsWith('access.')
    const enrichedPayload = shouldResolveActor && tenant
      ? await resolveActorForWebhookEvent(
          { _id: tenant._id, unifiHost: tenant.unifiHost, unifiApiKey: tenant.unifiApiKey },
          payload,
          unifiDoorId,
          event,
          timestampSec
        )
      : payload

    await WebhookEvent.create({ tenantId, unifiDoorId, event, timestamp, payload: enrichedPayload })
  } catch (err) {
    console.error('[webhook] processWebhookEvent error:', (err as Error).message)
  }
}

export async function POST(req: Request, { params }: Params) {
  const { tenantId } = await params

  if (!isValidObjectId(tenantId)) {
    return new Response('Not found', { status: 404 })
  }

  const rawBody = await req.text()

  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('webhookSecret webhookConfigs').lean()
  const configuredSecrets = [
    ...(tenant?.webhookSecret ? [tenant.webhookSecret] : []),
    ...(
      Array.isArray((tenant as { webhookConfigs?: Array<{ secret?: string }> } | null)?.webhookConfigs)
        ? (((tenant as { webhookConfigs?: Array<{ secret?: string }> }).webhookConfigs ?? [])
            .map((w) => w.secret)
            .filter((s): s is string => typeof s === 'string' && s.length > 0))
        : []
    ),
  ]
  const uniqueSecrets = Array.from(new Set(configuredSecrets))
  if (!tenant || uniqueSecrets.length === 0) {
    return new Response('Not found', { status: 404 })
  }

  const sigHeader =
    req.headers.get('Signature') ??
    req.headers.get('x-signature') ??
    req.headers.get('x-unifi-signature') ??
    req.headers.get('x-ubnt-signature') ??
    ''
  const parts: Record<string, string> = {}
  for (const part of sigHeader.split(/,\s*/)) {
    const eq = part.indexOf('=')
    if (eq > 0) parts[part.slice(0, eq)] = part.slice(eq + 1)
  }
  const t = parts.t
  const v1 = parts.v1
  const hasStructuredSig = !!t && !!v1
  const hasAnySigHeader = sigHeader.trim().length > 0

  let signatureOk = false
  if (hasStructuredSig) {
    for (const secret of uniqueSecrets) {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(t as string)
        .update('.')
        .update(rawBody)
        .digest('hex')
      if (safeCompareHex(expected, v1 as string)) {
        signatureOk = true
        break
      }
    }
  } else if (hasAnySigHeader) {
    // Backward-compatible support for raw-signature headers from older controller variants.
    const rawCandidate =
      sigHeader.match(/[a-fA-F0-9]{64}/)?.[0] ??
      sigHeader.split(',')[0]?.trim() ??
      ''
    for (const secret of uniqueSecrets) {
      const expectedRaw = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex')
      if (safeCompareHex(expectedRaw, rawCandidate)) {
        signatureOk = true
        break
      }
    }
  }

  if (!signatureOk) {
    // Ignore unsigned internet noise; count only genuine signed validation failures.
    if (hasAnySigHeader) void recordWebhookDeliveryMetric(tenantId, 'signature_fail')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    void recordWebhookDeliveryMetric(tenantId, 'parse_fail')
    return new Response('Invalid payload', { status: 400 })
  }

  // Delivery succeeded at transport/auth level; process asynchronously after acking.
  void recordWebhookDeliveryMetric(tenantId, 'success')

  void processWebhookEvent(tenantId, payload)
  return new Response('OK', { status: 200 })
}
