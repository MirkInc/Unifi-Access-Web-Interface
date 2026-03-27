import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { getAnalyticsOverview } from '@/lib/analytics'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as { role?: string }
  if (sessionUser.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const since = Number(searchParams.get('since') ?? 0)
  const until = Number(searchParams.get('until') ?? 0)
  const doorIdsRaw = searchParams.get('doorIds') ?? ''
  const doorIds = doorIdsRaw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  if (!Number.isFinite(since) || !Number.isFinite(until) || since <= 0 || until <= 0 || since > until) {
    return NextResponse.json({ error: 'invalid since/until' }, { status: 400 })
  }

  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('timezone unifiHost unifiApiKey analyticsPrefs').lean()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const data = await getAnalyticsOverview(
    {
      _id: tenant._id,
      timezone: tenant.timezone,
      unifiHost: tenant.unifiHost,
      unifiApiKey: tenant.unifiApiKey,
      analyticsPrefs: tenant.analyticsPrefs,
    },
    { sinceTs: since, untilTs: until, doorIds: doorIds.length > 0 ? doorIds : undefined }
  )

  return NextResponse.json(data)
}
