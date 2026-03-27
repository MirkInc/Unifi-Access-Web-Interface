import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { triggerTargetedBackfill, recomputeDailyAggregates } from '@/lib/analytics'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as { role?: string }
  if (sessionUser.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : ''
  const since = Number(body.since ?? 0)
  const until = Number(body.until ?? 0)
  const doorIds = Array.isArray(body.doorIds)
    ? body.doorIds.filter((v: unknown): v is string => typeof v === 'string' && !!v)
    : []

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  if (!Number.isFinite(since) || !Number.isFinite(until) || since <= 0 || until <= 0 || since > until) {
    return NextResponse.json({ error: 'invalid since/until' }, { status: 400 })
  }

  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('timezone unifiHost unifiApiKey').lean()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const doorQuery: Record<string, unknown> = { tenantId, isActive: true }
  if (doorIds.length > 0) doorQuery._id = { $in: doorIds }
  const doors = await Door.find(doorQuery).select('name unifiDoorId logsCachedThrough').lean()
  const typedDoors = doors.map((d) => ({
    _id: d._id,
    name: d.name,
    unifiDoorId: d.unifiDoorId,
    logsCachedThrough: d.logsCachedThrough ?? null,
  }))

  await triggerTargetedBackfill(
    {
      _id: tenant._id,
      timezone: tenant.timezone,
      unifiHost: tenant.unifiHost,
      unifiApiKey: tenant.unifiApiKey,
    },
    typedDoors,
    since,
    until,
    true
  )
  await recomputeDailyAggregates(
    {
      _id: tenant._id,
      timezone: tenant.timezone,
      unifiHost: tenant.unifiHost,
      unifiApiKey: tenant.unifiApiKey,
    },
    typedDoors,
    since,
    until
  )

  return NextResponse.json({ ok: true })
}
