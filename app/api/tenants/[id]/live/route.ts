import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { clientForTenant } from '@/lib/unifi'

type Params = { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as { id: string; role: string }
  const tenantId = params.id

  await connectDB()

  // Verify access
  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === tenantId)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenant = await Tenant.findById(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cachedDoors = await Door.find({ tenantId, isActive: true }).lean()

  try {
    const client = clientForTenant(tenant)
    const [liveDoors, ...lockRules] = await Promise.all([
      client.getDoors(),
      ...cachedDoors.map((d) => client.getLockRule(d.unifiDoorId)),
    ])

    const liveMap = new Map(liveDoors.map((d) => [d.id, d]))

    const statuses = cachedDoors.map((d, i) => {
      const live = liveMap.get(d.unifiDoorId)
      return {
        id: d._id.toString(),
        lockStatus: live?.door_lock_relay_status ?? null,
        positionStatus: live?.door_position_status ?? null,
        isOnline: !!live,
        lockRule: lockRules[i] ?? null,
      }
    })

    return NextResponse.json(statuses)
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    )
  }
}
