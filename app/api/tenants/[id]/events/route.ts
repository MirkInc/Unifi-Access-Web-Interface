export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes; Vercel Hobby max

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import WebSocket from 'ws'
import https from 'https'

type Params = { params: { id: string } }

// Events from UniFi that carry door state changes
const DOOR_EVENTS = new Set([
  'access.data.device.location_update_v2',
  'access.data.v2.location.update',
  'access.data.device.update',
  'access.data.v2.device.update',
  'access.device.dps_status',
  'access.door.unlock',
  'access.data.device.remote_unlock',
  'access.data.device.lock_rule_update',
  'access.door.lock_rule',
  'access.door.lockdown',
  'access.door.lock',
  'access.door.remote_lock',
])

export async function GET(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as { id: string; role: string }
  const tenantId = params.id

  await connectDB()

  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === tenantId)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenant = await Tenant.findById(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const wsUrl = tenant.unifiHost.replace(/^http/, 'ws') + '/api/v1/developer/devices/notifications'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const agent = new https.Agent({ rejectUnauthorized: false })

      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${tenant.unifiApiKey}` },
        agent,
      })

      function send(event: string, data: unknown) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // client disconnected
        }
      }

      ws.on('open', () => {
        send('connected', { tenantId })
      })

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          const eventType: string = msg.event ?? msg.type ?? ''
          if (DOOR_EVENTS.has(eventType)) {
            send('door_update', msg)
          }
        } catch {
          // ignore malformed messages
        }
      })

      ws.on('error', (err) => {
        send('error', { message: err.message })
      })

      ws.on('close', () => {
        try { controller.close() } catch { /* already closed */ }
      })

      // Clean up when the browser disconnects
      req.signal.addEventListener('abort', () => {
        ws.close()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
