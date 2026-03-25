import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import WebhookEvent from '@/models/WebhookEvent'
import { clientForTenant } from '@/lib/unifi'

type Params = { params: { doorId: string } }

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const door = await Door.findById(params.doorId)
  if (!door) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sessionUser = session.user as { id: string; role: string; name?: string }

  // Check permission
  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const access = user.tenantAccess.find(
      (ta) => ta.tenantId.toString() === door.tenantId.toString()
    )
    const doorPerm = access?.doorPermissions.find(
      (dp) => dp.doorId.toString() === door._id.toString()
    )
    if (!doorPerm?.canUnlock) {
      return NextResponse.json({ error: 'No unlock permission' }, { status: 403 })
    }
  }

  const tenant = await Tenant.findById(door.tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  try {
    const client = clientForTenant(tenant)
    await client.unlockDoor(
      door.unifiDoorId,
      sessionUser.id,
      sessionUser.name ?? 'Portal User'
    )

    // Audit log for actions initiated from this portal
    WebhookEvent.create({
      tenantId: door.tenantId,
      unifiDoorId: door.unifiDoorId,
      event: 'portal.door.unlock',
      timestamp: new Date(),
      payload: {
        source: 'portal',
        event: 'portal.door.unlock',
        data: {
          actor: {
            id: sessionUser.id,
            name: sessionUser.name ?? 'Portal User',
            type: 'user',
          },
          location: {
            id: door.unifiDoorId,
            location_type: 'door',
            name: door.name,
          },
          object: {
            type: 'unlock',
          },
        },
      },
    }).catch((err) => console.error('[portal-log] unlock audit write failed:', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: `Controller error: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
