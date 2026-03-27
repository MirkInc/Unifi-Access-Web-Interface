import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { getAnalyticsOverview } from '@/lib/analytics'
import { buildZip } from '@/lib/zip'

function csvEscape(value: string | number): string {
  const s = String(value ?? '')
  if (!/[",\n]/.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape((row[h] ?? '') as string | number)).join(','))
  }
  return lines.join('\n')
}

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

  const kpiRows = [{
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
  }]

  const preferenceRows = [{
    hide_unlocked_time: data.analyticsPreferences.hideUnlockedTime ? 'true' : 'false',
    hide_unauthorized_open_time: data.analyticsPreferences.hideUnauthorizedOpenTime ? 'true' : 'false',
  }]

  const busiestRows = data.busiestDoors.map((r) => ({
    door_id: r.doorId,
    door_name: r.doorName,
    total: r.total,
    granted: r.granted,
    denied: r.denied,
    denial_rate: r.denialRate,
  }))

  const byDayRows = data.denialByDay.map((r) => ({
    day: r.key,
    total: r.total,
    denied: r.denied,
    denial_rate: r.denialRate,
  }))

  const byHourRows = data.denialByHour.map((r) => ({
    hour: r.key,
    total: r.total,
    denied: r.denied,
    denial_rate: r.denialRate,
  }))

  const methodRows = data.methodMix.map((r) => ({
    method: r.method,
    count: r.count,
  }))

  const openCloseByDayRows = data.openCloseByDay.map((r) => ({
    day: r.key,
    opened: r.opened,
    closed: r.closed,
  }))

  const openCloseByHourRows = data.openCloseByHour.map((r) => ({
    hour: r.key,
    opened: r.opened,
    closed: r.closed,
  }))

  const unlockedByDayRows = data.unlockedByDay.map((r) => ({
    day: r.key,
    unlocked_seconds_estimated: r.unlockedSeconds,
    unlocked_minutes_estimated: Math.round(r.unlockedSeconds / 60),
  }))

  const unauthorizedByDayRows = data.unauthorizedOpenByDay.map((r) => ({
    day: r.key,
    unauthorized_open_seconds_estimated: r.unauthorizedOpenSeconds,
    unauthorized_open_minutes_estimated: Math.round(r.unauthorizedOpenSeconds / 60),
  }))

  const anomalyRows = data.anomalies.map((a) => ({
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

  const zip = buildZip([
    { name: 'kpi_summary.csv', content: toCsv(kpiRows) },
    { name: 'analytics_preferences.csv', content: toCsv(preferenceRows) },
    { name: 'busiest_doors.csv', content: toCsv(busiestRows) },
    { name: 'denial_by_day.csv', content: toCsv(byDayRows) },
    { name: 'denial_by_hour.csv', content: toCsv(byHourRows) },
    { name: 'open_close_by_day.csv', content: toCsv(openCloseByDayRows) },
    { name: 'open_close_by_hour.csv', content: toCsv(openCloseByHourRows) },
    { name: 'unlocked_by_day.csv', content: toCsv(unlockedByDayRows) },
    { name: 'unauthorized_open_by_day.csv', content: toCsv(unauthorizedByDayRows) },
    { name: 'method_mix.csv', content: toCsv(methodRows) },
    { name: 'anomalies.csv', content: toCsv(anomalyRows) },
  ])

  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="analytics-${tenant.name}.zip"`,
    },
  })
}
