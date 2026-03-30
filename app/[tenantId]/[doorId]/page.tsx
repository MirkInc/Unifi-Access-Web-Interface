export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { clientForTenant } from '@/lib/unifi'
import { AppHeader } from '@/components/AppHeader'
import { DoorDetailClient } from '@/app/door/[doorId]/DoorDetailClient'
import type { DoorStatus } from '@/types'

interface PageProps {
  params: Promise<{ tenantId: string; doorId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId, doorId } = await params
  if (!isValidObjectId(tenantId) || !isValidObjectId(doorId)) return { title: 'Console | Door' }
  await connectDB()
  const door = await Door.findOne({ _id: doorId, tenantId }).select('name tenantId').lean()
  if (!door) return { title: 'Console | Door' }

  const tenant = await Tenant.findById(door.tenantId).select('name').lean()
  if (!tenant) return { title: `Console | ${door.name}` }
  return { title: `${tenant.name} | ${door.name}` }
}

export default async function TenantDoorDetailPage({ params }: PageProps) {
  const { tenantId, doorId } = await params
  if (!isValidObjectId(tenantId) || !isValidObjectId(doorId)) notFound()
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const sessionUser = session.user as { id: string; role: string }

  await connectDB()

  const door = await Door.findOne({ _id: doorId, tenantId }).lean()
  if (!door) notFound()

  let permissions = {
    canUnlock: false,
    canEndLockSchedule: false,
    canTempLock: false,
    canEndTempLock: false,
    canViewLogs: false,
    canViewAnalytics: false,
  }

  if (sessionUser.role === 'admin') {
    permissions = {
      canUnlock: true, canEndLockSchedule: true,
      canTempLock: true, canEndTempLock: true, canViewLogs: true, canViewAnalytics: true,
    }
  } else {
    const user = await User.findById(sessionUser.id).lean()
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === tenantId)
    const dp = access?.doorPermissions.find((p) => p.doorId.toString() === door._id.toString())
    if (!dp) redirect(`/${tenantId}`)
    permissions = {
      canUnlock: dp.canUnlock,
      canEndLockSchedule: dp.canEndLockSchedule,
      canTempLock: dp.canTempLock,
      canEndTempLock: dp.canEndTempLock,
      canViewLogs: dp.canViewLogs,
      canViewAnalytics: dp.canViewAnalytics === true,
    }
  }

  const tenant = await Tenant.findById(tenantId).lean()
  if (!tenant) notFound()

  let headerTenants: { _id: string; name: string }[] = []
  if (sessionUser.role === 'admin') {
    const all = await Tenant.find().sort({ name: 1 }).lean()
    headerTenants = all.map((t) => ({ _id: t._id.toString(), name: t.name }))
  } else {
    const user = await User.findById(sessionUser.id).lean()
    const ids = user?.tenantAccess.map((ta) => ta.tenantId) ?? []
    const accessible = await Tenant.find({ _id: { $in: ids } }).sort({ name: 1 }).lean()
    headerTenants = accessible.map((t) => ({ _id: t._id.toString(), name: t.name }))
  }

  const userName = (session.user as { name?: string }).name ?? ''

  let doorStatus: DoorStatus = {
    id: door._id.toString(),
    unifiDoorId: door.unifiDoorId,
    tenantId,
    name: door.name,
    fullName: door.fullName,
    lockStatus: null,
    positionStatus: null,
    isOnline: false,
    firstPersonInRequired: door.firstPersonInRequired === true,
  }
  let controllerError: string | null = null

  const client = clientForTenant(tenant)

  try {
    const [liveDoors, lockRule] = await Promise.all([
      client.getDoors(),
      client.getLockRule(door.unifiDoorId),
    ])
    const live = liveDoors.find((d) => d.id === door.unifiDoorId)
    if (live) {
      doorStatus = {
        ...doorStatus,
        lockStatus: live.door_lock_relay_status,
        positionStatus: live.door_position_status,
        isOnline: true,
        lockRule,
      }
    }
  } catch (err) {
    controllerError = (err as Error).message
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        tenants={headerTenants}
        currentTenantId={tenantId}
        userName={userName}
        isAdmin={sessionUser.role === 'admin'}
        branding={{
          portalName: tenant.branding?.portalName ?? '',
          logoUrl: tenant.branding?.logoUrl ?? '',
          accentColor: tenant.branding?.accentColor ?? '',
        }}
      />

      <DoorDetailClient
        door={doorStatus}
        permissions={permissions}
        controllerError={controllerError}
        timezone={tenant.timezone || undefined}
        doorName={door.name}
        backHref={`/${tenantId}`}
        analyticsHref={`/${tenantId}/${doorId}/analytics`}
        scheduleId={door.scheduleId ?? undefined}
        scheduleName={door.scheduleName ?? undefined}
        branding={{
          portalName: tenant.branding?.portalName ?? '',
          logoUrl: tenant.branding?.logoUrl ?? '',
          accentColor: tenant.branding?.accentColor ?? '',
        }}
      />
    </div>
  )
}
