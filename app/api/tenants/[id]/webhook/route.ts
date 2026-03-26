import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { clientForTenant } from '@/lib/unifi'

type Params = { params: Promise<{ id: string }> }

const WEBHOOK_EVENTS = [
  'access.door.unlock',
  'access.device.dps_status',
  'access.device.emergency_status',
  'access.temporary_unlock.start',
  'access.temporary_unlock.end',
  'access.unlock_schedule.activate',
  'access.unlock_schedule.deactivate',
]

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') return null
  return session
}

// GET - list all controller webhooks for this site (includes external hooks)
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const tenant = await Tenant.findById(id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const client = clientForTenant(tenant)
    const hooks = await client.listWebhooks()
    const managedIds = new Set<string>([
      ...(Array.isArray((tenant as { webhookConfigs?: Array<{ id: string }> }).webhookConfigs)
        ? ((tenant as { webhookConfigs?: Array<{ id: string }> }).webhookConfigs ?? []).map((w) => w.id)
        : []),
      ...(tenant.webhookId ? [tenant.webhookId] : []),
    ])
    const webhooks = hooks.map((w) => {
      const wid = (w?.id as string | undefined) ?? ''
      return {
        id: wid,
        name: (w?.name as string | undefined) ?? '',
        endpoint: (w?.endpoint as string | undefined) ?? '',
        events: Array.isArray(w?.events) ? (w.events as string[]) : [],
        createdAt: (w?.created_at as string | undefined) ?? null,
        updatedAt: (w?.updated_at as string | undefined) ?? null,
        managedByPortal: wid !== '' && managedIds.has(wid),
      }
    })
    return NextResponse.json({ webhooks })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to list webhooks: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}

// POST - register a new portal webhook receiver for this site
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const baseUrl: string | undefined = body?.baseUrl
  if (!baseUrl) {
    return NextResponse.json({ error: 'baseUrl is required' }, { status: 400 })
  }

  await connectDB()
  const tenant = await Tenant.findById(id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const endpoint = `${baseUrl}/api/webhooks/unifi/${id}`
  const client = clientForTenant(tenant)

  // Remove duplicate hooks for identical endpoint only.
  try {
    const existing = await client.listWebhooks()
    const dupes = existing.filter((w) => (w?.endpoint as string | undefined) === endpoint)
    await Promise.all(
      dupes.map(async (w) => {
        const wid = (w?.id as string | undefined) ?? ''
        if (!wid) return
        try {
          await client.deleteWebhook(wid)
        } catch (err) {
          console.error('[webhook] duplicate deleteWebhook error:', (err as Error).message)
        }
      })
    )
  } catch (err) {
    console.error('[webhook] listWebhooks cleanup error:', (err as Error).message)
  }

  let webhook: { id: string; secret: string; endpoint: string; events: string[] }
  try {
    webhook = await client.registerWebhook(tenant.name, endpoint, WEBHOOK_EVENTS)
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to register webhook: ${(err as Error).message}` },
      { status: 502 }
    )
  }

  // Store only this portal-managed receiver; other external webhooks can coexist.
  const existingConfigs = Array.isArray((tenant as { webhookConfigs?: unknown[] }).webhookConfigs)
    ? ((tenant as { webhookConfigs?: Array<{ id: string; secret: string; baseUrl: string; endpoint: string; createdAt?: Date }> }).webhookConfigs ?? [])
    : []
  const withoutSameEndpoint = existingConfigs.filter((w) => w.endpoint !== endpoint && w.id !== webhook.id)
  const nextConfigs = [
    ...withoutSameEndpoint,
    {
      id: webhook.id,
      secret: webhook.secret,
      baseUrl,
      endpoint,
      createdAt: new Date(),
    },
  ]
  ;(tenant as { webhookConfigs?: typeof nextConfigs }).webhookConfigs = nextConfigs
  // Keep legacy single-webhook fields for backward compatibility with older code paths.
  tenant.webhookId = webhook.id
  tenant.webhookSecret = webhook.secret
  tenant.webhookBaseUrl = baseUrl
  await tenant.save()

  return NextResponse.json({ webhookId: webhook.id, webhookBaseUrl: baseUrl })
}

// DELETE - unregister a specific webhook (or current portal-managed one if omitted)
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const tenant = await Tenant.findById(id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(req.url)
  let requestedWebhookId = url.searchParams.get('webhookId') ?? ''
  if (!requestedWebhookId) {
    const body = await req.json().catch(() => null)
    requestedWebhookId = (body?.webhookId as string | undefined) ?? ''
  }

  const webhookIdToDelete = requestedWebhookId || tenant.webhookId || ''
  if (!webhookIdToDelete) {
    return NextResponse.json({ error: 'webhookId is required' }, { status: 400 })
  }

  const client = clientForTenant(tenant)
  try {
    await client.deleteWebhook(webhookIdToDelete)
  } catch (err) {
    // Log but don't block local cleanup for managed webhook metadata
    console.error('[webhook] deleteWebhook error:', (err as Error).message)
  }

  const existingConfigs = Array.isArray((tenant as { webhookConfigs?: unknown[] }).webhookConfigs)
    ? ((tenant as { webhookConfigs?: Array<{ id: string; secret: string; baseUrl: string; endpoint: string; createdAt?: Date }> }).webhookConfigs ?? [])
    : []
  const nextConfigs = existingConfigs.filter((w) => w.id !== webhookIdToDelete)
  ;(tenant as { webhookConfigs?: typeof nextConfigs }).webhookConfigs = nextConfigs

  if (tenant.webhookId && webhookIdToDelete === tenant.webhookId) {
    const fallback = nextConfigs[nextConfigs.length - 1] ?? null
    tenant.webhookId = fallback?.id ?? null
    tenant.webhookSecret = fallback?.secret ?? null
    tenant.webhookBaseUrl = fallback?.baseUrl ?? null
  }
  await tenant.save()

  return NextResponse.json({ success: true })
}
