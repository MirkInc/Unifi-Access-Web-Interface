import LogCache from '@/models/LogCache'
import Door from '@/models/Door'
import { clientForTenant } from '@/lib/unifi'

type TenantLike = { _id: unknown; unifiHost: string; unifiApiKey: string; timezone?: string }
type DoorLike = { _id: unknown; unifiDoorId: string }

/**
 * Returns "YYYY-MM-DD" for a unix timestamp in the given IANA timezone.
 * e.g. 1711414800 at "America/Chicago" → "2026-03-25"
 */
export function localDateKey(ts: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(new Date(ts * 1000))
}

/**
 * Returns the UTC Date corresponding to midnight of today in the given IANA timezone.
 * e.g. at 11 PM CDT (UTC-5) this returns 2026-03-26T05:00:00.000Z
 */
export function localTodayMidnight(timezone: string): Date {
  const now = new Date()
  const tz = timezone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  let hours = Number(parts.find(p => p.type === 'hour')!.value)
  const minutes = Number(parts.find(p => p.type === 'minute')!.value)
  const seconds = Number(parts.find(p => p.type === 'second')!.value)
  if (hours === 24) hours = 0 // some locales format midnight as "24"
  const msIntoDay = (hours * 3600 + minutes * 60 + seconds) * 1000
  return new Date(now.getTime() - msIntoDay - now.getMilliseconds())
}

/**
 * Returns all local date strings (YYYY-MM-DD) for complete past days
 * (before today in the tenant timezone) that fall within [sinceTs, untilTs].
 */
export function localPastDaysInRange(
  sinceTs: number,
  untilTs: number,
  tz: string,
  todayMidnight: Date
): string[] {
  const cutoffTs = Math.floor(todayMidnight.getTime() / 1000) - 1 // end of yesterday
  const effectiveUntil = Math.min(untilTs, cutoffTs)
  if (sinceTs > effectiveUntil) return []

  const dateStrings = new Set<string>()
  // Step through UTC noon values to cover all local days in the range.
  // Noon UTC is always in the same local calendar day for any realistic timezone.
  const cur = new Date(sinceTs * 1000)
  cur.setUTCHours(12, 0, 0, 0)
  while (Math.floor(cur.getTime() / 1000) <= effectiveUntil) {
    dateStrings.add(localDateKey(Math.floor(cur.getTime() / 1000), tz))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  // Always include the endpoint keys in case sinceTs/untilTs fall in edge hours
  dateStrings.add(localDateKey(sinceTs, tz))
  dateStrings.add(localDateKey(effectiveUntil, tz))

  // Remove today's key (we never cache today)
  const todayKey = localDateKey(Math.floor(todayMidnight.getTime() / 1000) + 3600, tz)
  dateStrings.delete(todayKey)

  return [...dateStrings]
}

/**
 * Fetches log history for a door from UniFi and writes it to LogCache.
 * Only caches complete past days (before today in tenant timezone).
 * Sets door.logsCachedThrough = today's midnight when done.
 *
 * @param sinceTs  Start of the range to fetch (unix seconds). Omit for full history.
 */
export async function backfillDoorLogs(
  door: DoorLike,
  tenant: TenantLike,
  topic = 'door_openings',
  sinceTs?: number
): Promise<void> {
  const tz = tenant.timezone || 'UTC'
  const todayMidnight = localTodayMidnight(tz)
  const untilTs = Math.floor(todayMidnight.getTime() / 1000) - 1 // end of yesterday

  if (sinceTs !== undefined && sinceTs > untilTs) return // nothing past to cache

  const client = clientForTenant(tenant as { unifiHost: string; unifiApiKey: string })
  const logs = await client.getLogs({ topic, since: sinceTs, until: untilTs, pageSize: 5000 })

  const tenantId = String(tenant._id)
  const { unifiDoorId } = door

  const filtered = logs.filter(
    l => l.event?.object_id === unifiDoorId || l.actor?.id === unifiDoorId
  )

  // Group by local date
  const byDay: Record<string, typeof filtered> = {}
  for (const log of filtered) {
    const ts = log.event?.timestamp
    if (!ts) continue
    const dateStr = localDateKey(ts, tz)
    byDay[dateStr] = byDay[dateStr] ?? []
    byDay[dateStr].push(log)
  }

  if (Object.keys(byDay).length > 0) {
    await Promise.all(
      Object.entries(byDay).map(([date, events]) =>
        LogCache.findOneAndUpdate(
          { tenantId, unifiDoorId, date, topic },
          { $set: { events, cachedAt: new Date() } },
          { upsert: true }
        )
      )
    )
  }

  // Compute the oldest event timestamp across all fetched events for this door
  let oldestTs: number | null = null
  for (const log of filtered) {
    const ts = log.event?.timestamp
    if (ts && (oldestTs === null || ts < oldestTs)) oldestTs = ts
  }

  // Mark cache current; use $min on oldestLogAt so it only ever moves earlier, never later
  const update: Record<string, unknown> = { $set: { logsCachedThrough: todayMidnight } }
  if (oldestTs !== null) update['$min'] = { oldestLogAt: new Date(oldestTs * 1000) }
  await Door.findByIdAndUpdate(door._id, update)
}
