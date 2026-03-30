import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { getAnalyticsOverview } from '@/lib/analytics'
import * as XLSX from 'xlsx'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as { role?: string }
  if (sessionUser.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const since = Number(searchParams.get('since') ?? 0)
  const until = Number(searchParams.get('until') ?? 0)
  const doorIds = (searchParams.get('doorIds') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  if (!Number.isFinite(since) || !Number.isFinite(until) || since <= 0 || until <= 0 || since > until) {
    return NextResponse.json({ error: 'invalid since/until' }, { status: 400 })
  }

  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('name timezone unifiHost unifiApiKey analyticsPrefs').lean()
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

  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    generated_at_utc: new Date().toISOString(),
    since_ts: since,
    until_ts: until,
    total: data.kpi.total,
    granted: data.kpi.granted,
    denied: data.kpi.denied,
    denial_rate: data.kpi.denialRate,
    door_opened: data.openCloseKpi.opened,
    door_closed: data.openCloseKpi.closed,
    unlocked_seconds_estimated: data.openCloseKpi.unlockedSeconds,
    unauthorized_open_seconds_estimated: data.openCloseKpi.unauthorizedOpenSeconds,
  }]), 'KPI Summary')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.busiestDoors.map((r) => ({
      door_id: r.doorId,
      door_name: r.doorName,
      total: r.total,
      granted: r.granted,
      denied: r.denied,
      denial_rate: r.denialRate,
    }))
  ), 'Busiest Doors')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.denialByDay.map((r) => ({ day: r.key, total: r.total, denied: r.denied, denial_rate: r.denialRate }))
  ), 'Denial by Day')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.denialByHour.map((r) => ({ hour: r.key, total: r.total, denied: r.denied, denial_rate: r.denialRate }))
  ), 'Denial by Hour')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.openCloseByDay.map((r) => ({ day: r.key, opened: r.opened, closed: r.closed }))
  ), 'Open-Close by Day')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.openCloseByHour.map((r) => ({ hour: r.key, opened: r.opened, closed: r.closed }))
  ), 'Open-Close by Hour')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.unlockedByDay.map((r) => ({
      day: r.key,
      unlocked_seconds_estimated: r.unlockedSeconds,
      unlocked_minutes_estimated: Math.round(r.unlockedSeconds / 60),
    }))
  ), 'Unlocked by Day')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.unauthorizedOpenByDay.map((r) => ({
      day: r.key,
      unauthorized_open_seconds_estimated: r.unauthorizedOpenSeconds,
      unauthorized_open_minutes_estimated: Math.round(r.unauthorizedOpenSeconds / 60),
    }))
  ), 'Unauthorized Open by Day')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.methodMix.map((r) => ({ method: r.method, count: r.count }))
  ), 'Method Mix')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.anomalies.map((a) => ({
      door_id: a.doorId,
      door_name: a.doorName,
      type: a.type,
      bucket: a.bucket,
      severity: a.severity,
      total: a.total,
      denied: a.denied,
      denial_rate: a.denialRate,
      baseline_rate: a.baselineRate,
      baseline_volume: a.baselineVolume,
      reason: a.reason,
    }))
  ), 'Anomalies')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    hide_unlocked_time: data.analyticsPreferences.hideUnlockedTime ? 'true' : 'false',
    hide_unauthorized_open_time: data.analyticsPreferences.hideUnauthorizedOpenTime ? 'true' : 'false',
  }]), 'Preferences')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="analytics-${tenant.name}.xlsx"`,
    },
  })
}
