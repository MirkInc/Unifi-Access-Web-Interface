import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import WebhookEvent from '@/models/WebhookEvent'

export const dynamic = 'force-dynamic'

type Params = { params: { tenantId: string } }

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

    await WebhookEvent.create({ tenantId, unifiDoorId, event, timestamp, payload })
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

  const sigHeader = req.headers.get('Signature') ?? ''
  // Format: "t=1695902233, v1=a7ea8840..."
  const parts: Record<string, string> = {}
  for (const part of sigHeader.split(', ')) {
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
