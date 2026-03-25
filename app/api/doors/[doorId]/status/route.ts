import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { clientForTenant } from '@/lib/unifi'

type Params = { params: Promise<{ doorId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { doorId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const door = await Door.findById(doorId)
  if (!door) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify user has access to this door's tenant
  const sessionUser = session.user as { id: string; role: string }
  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const access = user.tenantAccess.find(
      (ta) => ta.tenantId.toString() === door.tenantId.toString()
    )
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenant = await Tenant.findById(door.tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  try {
    const client = clientForTenant(tenant)
    const [doors, lockRule] = await Promise.all([
      client.getDoors(),
      client.getLockRule(door.unifiDoorId),
    ])
    const live = doors.find((d) => d.id === door.unifiDoorId)

    return NextResponse.json({
      id: door._id.toString(),
      unifiDoorId: door.unifiDoorId,
      tenantId: door.tenantId.toString(),
      name: door.name,
      fullName: door.fullName,
      lockStatus: live?.door_lock_relay_status ?? null,
      positionStatus: live?.door_position_status ?? null,
      isOnline: !!live,
      lockRule,
    })
  } catch (err) {
    console.error('[/api/doors/status] UniFi error:', (err as Error).message)
    return NextResponse.json(
      { error: `Controller error: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
