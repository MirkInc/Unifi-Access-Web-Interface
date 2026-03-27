import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { clientForTenant } from '@/lib/unifi'
import { writeAudit } from '@/lib/audit'

type Params = { params: Promise<{ doorId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { doorId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const door = await Door.findById(doorId)
  if (!door) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sessionUser = session.user as { id: string; role: string }
  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const access = user.tenantAccess.find((ta) => ta.tenantId.toString() === door.tenantId.toString())
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const hasDoorAccess = access.doorPermissions.some((dp) => dp.doorId.toString() === door._id.toString())
    if (!hasDoorAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!door.scheduleId) {
    return NextResponse.json({ schedule: null })
  }

  const tenant = await Tenant.findById(door.tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  try {
    const schedule = await clientForTenant(tenant).getSchedule(door.scheduleId)
    return NextResponse.json({ schedule: schedule ?? null })
  } catch (err) {
    console.error('[/api/doors/schedule] UniFi error:', (err as Error).message)
    return NextResponse.json(
      { error: `Controller error: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}

export async function PUT(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sessionUser = session.user as { id?: string; name?: string; email?: string; role?: string }

  const { doorId } = await params
  const body = await req.json() as { scheduleId?: string | null; scheduleName?: string | null }

  await connectDB()
  const door = await Door.findById(doorId)
  if (!door) return NextResponse.json({ error: 'Door not found' }, { status: 404 })

  door.scheduleId = body.scheduleId ?? null
  door.scheduleName = body.scheduleName ?? null
  await door.save()

  await writeAudit({
    req,
    tenantId: door.tenantId.toString(),
    doorId: door._id.toString(),
    actorUserId: sessionUser.id,
    actorName: sessionUser.name ?? 'Admin',
    actorEmail: sessionUser.email,
    actorRole: sessionUser.role,
    action: 'door.schedule.update',
    entityType: 'door',
    entityId: door._id.toString(),
    outcome: 'success',
    message: `${body.scheduleId ? `Assigned schedule "${body.scheduleName}"` : 'Removed schedule'} for ${door.name}`,
    metadata: {
      scheduleId: door.scheduleId ?? null,
      scheduleName: door.scheduleName ?? null,
    },
  })

  return NextResponse.json({
    scheduleId: door.scheduleId,
    scheduleName: door.scheduleName,
  })
}
