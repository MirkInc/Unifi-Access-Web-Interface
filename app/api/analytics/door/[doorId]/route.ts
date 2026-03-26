import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import User from '@/models/User'
import { getAnalyticsOverview } from '@/lib/analytics'

type Params = { params: Promise<{ doorId: string }> }

export async function GET(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as { id: string; role: string }
  const { doorId } = await params

  const { searchParams } = new URL(req.url)
  const since = Number(searchParams.get('since') ?? 0)
  const until = Number(searchParams.get('until') ?? 0)
  if (!Number.isFinite(since) || !Number.isFinite(until) || since <= 0 || until <= 0 || since > until) {
    return NextResponse.json({ error: 'invalid since/until' }, { status: 400 })
  }

  await connectDB()
  const door = await Door.findById(doorId).select('tenantId').lean()
  if (!door) return NextResponse.json({ error: 'Door not found' }, { status: 404 })

  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id).lean()
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === door.tenantId.toString())
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const dp = access.doorPermissions.find((p) => p.doorId.toString() === doorId)
    if (!dp?.canViewAnalytics) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenant = await Tenant.findById(door.tenantId).select('timezone unifiHost unifiApiKey analyticsPrefs').lean()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const data = await getAnalyticsOverview(
    {
      _id: tenant._id,
      timezone: tenant.timezone,
      unifiHost: tenant.unifiHost,
      unifiApiKey: tenant.unifiApiKey,
      analyticsPrefs: tenant.analyticsPrefs,
    },
    { sinceTs: since, untilTs: until, doorIds: [doorId] }
  )

  return NextResponse.json(data)
}
