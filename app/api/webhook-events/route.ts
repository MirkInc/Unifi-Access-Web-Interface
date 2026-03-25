import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
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

function deriveLabel(event: string, payload: Record<string, unknown>): { label: string; sublabel?: string; statusType: StatusType } {
  const data = payload.data as Record<string, unknown> | undefined
  const actor = data?.actor as Record<string, unknown> | null | undefined
  const object = data?.object as Record<string, unknown> | undefined

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
          sublabel: 'Lockdown',
          statusType: value ? 'lockdown_on' : 'lockdown_off',
        }
      }
      if (mode === 'evacuation' || mode === 'evac') {
        return {
          label: value ? 'Evacuation Active' : 'Evacuation Cleared',
          sublabel: 'Evacuation',
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
      return { label: 'Temp Unlock Started', statusType: 'temp_unlock_on' }

    case 'access.temporary_unlock.end':
      return { label: 'Temp Unlock Ended', statusType: 'temp_unlock_off' }

    case 'access.unlock_schedule.activate':
      return { label: 'Schedule Active', statusType: 'schedule_on' }

    case 'access.unlock_schedule.deactivate':
      return { label: 'Schedule Deactivated', statusType: 'schedule_off' }

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

  const events = await WebhookEvent.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()

  const normalized: NormalizedEvent[] = events.map((e) => {
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
    }
  })

  return NextResponse.json(normalized)
}
