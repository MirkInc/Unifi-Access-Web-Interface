import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import WebhookEvent from '@/models/WebhookEvent'
import ActorCache from '@/models/ActorCache'
import { clientForTenant } from '@/lib/unifi'
import type { UnifiLogEntry } from '@/types'

export const dynamic = 'force-dynamic'

type Params = { params: { tenantId: string } }

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
  // Keep existing actor if webhook already has one
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

// Fire-and-forget: store the webhook event in MongoDB
async function processWebhookEvent(tenantId: string, payload: Record<string, unknown>) {
  try {
    await connectDB()
    const data = payload.data as Record<string, unknown> | undefined
    const location = data?.location as Record<string, unknown> | undefined
    const device = data?.device as Record<string, unknown> | undefined

    // Prefer data.location.id; fall back to data.device.location_id
    const unifiDoorId = (location?.id ?? device?.location_id) as string | undefined
    if (!unifiDoorId) return // can't associate without a door ID

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
  const { tenantId } = params

  // Read raw body for HMAC verification
  const rawBody = await req.text()

  // --- HMAC verification ---
  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('webhookSecret').lean()
  if (!tenant || !tenant.webhookSecret) {
    return new Response('Not found', { status: 404 })
  }

  const sigHeader = req.headers.get('Signature') ?? req.headers.get('x-signature') ?? ''

  // Format: "t=1695902233,v1=a7ea8840..." — split on comma with optional surrounding spaces
  const parts: Record<string, string> = {}
  for (const part of sigHeader.split(/,\s*/)) {
    const eq = part.indexOf('=')
    if (eq > 0) parts[part.slice(0, eq)] = part.slice(eq + 1)
  }
  const t = parts['t']
  const v1 = parts['v1']

  if (!t || !v1) {
    return new Response('Invalid signature', { status: 401 })
  }

  const expected = crypto
    .createHmac('sha256', tenant.webhookSecret)
    .update(t)
    .update('.')
    .update(rawBody)
    .digest('hex')

  const expectedBuf = Buffer.from(expected, 'hex')
  const receivedBuf = Buffer.from(v1, 'hex')

  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    return new Response('Invalid signature', { status: 401 })
  }

  // Respond immediately (5-second timeout)
  const payload = JSON.parse(rawBody) as Record<string, unknown>

  // Fire-and-forget — do not await
  processWebhookEvent(tenantId, payload).catch(console.error)

  return new Response('OK', { status: 200 })
}
