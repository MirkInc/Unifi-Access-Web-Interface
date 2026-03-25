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

// POST — register a new webhook
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

  let webhook: { id: string; secret: string; endpoint: string; events: string[] }
  try {
    webhook = await client.registerWebhook(tenant.name, endpoint, WEBHOOK_EVENTS)
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to register webhook: ${(err as Error).message}` },
      { status: 502 }
    )
  }

  tenant.webhookId = webhook.id
  tenant.webhookSecret = webhook.secret
  tenant.webhookBaseUrl = baseUrl
  await tenant.save()

  return NextResponse.json({ webhookId: webhook.id, webhookBaseUrl: baseUrl })
}

// DELETE — unregister webhook
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const tenant = await Tenant.findById(id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (tenant.webhookId) {
    const client = clientForTenant(tenant)
    try {
      await client.deleteWebhook(tenant.webhookId)
    } catch (err) {
      // Log but don't block — still clear the stored values
      console.error('[webhook] deleteWebhook error:', (err as Error).message)
    }
  }

  tenant.webhookId = null
  tenant.webhookSecret = null
  tenant.webhookBaseUrl = null
  await tenant.save()

  return NextResponse.json({ success: true })
}
