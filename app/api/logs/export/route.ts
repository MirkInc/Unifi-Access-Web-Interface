import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as XLSX from 'xlsx'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import User from '@/models/User'
import WebhookEvent from '@/models/WebhookEvent'
import { clientForTenant } from '@/lib/unifi'
import type { UnifiLogEntry } from '@/types'

type ExportFilter = 'access' | 'door_position' | 'door_status'
type DoorStatusType =
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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const doorId = searchParams.get('doorId')
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const filter = (searchParams.get('filter') ?? 'access') as ExportFilter

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  await connectDB()
  const sessionUser = session.user as { id: string; role: string }

  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === tenantId)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (doorId) {
      const doorPerm = access.doorPermissions.find((dp) => dp.doorId.toString() === doorId)
      if (!doorPerm?.canViewLogs) return NextResponse.json({ error: 'No log permission for this door' }, { status: 403 })
    }
  }

  const tenant = await Tenant.findById(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  try {
    function eventTime(ts?: number): string {
      if (!ts) return ''
      const d = new Date(ts * 1000)
      const parts = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: tenant.timezone || 'UTC',
        timeZoneName: 'short',
      }).formatToParts(d)

      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
      return `${get('month')} ${get('day')}, ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`
    }

    function statusPillLabel(statusType: DoorStatusType): string {
      switch (statusType) {
        case 'open': return 'Open'
        case 'close': return 'Closed'
        case 'unlock': return 'Unlocked'
        case 'lockdown_on': return 'Lockdown'
        case 'lockdown_off': return 'Cleared'
        case 'evac_on': return 'Evacuation'
        case 'evac_off': return 'Cleared'
        case 'schedule_on': return 'Scheduled'
        case 'schedule_off': return 'Unscheduled'
        case 'temp_unlock_on': return 'Started'
        case 'temp_unlock_off': return 'Ended'
        default: return 'Event'
      }
    }

    function deriveDoorStatus(event: string, payload: Record<string, unknown>): { label: string; sublabel?: string; statusType: DoorStatusType } {
      const data = payload.data as Record<string, unknown> | undefined
      const actor = data?.actor as Record<string, unknown> | undefined
      const object = data?.object as Record<string, unknown> | undefined
      const actorName = (actor?.name as string | undefined)?.trim()

      switch (event) {
        case 'access.device.dps_status': {
          const status = String(object?.status ?? '').toLowerCase()
          if (status === 'open') return { label: 'Door Opened', statusType: 'open' }
          if (status === 'close' || status === 'closed') return { label: 'Door Closed', statusType: 'close' }
          return { label: `Door ${status || 'Status Change'}`, statusType: 'other' }
        }
        case 'access.door.unlock':
        case 'portal.door.unlock':
          return { label: 'Unlocked', sublabel: actorName ? `by ${actorName}` : undefined, statusType: 'unlock' }
        case 'portal.lockdown.start':
          return { label: 'Lockdown Active', sublabel: actorName ? `by ${actorName}` : undefined, statusType: 'lockdown_on' }
        case 'portal.lockdown.end':
          return { label: 'Lockdown Cleared', sublabel: actorName ? `by ${actorName}` : undefined, statusType: 'lockdown_off' }
        case 'portal.temp_unlock.start':
        case 'access.temporary_unlock.start':
          return { label: 'Temp Unlock', sublabel: actorName ? `by ${actorName}` : undefined, statusType: 'temp_unlock_on' }
        case 'portal.temp_unlock.end':
        case 'access.temporary_unlock.end':
          return { label: 'Temp Unlock', sublabel: actorName ? `Ended by ${actorName}` : undefined, statusType: 'temp_unlock_off' }
        case 'access.unlock_schedule.activate':
          return { label: 'Schedule Active', statusType: 'schedule_on' }
        case 'access.unlock_schedule.deactivate':
        case 'portal.schedule.lock_early':
          return { label: 'Schedule Deactivated', sublabel: actorName ? `by ${actorName}` : undefined, statusType: 'schedule_off' }
        default:
          return { label: event, statusType: 'other' }
      }
    }

    if (filter === 'door_status' || filter === 'door_position') {
      if (!doorId) return NextResponse.json({ error: 'doorId required for this export' }, { status: 400 })

      const door = await Door.findById(doorId).lean()
      if (!door) return NextResponse.json({ error: 'Door not found' }, { status: 404 })

      const timeFilter: Record<string, Date> = {}
      if (since) timeFilter.$gte = new Date(Number(since) * 1000)
      if (until) timeFilter.$lte = new Date(Number(until) * 1000)

      const query: Record<string, unknown> = { tenantId, unifiDoorId: door.unifiDoorId }
      if (Object.keys(timeFilter).length > 0) query.timestamp = timeFilter

      const events = await WebhookEvent.find(query).sort({ timestamp: -1 }).limit(5000).lean()
      const mapped = events.map((e) => {
        const payload = (e.payload ?? {}) as Record<string, unknown>
        const normalized = deriveDoorStatus(e.event, payload)
        return {
          Time: eventTime(Math.floor(e.timestamp.getTime() / 1000)),
          Door: door.name,
          Event: normalized.label,
          Detail: normalized.sublabel ?? '',
          Status: statusPillLabel(normalized.statusType),
          _statusType: normalized.statusType,
        }
      })

      const rows = filter === 'door_position'
        ? mapped.filter((r) => r._statusType === 'open' || r._statusType === 'close')
        : mapped

      const outRows = rows.map(({ _statusType: _ignore, ...row }) => row)
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(outRows)
      XLSX.utils.book_append_sheet(wb, ws, filter === 'door_position' ? 'Door Open Close' : 'Door Status')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      const suffix = filter === 'door_position' ? 'door-open-close' : 'door-status-all'
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${suffix}-${tenant.name}.xlsx"`,
        },
      })
    }

    const client = clientForTenant(tenant)

    // Resolve UniFi door ID if filtering by door
    let unifiDoorId: string | undefined
    if (doorId) {
      const door = await Door.findById(doorId)
      unifiDoorId = door?.unifiDoorId
    }

    const allLogs = await client.getLogs({
      topic: 'door_openings',
      since: since ? Number(since) : Math.floor(Date.now() / 1000) - 30 * 24 * 3600,
      until: until ? Number(until) : Math.floor(Date.now() / 1000),
      pageSize: 500,
    })

    const logs = unifiDoorId
      ? allLogs.filter((l) => l.event?.object_id === unifiDoorId)
      : allLogs

    function methodCode(log: UnifiLogEntry): string {
      const key = (log.event?.log_key ?? '').toLowerCase()
      const msg = (log.event?.display_message ?? '').toLowerCase()
      const provider = (log.authentication?.credential_provider ?? '').toLowerCase()
      const paren = (log.event?.display_message ?? '').match(/\(([^)]+)\)/)?.[1]?.trim().toUpperCase()

      if (paren) return paren
      if (provider === 'rex' || provider === 'motion' || key.includes('rex') || key.includes('motion')) return 'REN'
      if (provider === 'remote' || key.includes('remote') || msg.includes('remote')) return 'REMOTE'
      if (provider === 'pin' || key.includes('pin')) return 'PIN'
      if (provider === 'nfc' || provider === 'card' || key.includes('nfc') || key.includes('card')) return 'NFC'
      if (provider === 'ble' || provider === 'mobile' || key.includes('mobile') || key.includes('ble')) return 'BLE'
      if (provider === 'fingerprint' || key.includes('fingerprint') || key.includes('biometric')) return 'FP'
      if (provider === 'button' || key.includes('button')) return 'BUTTON'
      return 'UNKNOWN'
    }

    function actorLabel(log: UnifiLogEntry): string {
      const raw = log.actor?.display_name?.trim()
      if (raw && raw !== 'N/A') return raw

      const code = methodCode(log)
      if (code === 'REN' || code === 'REX') return 'Motion Sensor'
      if (code === 'REMOTE') return 'Remote'
      if (code === 'BUTTON') return 'Button'
      return 'System'
    }

    function resultText(log: UnifiLogEntry): string {
      const msg = (log.event?.display_message ?? log.event?.type ?? '').trim()
      // Drop trailing credential code e.g. "Access Granted (NFC)" -> "Access Granted"
      return msg.replace(/\s*\([^)]+\)\s*$/, '').trim()
    }

    const rows = logs.map((log) => ({
      Time: eventTime(log.event?.timestamp),
      User: actorLabel(log),
      Door: log.event?.object_name ?? '',
      Method: methodCode(log),
      Result: resultText(log),
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Access Logs')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="access-logs-${tenant.name}.xlsx"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Export error: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
