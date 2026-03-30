import Door from '@/models/Door'
import LogCache from '@/models/LogCache'
import AnalyticsDaily from '@/models/AnalyticsDaily'
import WebhookEvent from '@/models/WebhookEvent'
import type { UnifiLogEntry } from '@/types'
import { classifyAccessMethod, isDeniedAccess, methodBucketLabel, type AccessMethodBucket } from '@/lib/accessLogClassification'
import { localDateKey, localTodayMidnight, backfillDoorLogs } from '@/lib/logCache'

export interface AnalyticsKpi {
  total: number
  granted: number
  denied: number
  denialRate: number
}

export interface DoorAnalyticsRow {
  doorId: string
  doorName: string
  total: number
  granted: number
  denied: number
  denialRate: number
}

export interface SeriesPoint {
  key: string
  total: number
  denied: number
  denialRate: number
}

export interface MethodMixEntry {
  method: string
  count: number
}

export interface AnomalyEntry {
  doorId: string
  doorName: string
  type: 'daily' | 'hourly'
  bucket: string
  severity: 'medium' | 'high'
  total: number
  denied: number
  denialRate: number
  baselineRate: number
  baselineVolume: number
  reason: string
}

export interface AnalyticsOverviewResult {
  kpi: AnalyticsKpi
  openCloseKpi: { opened: number; closed: number; unlockedSeconds: number; unauthorizedOpenSeconds: number }
  analyticsPreferences: {
    hideUnlockedTime: boolean
    hideUnauthorizedOpenTime: boolean
  }
  busiestDoors: DoorAnalyticsRow[]
  denialByDay: SeriesPoint[]
  denialByHour: SeriesPoint[]
  openCloseByDay: Array<{ key: string; opened: number; closed: number }>
  openCloseByHour: Array<{ key: string; opened: number; closed: number }>
  unlockedByDay: Array<{ key: string; unlockedSeconds: number }>
  unauthorizedOpenByDay: Array<{ key: string; unauthorizedOpenSeconds: number }>
  methodMix: MethodMixEntry[]
  anomalies: AnomalyEntry[]
}

type DoorLite = {
  _id: unknown
  name: string
  unifiDoorId: string
  logsCachedThrough?: Date | null
  oldestLogAt?: Date | null
}

type TenantLite = {
  _id: unknown
  timezone?: string
  unifiHost: string
  unifiApiKey: string
  analyticsPrefs?: {
    hideUnlockedTime?: boolean
    hideUnauthorizedOpenTime?: boolean
  }
}

function toDateKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function listDateKeys(sinceTs: number, untilTs: number, timezone: string): string[] {
  const keys = new Set<string>()
  const cur = new Date(sinceTs * 1000)
  cur.setUTCHours(12, 0, 0, 0)
  const end = new Date(untilTs * 1000)
  end.setUTCHours(12, 0, 0, 0)
  while (cur <= end) {
    keys.add(localDateKey(Math.floor(cur.getTime() / 1000), timezone))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  keys.add(localDateKey(sinceTs, timezone))
  keys.add(localDateKey(untilTs, timezone))
  return [...keys].sort()
}

function localHour(ts: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ts * 1000))
  let h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  if (h === 24) h = 0
  return Math.max(0, Math.min(23, h))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  const v = mean(values.map((x) => (x - m) ** 2))
  return Math.sqrt(v)
}

function toRate(denied: number, total: number): number {
  if (total <= 0) return 0
  return denied / total
}

function addDurationByDay(
  startTs: number,
  endTs: number,
  timezone: string,
  dayMap: Map<string, { seconds: number }>
): number {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return 0
  let cur = startTs
  let added = 0
  while (cur < endTs) {
    const dayKey = localDateKey(cur, timezone)
    const secondsToNextHour = 3600 - (cur % 3600)
    const segEnd = Math.min(endTs, cur + secondsToNextHour)
    const delta = Math.max(0, segEnd - cur)
    if (delta > 0) {
      const bucket = dayMap.get(dayKey) ?? { seconds: 0 }
      bucket.seconds += delta
      dayMap.set(dayKey, bucket)
      added += delta
    }
    cur = segEnd
  }
  return added
}

function subtractIntervals(
  segStart: number,
  segEnd: number,
  intervals: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = []
  if (segEnd <= segStart) return result
  let cur = segStart
  for (const iv of intervals) {
    if (iv.end <= cur) continue
    if (iv.start >= segEnd) break
    if (iv.start > cur) result.push({ start: cur, end: Math.min(iv.start, segEnd) })
    cur = Math.max(cur, iv.end)
    if (cur >= segEnd) break
  }
  if (cur < segEnd) result.push({ start: cur, end: segEnd })
  return result
}

function normalizeIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (intervals.length <= 1) return intervals
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end)
    } else {
      merged.push({ start: cur.start, end: cur.end })
    }
  }
  return merged
}

export async function triggerTargetedBackfill(
  tenant: TenantLite,
  doors: DoorLite[],
  sinceTs: number,
  untilTs: number,
  waitForCompletion = false
) {
  const tz = tenant.timezone || 'UTC'
  const todayMidnight = localTodayMidnight(tz)
  const todayMidnightTs = Math.floor(todayMidnight.getTime() / 1000)
  if (sinceTs >= todayMidnightTs) return

  const jobs: Promise<void>[] = []
  for (const door of doors) {
    const cachedThroughTs = door.logsCachedThrough
      ? Math.floor(door.logsCachedThrough.getTime() / 1000)
      : null
    const shouldBackfill =
      !cachedThroughTs ||
      cachedThroughTs < todayMidnightTs

    if (!shouldBackfill) continue

    const backfillSince = cachedThroughTs
      ? Math.max(cachedThroughTs, sinceTs)
      : sinceTs

    const job = backfillDoorLogs(
      { _id: door._id, unifiDoorId: door.unifiDoorId },
      {
        _id: tenant._id,
        unifiHost: tenant.unifiHost,
        unifiApiKey: tenant.unifiApiKey,
        timezone: tz,
      },
      'door_openings',
      backfillSince
    )
      .catch((err) => {
        console.error('[analytics] backfill error:', (err as Error).message)
      })
      .then(() => undefined)
    jobs.push(job)
  }

  if (waitForCompletion && jobs.length > 0) {
    await Promise.all(jobs)
  }
}

export async function recomputeDailyAggregates(
  tenant: TenantLite,
  doors: DoorLite[],
  sinceTs: number,
  untilTs: number
) {
  const tz = tenant.timezone || 'UTC'
  const dateKeys = listDateKeys(sinceTs, untilTs, tz)
  if (dateKeys.length === 0 || doors.length === 0) return

  const tenantId = String(tenant._id)
  const unifiDoorIds = doors.map((d) => d.unifiDoorId)
  const doorByUnifiId = new Map(doors.map((d) => [d.unifiDoorId, d]))

  const cacheRows = await LogCache.find({
    tenantId,
    topic: 'door_openings',
    unifiDoorId: { $in: unifiDoorIds },
    date: { $gte: dateKeys[0], $lte: dateKeys[dateKeys.length - 1] },
  }).lean()

  const ops: Array<{
    filter: { tenantId: string; doorId: string; date: string }
    set: Record<string, unknown>
  }> = []

  for (const row of cacheRows) {
    const door = doorByUnifiId.get(row.unifiDoorId as string)
    if (!door) continue
    const logs = ((row.events as unknown[]) ?? []) as UnifiLogEntry[]
    const hourlyGranted = Array(24).fill(0)
    const hourlyDenied = Array(24).fill(0)
    const methodCounts: Record<string, number> = {}
    let grantedCount = 0
    let deniedCount = 0

    for (const log of logs) {
      const ts = log.event?.timestamp
      if (!ts) continue
      const denied = isDeniedAccess(log)
      const h = localHour(ts, tz)
      if (denied) {
        deniedCount += 1
        hourlyDenied[h] += 1
      } else {
        grantedCount += 1
        hourlyGranted[h] += 1
      }
      const bucket = classifyAccessMethod(log)
      methodCounts[bucket] = (methodCounts[bucket] ?? 0) + 1
    }

    ops.push({
      filter: {
        tenantId,
        doorId: String(door._id),
        date: String(row.date),
      },
      set: {
        tenantId,
        doorId: String(door._id),
        unifiDoorId: door.unifiDoorId,
        date: String(row.date),
        totalEvents: grantedCount + deniedCount,
        grantedCount,
        deniedCount,
        methodCounts,
        hourlyGranted,
        hourlyDenied,
        lastComputedAt: new Date(),
      },
    })
  }

  if (ops.length === 0) return
  await Promise.all(
    ops.map((op) =>
      AnalyticsDaily.findOneAndUpdate(op.filter, { $set: op.set }, { upsert: true })
    )
  )
}

export async function getAnalyticsOverview(
  tenant: TenantLite,
  opts: {
    sinceTs: number
    untilTs: number
    doorIds?: string[]
  }
): Promise<AnalyticsOverviewResult> {
  const tz = tenant.timezone || 'UTC'
  const tenantId = String(tenant._id)
  const doorQuery: Record<string, unknown> = { tenantId, isActive: true }
  if (opts.doorIds && opts.doorIds.length > 0) doorQuery._id = { $in: opts.doorIds }
  const doors = (await Door.find(doorQuery).select('name unifiDoorId logsCachedThrough').lean()) as unknown as DoorLite[]
  if (doors.length === 0) {
    return {
      kpi: { total: 0, granted: 0, denied: 0, denialRate: 0 },
      openCloseKpi: { opened: 0, closed: 0, unlockedSeconds: 0, unauthorizedOpenSeconds: 0 },
      analyticsPreferences: {
        hideUnlockedTime: tenant.analyticsPrefs?.hideUnlockedTime !== false,
        hideUnauthorizedOpenTime: tenant.analyticsPrefs?.hideUnauthorizedOpenTime !== false,
      },
      busiestDoors: [],
      denialByDay: [],
      denialByHour: [],
      openCloseByDay: [],
      openCloseByHour: [],
      unlockedByDay: [],
      unauthorizedOpenByDay: [],
      methodMix: [],
      anomalies: [],
    }
  }

  await triggerTargetedBackfill(tenant, doors, opts.sinceTs, opts.untilTs)
  await recomputeDailyAggregates(tenant, doors, opts.sinceTs, opts.untilTs)

  const sinceKey = localDateKey(opts.sinceTs, tz)
  const untilKey = localDateKey(opts.untilTs, tz)
  const doorIds = doors.map((d) => String(d._id))
  const doorNameById = new Map(doors.map((d) => [String(d._id), d.name]))

  const rows = await AnalyticsDaily.find({
    tenantId,
    doorId: { $in: doorIds },
    date: { $gte: sinceKey, $lte: untilKey },
  }).lean()

  const openCloseEvents = await WebhookEvent.find({
    tenantId,
    unifiDoorId: { $in: doors.map((d) => d.unifiDoorId) },
    event: 'access.device.dps_status',
    timestamp: {
      $gte: new Date(opts.sinceTs * 1000),
      $lte: new Date(opts.untilTs * 1000),
    },
  })
    .select('timestamp payload unifiDoorId')
    .sort({ timestamp: 1 })
    .lean()

  const unlockStateEvents = await WebhookEvent.find({
    tenantId,
    unifiDoorId: { $in: doors.map((d) => d.unifiDoorId) },
    event: {
      $in: [
        'access.temporary_unlock.start',
        'access.temporary_unlock.end',
        'portal.temp_unlock.start',
        'portal.temp_unlock.end',
        'access.unlock_schedule.activate',
        'access.unlock_schedule.deactivate',
        'portal.schedule.lock_early',
      ],
    },
    timestamp: {
      $gte: new Date((opts.sinceTs - (7 * 86400)) * 1000),
      $lte: new Date(opts.untilTs * 1000),
    },
  })
    .select('timestamp payload event unifiDoorId')
    .sort({ timestamp: 1 })
    .lean()

  const baselineStart = new Date(opts.sinceTs * 1000)
  baselineStart.setUTCDate(baselineStart.getUTCDate() - 28)
  const baselineStartKey = toDateKeyUTC(baselineStart)
  const baselineEnd = new Date(opts.sinceTs * 1000 - 1)
  const baselineEndKey = toDateKeyUTC(baselineEnd)

  const baselineRows = await AnalyticsDaily.find({
    tenantId,
    doorId: { $in: doorIds },
    date: { $gte: baselineStartKey, $lte: baselineEndKey },
  }).lean()

  let total = 0
  let granted = 0
  let denied = 0
  const methodCounts: Record<string, number> = {}
  const byDay = new Map<string, { total: number; denied: number }>()
  const byHour = Array.from({ length: 24 }, () => ({ total: 0, denied: 0 }))
  const openCloseByDayMap = new Map<string, { opened: number; closed: number }>()
  const unlockedByDaySecondsMap = new Map<string, { seconds: number }>()
  const unauthorizedByDaySecondsMap = new Map<string, { seconds: number }>()
  const openCloseByHourArr = Array.from({ length: 24 }, () => ({ opened: 0, closed: 0 }))
  const byDoor = new Map<string, { total: number; denied: number; granted: number }>()

  for (const row of rows) {
    const t = Number(row.totalEvents ?? 0)
    const g = Number(row.grantedCount ?? 0)
    const d = Number(row.deniedCount ?? 0)
    total += t
    granted += g
    denied += d

    const doorId = String(row.doorId)
    const doorAgg = byDoor.get(doorId) ?? { total: 0, denied: 0, granted: 0 }
    doorAgg.total += t
    doorAgg.denied += d
    doorAgg.granted += g
    byDoor.set(doorId, doorAgg)

    const day = String(row.date)
    const dayAgg = byDay.get(day) ?? { total: 0, denied: 0 }
    dayAgg.total += t
    dayAgg.denied += d
    byDay.set(day, dayAgg)

    const hg = ((row.hourlyGranted as unknown as number[]) ?? Array(24).fill(0)).slice(0, 24)
    const hd = ((row.hourlyDenied as unknown as number[]) ?? Array(24).fill(0)).slice(0, 24)
    for (let i = 0; i < 24; i++) {
      byHour[i].total += (hg[i] ?? 0) + (hd[i] ?? 0)
      byHour[i].denied += hd[i] ?? 0
    }

    const methods = (row.methodCounts ?? {}) as Record<string, number>
    for (const [bucket, count] of Object.entries(methods)) {
      methodCounts[bucket] = (methodCounts[bucket] ?? 0) + Number(count ?? 0)
    }
  }

  let opened = 0
  let closed = 0
  let unlockedSeconds = 0
  let unauthorizedOpenSeconds = 0
  for (const evt of openCloseEvents) {
    const payload = (evt.payload ?? {}) as Record<string, unknown>
    const data = payload.data as Record<string, unknown> | undefined
    const object = data?.object as Record<string, unknown> | undefined
    const status = String(object?.status ?? '').toLowerCase()
    const ts = Math.floor(new Date(evt.timestamp).getTime() / 1000)
    const dayKey = localDateKey(ts, tz)
    const hour = localHour(ts, tz)
    const bucket = openCloseByDayMap.get(dayKey) ?? { opened: 0, closed: 0 }
    if (status === 'open') {
      opened += 1
      bucket.opened += 1
      openCloseByHourArr[hour].opened += 1
    } else if (status === 'close' || status === 'closed') {
      closed += 1
      bucket.closed += 1
      openCloseByHourArr[hour].closed += 1
    }
    openCloseByDayMap.set(dayKey, bucket)
  }

  const activeByDoor = new Map<string, { startedAt: number; mode: 'temp' | 'schedule' }>()
  const unlockedIntervalsByDoor = new Map<string, Array<{ start: number; end: number }>>()
  for (const evt of unlockStateEvents) {
    const eventName = String(evt.event ?? '')
    const unifiDoorId = String(evt.unifiDoorId ?? '')
    const ts = Math.floor(new Date(evt.timestamp).getTime() / 1000)
    const payload = (evt.payload ?? {}) as Record<string, unknown>
    const data = payload.data as Record<string, unknown> | undefined
    const object = data?.object as Record<string, unknown> | undefined
    const ruleType = String(object?.type ?? '').toLowerCase()

    const isTempStart = eventName === 'access.temporary_unlock.start' || eventName === 'portal.temp_unlock.start'
    const isScheduleStart = eventName === 'access.unlock_schedule.activate'
    const isTempEnd = eventName === 'access.temporary_unlock.end' || eventName === 'portal.temp_unlock.end'
    const isScheduleEnd = eventName === 'access.unlock_schedule.deactivate' || eventName === 'portal.schedule.lock_early'

    if (isTempStart) {
      activeByDoor.set(unifiDoorId, { startedAt: ts, mode: 'temp' })
      continue
    }
    if (isScheduleStart) {
      activeByDoor.set(unifiDoorId, { startedAt: ts, mode: 'schedule' })
      continue
    }

    if (isTempEnd) {
      // ignore synthetic lockdown transitions encoded as temporary_unlock.end
      if (ruleType === 'keep_lock' || ruleType === 'reset') continue
    }

    if (isTempEnd || isScheduleEnd) {
      const active = activeByDoor.get(unifiDoorId)
      if (!active) continue
      const boundedStart = Math.max(active.startedAt, opts.sinceTs)
      const boundedEnd = Math.min(ts, opts.untilTs)
      if (boundedEnd > boundedStart) {
        const list = unlockedIntervalsByDoor.get(unifiDoorId) ?? []
        list.push({ start: boundedStart, end: boundedEnd })
        unlockedIntervalsByDoor.set(unifiDoorId, list)
      }
      activeByDoor.delete(unifiDoorId)
    }
  }

  for (const [doorId, active] of activeByDoor.entries()) {
    const boundedStart = Math.max(active.startedAt, opts.sinceTs)
    const boundedEnd = opts.untilTs
    if (boundedEnd > boundedStart) {
      const list = unlockedIntervalsByDoor.get(doorId) ?? []
      list.push({ start: boundedStart, end: boundedEnd })
      unlockedIntervalsByDoor.set(doorId, list)
    }
  }

  for (const [doorId, intervals] of unlockedIntervalsByDoor.entries()) {
    const normalized = normalizeIntervals(intervals)
    unlockedIntervalsByDoor.set(doorId, normalized)
    for (const iv of normalized) {
      unlockedSeconds += addDurationByDay(iv.start, iv.end, tz, unlockedByDaySecondsMap)
    }
  }

  const openStartByDoor = new Map<string, number>()
  for (const evt of openCloseEvents) {
    const unifiDoorId = String(evt.unifiDoorId ?? '')
    if (!unifiDoorId) continue
    const payload = (evt.payload ?? {}) as Record<string, unknown>
    const data = payload.data as Record<string, unknown> | undefined
    const object = data?.object as Record<string, unknown> | undefined
    const status = String(object?.status ?? '').toLowerCase()
    const ts = Math.floor(new Date(evt.timestamp).getTime() / 1000)

    if (status === 'open') {
      if (!openStartByDoor.has(unifiDoorId)) openStartByDoor.set(unifiDoorId, ts)
      continue
    }
    if (!(status === 'close' || status === 'closed')) continue
    const startTs = openStartByDoor.get(unifiDoorId)
    if (!startTs) continue
    openStartByDoor.delete(unifiDoorId)

    const segStart = Math.max(startTs, opts.sinceTs)
    const segEnd = Math.min(ts, opts.untilTs)
    if (segEnd <= segStart) continue
    const unlockedIntervals = unlockedIntervalsByDoor.get(unifiDoorId) ?? []
    const unauthorizedSegments = subtractIntervals(segStart, segEnd, unlockedIntervals)
    for (const seg of unauthorizedSegments) {
      unauthorizedOpenSeconds += addDurationByDay(seg.start, seg.end, tz, unauthorizedByDaySecondsMap)
    }
  }

  for (const [unifiDoorId, startTs] of openStartByDoor.entries()) {
    const segStart = Math.max(startTs, opts.sinceTs)
    const segEnd = opts.untilTs
    if (segEnd <= segStart) continue
    const unlockedIntervals = unlockedIntervalsByDoor.get(unifiDoorId) ?? []
    const unauthorizedSegments = subtractIntervals(segStart, segEnd, unlockedIntervals)
    for (const seg of unauthorizedSegments) {
      unauthorizedOpenSeconds += addDurationByDay(seg.start, seg.end, tz, unauthorizedByDaySecondsMap)
    }
  }

  const busiestDoors: DoorAnalyticsRow[] = [...byDoor.entries()]
    .map(([doorId, agg]) => ({
      doorId,
      doorName: doorNameById.get(doorId) ?? 'Door',
      total: agg.total,
      granted: agg.granted,
      denied: agg.denied,
      denialRate: toRate(agg.denied, agg.total),
    }))
    .sort((a, b) => b.total - a.total)

  const denialByDay: SeriesPoint[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, agg]) => ({
      key,
      total: agg.total,
      denied: agg.denied,
      denialRate: toRate(agg.denied, agg.total),
    }))

  const denialByHour: SeriesPoint[] = byHour.map((agg, hour) => ({
    key: `${String(hour).padStart(2, '0')}:00`,
    total: agg.total,
    denied: agg.denied,
    denialRate: toRate(agg.denied, agg.total),
  }))

  const openCloseByDay = [...openCloseByDayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, agg]) => ({ key, opened: agg.opened, closed: agg.closed }))

  const openCloseByHour = openCloseByHourArr.map((agg, hour) => ({
    key: `${String(hour).padStart(2, '0')}:00`,
    opened: agg.opened,
    closed: agg.closed,
  }))

  const unlockedByDay = [...unlockedByDaySecondsMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, agg]) => ({ key, unlockedSeconds: agg.seconds }))

  const unauthorizedOpenByDay = [...unauthorizedByDaySecondsMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, agg]) => ({ key, unauthorizedOpenSeconds: agg.seconds }))

  const methodMix: MethodMixEntry[] = Object.entries(methodCounts)
    .map(([bucket, count]) => ({
      method: methodBucketLabel(bucket as AccessMethodBucket),
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const anomalies: AnomalyEntry[] = []
  const baselineByDoor = new Map<string, typeof baselineRows>()
  for (const row of baselineRows) {
    const key = String(row.doorId)
    const list = baselineByDoor.get(key) ?? []
    list.push(row)
    baselineByDoor.set(key, list)
  }

  for (const [doorId, cur] of byDoor.entries()) {
    const baseRows = baselineByDoor.get(doorId) ?? []
    const dayTotals = baseRows.map((r) => Number(r.totalEvents ?? 0))
    const dayRates = baseRows
      .map((r) => toRate(Number(r.deniedCount ?? 0), Number(r.totalEvents ?? 0)))
    const baselineVolume = mean(dayTotals)
    const baselineRate = mean(dayRates)
    const baselineRateStd = stdDev(dayRates)

    const currentRate = toRate(cur.denied, cur.total)
    const rateCond = cur.denied >= 5 && currentRate >= baselineRate + (2 * baselineRateStd)
    const volumeCond = baselineVolume > 0 && cur.total >= 3 * baselineVolume
    if (cur.total >= 20 && (rateCond || volumeCond)) {
      anomalies.push({
        doorId,
        doorName: doorNameById.get(doorId) ?? 'Door',
        type: 'daily',
        bucket: `${sinceKey}..${untilKey}`,
        severity: rateCond && volumeCond ? 'high' : 'medium',
        total: cur.total,
        denied: cur.denied,
        denialRate: currentRate,
        baselineRate,
        baselineVolume,
        reason: rateCond && volumeCond
          ? 'Denied rate and volume significantly above baseline'
          : rateCond
          ? 'Denied rate significantly above baseline'
          : 'Volume significantly above baseline',
      })
    }

    const currentHours = Array.from({ length: 24 }, () => ({ total: 0, denied: 0 }))
    const doorRows = rows.filter((r) => String(r.doorId) === doorId)
    for (const r of doorRows) {
      const hg = ((r.hourlyGranted as unknown as number[]) ?? Array(24).fill(0)).slice(0, 24)
      const hd = ((r.hourlyDenied as unknown as number[]) ?? Array(24).fill(0)).slice(0, 24)
      for (let i = 0; i < 24; i++) {
        currentHours[i].total += (hg[i] ?? 0) + (hd[i] ?? 0)
        currentHours[i].denied += hd[i] ?? 0
      }
    }
    const baselineHours = Array.from({ length: 24 }, () => ({ totals: [] as number[], rates: [] as number[] }))
    for (const r of baseRows) {
      const hg = ((r.hourlyGranted as unknown as number[]) ?? Array(24).fill(0)).slice(0, 24)
      const hd = ((r.hourlyDenied as unknown as number[]) ?? Array(24).fill(0)).slice(0, 24)
      for (let i = 0; i < 24; i++) {
        const t = (hg[i] ?? 0) + (hd[i] ?? 0)
        baselineHours[i].totals.push(t)
        baselineHours[i].rates.push(toRate(hd[i] ?? 0, t))
      }
    }
    for (let i = 0; i < 24; i++) {
      const curHour = currentHours[i]
      if (curHour.total < 20) continue
      const hourBaselineVolume = mean(baselineHours[i].totals)
      const hourBaselineRate = mean(baselineHours[i].rates)
      const hourBaselineStd = stdDev(baselineHours[i].rates)
      const curHourRate = toRate(curHour.denied, curHour.total)
      const hourRateCond = curHour.denied >= 5 && curHourRate >= hourBaselineRate + 2 * hourBaselineStd
      const hourVolumeCond = hourBaselineVolume > 0 && curHour.total >= 3 * hourBaselineVolume
      if (!(hourRateCond || hourVolumeCond)) continue
      anomalies.push({
        doorId,
        doorName: doorNameById.get(doorId) ?? 'Door',
        type: 'hourly',
        bucket: `${String(i).padStart(2, '0')}:00`,
        severity: hourRateCond && hourVolumeCond ? 'high' : 'medium',
        total: curHour.total,
        denied: curHour.denied,
        denialRate: curHourRate,
        baselineRate: hourBaselineRate,
        baselineVolume: hourBaselineVolume,
        reason: hourRateCond && hourVolumeCond
          ? 'Hourly denied rate and volume significantly above baseline'
          : hourRateCond
          ? 'Hourly denied rate significantly above baseline'
          : 'Hourly volume significantly above baseline',
      })
    }
  }

  anomalies.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1
    return b.denied - a.denied
  })

  return {
    kpi: {
      total,
      granted,
      denied,
      denialRate: toRate(denied, total),
    },
    openCloseKpi: { opened, closed, unlockedSeconds, unauthorizedOpenSeconds },
    analyticsPreferences: {
      hideUnlockedTime: tenant.analyticsPrefs?.hideUnlockedTime !== false,
      hideUnauthorizedOpenTime: tenant.analyticsPrefs?.hideUnauthorizedOpenTime !== false,
    },
    busiestDoors,
    denialByDay,
    denialByHour,
    openCloseByDay,
    openCloseByHour,
    unlockedByDay,
    unauthorizedOpenByDay,
    methodMix,
    anomalies: anomalies.slice(0, 100),
  }
}
