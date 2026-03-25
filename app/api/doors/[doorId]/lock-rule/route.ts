import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import WebhookEvent from '@/models/WebhookEvent'
import { clientForTenant } from '@/lib/unifi'

type Params = { params: Promise<{ doorId: string }> }
type LockRuleType = 'keep_lock' | 'keep_unlock' | 'custom' | 'reset' | 'lock_early'

// Determine which permission is needed for a given lock rule type
function requiredPermission(type: LockRuleType): keyof {
  canUnlock: boolean
  canEndLockSchedule: boolean
  canTempLock: boolean
  canEndTempLock: boolean
  canViewLogs: boolean
} {
  if (type === 'reset') return 'canEndTempLock'
  if (type === 'lock_early') return 'canEndLockSchedule'
  if (type === 'keep_lock' || type === 'custom') return 'canTempLock'
  // keep_unlock
  return 'canTempLock'
}

export async function PUT(req: Request, { params }: Params) {
  const { doorId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, interval } = body as { type: LockRuleType; interval?: number }

  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 })

  await connectDB()
  const door = await Door.findById(doorId)
  if (!door) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sessionUser = session.user as { id: string; role: string; name?: string }

  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const access = user.tenantAccess.find(
      (ta) => ta.tenantId.toString() === door.tenantId.toString()
    )
    const doorPerm = access?.doorPermissions.find(
      (dp) => dp.doorId.toString() === door._id.toString()
    )

    const perm = requiredPermission(type)
    if (!doorPerm?.[perm]) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
  }

  const tenant = await Tenant.findById(door.tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  try {
    const client = clientForTenant(tenant)
    const currentRule = type === 'reset'
      ? await client.getLockRule(door.unifiDoorId).catch(() => null)
      : null

    await client.setLockRule(door.unifiDoorId, type, interval)

    let portalEvent = 'portal.lock_rule.changed'
    if (type === 'keep_lock') portalEvent = 'portal.lockdown.start'
    else if (type === 'keep_unlock' || type === 'custom') portalEvent = 'portal.temp_unlock.start'
    else if (type === 'lock_early') portalEvent = 'portal.schedule.lock_early'
    else if (type === 'reset') {
      if (currentRule?.type === 'keep_lock') portalEvent = 'portal.lockdown.end'
      else if (currentRule?.type === 'keep_unlock' || currentRule?.type === 'custom') portalEvent = 'portal.temp_unlock.end'
      else portalEvent = 'portal.lock_rule.reset'
    }

    // Audit log for actions initiated from this portal
    WebhookEvent.create({
      tenantId: door.tenantId,
      unifiDoorId: door.unifiDoorId,
      event: portalEvent,
      timestamp: new Date(),
      payload: {
        source: 'portal',
        event: portalEvent,
        data: {
          actor: {
            id: sessionUser.id,
            name: sessionUser.name ?? 'Portal User',
            type: 'user',
          },
          location: {
            id: door.unifiDoorId,
            location_type: 'door',
            name: door.name,
          },
          object: {
            type,
            interval: typeof interval === 'number' ? interval : null,
            previous_type: currentRule?.type ?? null,
          },
        },
      },
    }).catch((err) => console.error('[portal-log] lock-rule audit write failed:', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: `Controller error: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
