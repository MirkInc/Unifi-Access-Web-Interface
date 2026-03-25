import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import WebhookEvent from '@/models/WebhookEvent'

type StatusType =
  | 'open'
  | 'close'
  | 'unlock'
  | 'lockdown_on'
  | 'lockdown_off'
  | 'evac_on'
  | 'evac_off'
  | 'schedule_on'
  | 'schedule_off'
  | 'temp_unlock_on'
  | 'temp_unlock_off'
  | 'other'

interface NormalizedEvent {
  id: string
  event: string
  timestamp: number
  unifiDoorId: string
  doorName: string
  label: string
  sublabel?: string
  statusType: StatusType
}

interface WorkingEvent extends NormalizedEvent {
  payload: Record<string, unknown>
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDurationWords(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`)
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`)
  return parts.join(' ')
}

function formatClockTime(unixSeconds: number, timezone?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
  if (timezone) opts.timeZone = timezone
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-US', opts)
}

function extractConfiguredTempUnlockSeconds(payload: Record<string, unknown>): number | null {
  const data = payload.data as Record<string, unknown> | undefined
  const object = data?.object as Record<string, unknown> | undefined
  if (!object) return null

  const keysInSeconds = ['duration_seconds', 'seconds', 'duration_sec']
  for (const key of keysInSeconds) {
    const v = object[key]
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }

  const keysInMinutes = ['interval', 'duration_minutes', 'minutes', 'duration_min']
  for (const key of keysInMinutes) {
    const v = object[key]
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return Math.floor(n * 60)
  }

  // Some payloads may provide milliseconds
  const ms = object['duration_ms']
  const msNum = typeof ms === 'number' ? ms : Number(ms)
  if (Number.isFinite(msNum) && msNum > 0) return Math.floor(msNum / 1000)

  return null
}

function normalizeElapsedToConfigured(elapsedSeconds: number, configuredSeconds: number | null): number {
  if (!configuredSeconds) return elapsedSeconds
  // Webhook timestamps can differ by ~1-2 seconds due processing/rounding.
  // If elapsed is essentially equal to configured, display the configured value.
  const TOLERANCE_SECONDS = 2
  return Math.abs(elapsedSeconds - configuredSeconds) <= TOLERANCE_SECONDS
    ? configuredSeconds
    : elapsedSeconds
}

function getRuleType(payload: Record<string, unknown>): string {
  const data = payload.data as Record<string, unknown> | undefined
  const object = data?.object as Record<string, unknown> | undefined
  return String(object?.type ?? '').toLowerCase()
}

function getActorName(payload: Record<string, unknown>): string | null {
  const data = payload.data as Record<string, unknown> | undefined
  const actor = data?.actor as Record<string, unknown> | undefined
  const name = String(actor?.name ?? '').trim()
  return name || null
}

function isPortalEventName(event: string): boolean {
  return event.startsWith('portal.')
}

function dedupeEquivalentEvents(events: WorkingEvent[]): WorkingEvent[] {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp)
  const result: WorkingEvent[] = []
  const WINDOW_SECONDS = 3
  const DEDUPE_TYPES = new Set<StatusType>([
    'unlock',
    'lockdown_on',
    'lockdown_off',
    'temp_unlock_on',
    'temp_unlock_off',
    'schedule_off',
  ])

  for (const evt of sorted) {
    if (!DEDUPE_TYPES.has(evt.statusType)) {
      result.push(evt)
      continue
    }

    const actorName = getActorName(evt.payload)
    const keepExistingIdx = result.findIndex((kept) => {
      if (Math.abs(kept.timestamp - evt.timestamp) > WINDOW_SECONDS) return false
      if (kept.statusType !== evt.statusType) return false
      const sameLabel = kept.label === evt.label
      if (!sameLabel) return false
      return true
    })

    if (keepExistingIdx === -1) {
      result.push(evt)
      continue
    }

    const kept = result[keepExistingIdx]
    const keptActor = getActorName(kept.payload)
    const keptPortal = isPortalEventName(kept.event)
    const evtPortal = isPortalEventName(evt.event)

    // Prefer the richer record:
    // 1) has actor name
    // 2) portal source (contains actor reliably)
    const evtScore = (actorName ? 2 : 0) + (evtPortal ? 1 : 0)
    const keptScore = (keptActor ? 2 : 0) + (keptPortal ? 1 : 0)
    if (evtScore > keptScore) {
      result[keepExistingIdx] = evt
    }
  }

  return result.sort((a, b) => b.timestamp - a.timestamp)
}

function deriveLabel(event: string, payload: Record<string, unknown>): { label: string; sublabel?: string; statusType: StatusType } {
  const data = payload.data as Record<string, unknown> | undefined
  const actor = data?.actor as Record<string, unknown> | null | undefined
  const object = data?.object as Record<string, unknown> | undefined
  const actorName = actor?.name as string | undefined

  switch (event) {
    case 'access.door.unlock': {
      const actorName = actor?.name as string | undefined
      const authType = object?.authentication_type as string | undefined
      return {
        label: 'Unlocked',
        sublabel: actorName ?? authType ?? undefined,
        statusType: 'unlock',
      }
    }

    case 'access.device.dps_status': {
      const status = (object?.status as string | undefined)?.toLowerCase()
      if (status === 'open') {
        return { label: 'Door Opened', statusType: 'open' }
      }
      if (status === 'close' || status === 'closed') {
        return { label: 'Door Closed', statusType: 'close' }
      }
      return { label: `Door ${status ?? 'Status Change'}`, statusType: 'other' }
    }

    case 'access.device.emergency_status': {
      const mode = (object?.mode as string | undefined)?.toLowerCase()
      const value = object?.value as boolean | undefined
      if (mode === 'lockdown') {
        return {
          label: value ? 'Lockdown Active' : 'Lockdown Cleared',
          sublabel: actorName ? `by ${actorName}` : undefined,
          statusType: value ? 'lockdown_on' : 'lockdown_off',
        }
      }
      if (mode === 'evacuation' || mode === 'evac') {
        return {
          label: value ? 'Evacuation Active' : 'Evacuation Cleared',
          sublabel: actorName ? `by ${actorName}` : undefined,
          statusType: value ? 'evac_on' : 'evac_off',
        }
      }
      return {
        label: value ? 'Emergency Active' : 'Emergency Cleared',
        sublabel: mode ?? undefined,
        statusType: 'other',
      }
    }

    case 'access.temporary_unlock.start':
      return { label: 'Temp Unlock', statusType: 'temp_unlock_on' }

    case 'access.temporary_unlock.end':
      return { label: 'Temp Unlock', statusType: 'temp_unlock_off' }

    case 'access.unlock_schedule.activate':
      return { label: 'Schedule Active', statusType: 'schedule_on' }

    case 'access.unlock_schedule.deactivate':
      return { label: 'Schedule Deactivated', statusType: 'schedule_off' }

    case 'portal.door.unlock': {
      const actorName = getActorName(payload)
      return {
        label: 'Unlocked',
        sublabel: actorName ? `by ${actorName}` : 'from Portal',
        statusType: 'unlock',
      }
    }

    case 'portal.lockdown.start': {
      const actorName = getActorName(payload)
      return {
        label: 'Lockdown Active',
        sublabel: actorName ? `by ${actorName}` : 'Lockdown',
        statusType: 'lockdown_on',
      }
    }

    case 'portal.lockdown.end': {
      const actorName = getActorName(payload)
      return {
        label: 'Lockdown Cleared',
        sublabel: actorName ? `by ${actorName}` : 'Lockdown',
        statusType: 'lockdown_off',
      }
    }

    case 'portal.temp_unlock.start': {
      const actorName = getActorName(payload)
      return {
        label: 'Temp Unlock',
        sublabel: actorName ? `by ${actorName}` : 'from Portal',
        statusType: 'temp_unlock_on',
      }
    }

    case 'portal.temp_unlock.end': {
      const actorName = getActorName(payload)
      return {
        label: 'Temp Unlock',
        sublabel: actorName ? `Ended by ${actorName}` : 'Ended',
        statusType: 'temp_unlock_off',
      }
    }

    case 'portal.schedule.lock_early': {
      const actorName = getActorName(payload)
      return {
        label: 'Schedule Ended Early',
        sublabel: actorName ? `by ${actorName}` : 'from Portal',
        statusType: 'schedule_off',
      }
    }

    case 'portal.lock_rule.reset': {
      const actorName = getActorName(payload)
      return {
        label: 'Rule Reset',
        sublabel: actorName ? `by ${actorName}` : 'from Portal',
        statusType: 'other',
      }
    }

    case 'portal.lock_rule.changed': {
      const actorName = getActorName(payload)
      return {
        label: 'Rule Updated',
        sublabel: actorName ? `by ${actorName}` : 'from Portal',
        statusType: 'other',
      }
    }

    default:
      return { label: event, statusType: 'other' }
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const doorId = searchParams.get('doorId')     // MongoDB door _id
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const limit = Math.min(Number(searchParams.get('limit') ?? '500'), 1000)

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  // Without a doorId we can't filter meaningfully — return empty
  if (!doorId) return NextResponse.json([])

  await connectDB()

  const sessionUser = session.user as { id: string; role: string }

  // Verify access (same pattern as /api/logs)
  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const access = user.tenantAccess.find(
      (ta: { tenantId: { toString(): string } }) => ta.tenantId.toString() === tenantId
    )
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const doorPerm = access.doorPermissions.find(
      (dp: { doorId: { toString(): string }; canViewLogs: boolean }) => dp.doorId.toString() === doorId
    )
    if (!doorPerm?.canViewLogs) {
      return NextResponse.json({ error: 'No log permission for this door' }, { status: 403 })
    }
  }

  // Look up the door to get unifiDoorId
  const door = await Door.findById(doorId).lean()
  if (!door) return NextResponse.json({ error: 'Door not found' }, { status: 404 })

  const { unifiDoorId } = door

  // Build time filter
  const timeFilter: Record<string, Date> = {}
  if (since) timeFilter.$gte = new Date(Number(since) * 1000)
  if (until) timeFilter.$lte = new Date(Number(until) * 1000)

  const query: Record<string, unknown> = { tenantId, unifiDoorId }
  if (Object.keys(timeFilter).length > 0) query.timestamp = timeFilter
  const tenant = await Tenant.findById(tenantId).select('timezone').lean()
  const tenantTimezone = (tenant?.timezone as string | undefined) || undefined

  const events = await WebhookEvent.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()

  const normalizedWithPayload: WorkingEvent[] = events.map((e) => {
    const payload = (e.payload ?? {}) as Record<string, unknown>
    const data = payload.data as Record<string, unknown> | undefined
    const location = data?.location as Record<string, unknown> | undefined
    const doorName = (location?.name as string | undefined) ?? door.name ?? ''

    const { label, sublabel, statusType } = deriveLabel(e.event, payload)

    return {
      id: e._id.toString(),
      event: e.event,
      timestamp: Math.floor(e.timestamp.getTime() / 1000),
      unifiDoorId: e.unifiDoorId,
      doorName,
      label,
      sublabel,
      statusType,
      payload,
    }
  })

  // Enrich temp-unlock rows:
  // - Start: show configured duration when present in payload
  // - End: show elapsed time since the most recent start
  const chronological = [...normalizedWithPayload].sort((a, b) => a.timestamp - b.timestamp)
  let latestTempUnlockStartTs: number | null = null
  let latestConfiguredSeconds: number | null = null
  let lockdownActive = false

  for (const evt of chronological) {
    const ruleType = getRuleType(evt.payload)

    // UniFi emits lockdown transitions as access.temporary_unlock.end with object.type:
    // - keep_lock: lockdown engaged
    // - reset: lockdown cleared (when previously active)
    if (evt.event === 'access.temporary_unlock.end' && ruleType === 'keep_lock') {
      const actorName = getActorName(evt.payload)
      evt.label = 'Lockdown Active'
      evt.sublabel = actorName ? `by ${actorName}` : undefined
      evt.statusType = 'lockdown_on'
      lockdownActive = true
      latestTempUnlockStartTs = null
      latestConfiguredSeconds = null
      continue
    }

    if (evt.event === 'access.temporary_unlock.end' && ruleType === 'reset' && lockdownActive) {
      const actorName = getActorName(evt.payload)
      evt.label = 'Lockdown Cleared'
      evt.sublabel = actorName ? `by ${actorName}` : undefined
      evt.statusType = 'lockdown_off'
      lockdownActive = false
      latestTempUnlockStartTs = null
      latestConfiguredSeconds = null
      continue
    }

    if ((evt.event === 'access.temporary_unlock.start' || evt.event === 'portal.temp_unlock.start') && evt.statusType === 'temp_unlock_on') {
      latestTempUnlockStartTs = evt.timestamp
      latestConfiguredSeconds = extractConfiguredTempUnlockSeconds(evt.payload)
      if (latestConfiguredSeconds) {
        const actorName = getActorName(evt.payload)
        if (actorName) {
          const untilTs = evt.timestamp + latestConfiguredSeconds
          evt.sublabel = `${actorName} temporarily left unlocked for ${formatDurationWords(latestConfiguredSeconds)} until ${formatClockTime(untilTs, tenantTimezone)}.`
        } else {
          evt.sublabel = `Started for ${formatDuration(latestConfiguredSeconds)} by UniFi Console`
        }
      }
      continue
    }

    if ((evt.event === 'access.temporary_unlock.end' || evt.event === 'portal.temp_unlock.end') && evt.statusType === 'temp_unlock_off') {
      if (latestTempUnlockStartTs !== null && evt.timestamp >= latestTempUnlockStartTs) {
        const elapsed = evt.timestamp - latestTempUnlockStartTs
        const displayElapsed = normalizeElapsedToConfigured(elapsed, latestConfiguredSeconds)
        const actorName = getActorName(evt.payload)
        evt.sublabel = actorName
          ? `Ended after ${formatDuration(displayElapsed)} by ${actorName}`
          : `Ended after ${formatDuration(displayElapsed)} by UniFi Console`
      } else if (latestConfiguredSeconds) {
        const actorName = getActorName(evt.payload)
        evt.sublabel = actorName
          ? `Ended after ${formatDuration(latestConfiguredSeconds)} by ${actorName}`
          : `Ended after ${formatDuration(latestConfiguredSeconds)} by UniFi Console`
      }
      latestTempUnlockStartTs = null
      latestConfiguredSeconds = null
    }
  }

  const deduped = dedupeEquivalentEvents(normalizedWithPayload)
  const normalized: NormalizedEvent[] = deduped.map(({ payload: _payload, ...evt }) => evt)

  return NextResponse.json(normalized)
}
