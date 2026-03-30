export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { clientForTenant } from '@/lib/unifi'
import { DashboardClient } from '@/app/dashboard/DashboardClient'
import type { DoorStatus, UnifiDoor } from '@/types'

interface PageProps {
  params: Promise<{ tenantId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId } = await params
  if (!isValidObjectId(tenantId)) return { title: 'Console' }
  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('name').lean()
  if (!tenant) return { title: 'Console' }
  return { title: tenant.name }
}

export default async function TenantDashboardPage({ params }: PageProps) {
  const { tenantId } = await params
  if (!isValidObjectId(tenantId)) notFound()
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const sessionUser = session.user as { id: string; role: string; name?: string; email?: string }

  await connectDB()

  let accessibleTenantIds: string[] = []
  if (sessionUser.role === 'admin') {
    const allTenants = await Tenant.find().lean()
    accessibleTenantIds = allTenants.map((t) => t._id.toString())
  } else {
    const user = await User.findById(sessionUser.id).lean()
    if (!user) redirect('/login')
    accessibleTenantIds = user.tenantAccess.map((ta) => ta.tenantId.toString())
  }

  if (accessibleTenantIds.length === 0) redirect('/')
  if (!accessibleTenantIds.includes(tenantId)) redirect(`/${accessibleTenantIds[0]}`)

  const [tenants, selectedTenant] = await Promise.all([
    Tenant.find({ _id: { $in: accessibleTenantIds } }).select('name').lean(),
    Tenant.findById(tenantId).lean(),
  ])

  if (!selectedTenant) redirect('/')

  const cachedDoors = await Door.find({ tenantId, isActive: true })
    .sort({ name: 1 })
    .lean()

  let liveDoors: UnifiDoor[] = []
  let lockRules: (Awaited<ReturnType<ReturnType<typeof clientForTenant>['getLockRule']>>)[] = []
  let controllerError: string | null = null

  try {
    const client = clientForTenant(selectedTenant)
    const results = await Promise.all([
      client.getDoors(),
      ...cachedDoors.map((d) => client.getLockRule(d.unifiDoorId)),
    ])
    liveDoors = results[0] as UnifiDoor[]
    lockRules = results.slice(1) as typeof lockRules
  } catch (err) {
    controllerError = (err as Error).message
  }

  const liveMap = new Map(liveDoors.map((d) => [d.id, d]))

  let doorPermissions: Record<string, {
    canUnlock: boolean
    canEndLockSchedule: boolean
    canTempLock: boolean
    canEndTempLock: boolean
    canViewLogs: boolean
  }> = {}

  if (sessionUser.role === 'admin') {
    for (const d of cachedDoors) {
      doorPermissions[d._id.toString()] = {
        canUnlock: true, canEndLockSchedule: true,
        canTempLock: true, canEndTempLock: true, canViewLogs: true,
      }
    }
  } else {
    const user = await User.findById(sessionUser.id).lean()
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === tenantId)
    for (const dp of access?.doorPermissions ?? []) {
      doorPermissions[dp.doorId.toString()] = {
        canUnlock: dp.canUnlock,
        canEndLockSchedule: dp.canEndLockSchedule,
        canTempLock: dp.canTempLock,
        canEndTempLock: dp.canEndTempLock,
        canViewLogs: dp.canViewLogs,
      }
    }
  }

  const doorStatuses: DoorStatus[] = cachedDoors.map((d, i) => {
    const live = liveMap.get(d.unifiDoorId)
    return {
      id: d._id.toString(),
      unifiDoorId: d.unifiDoorId,
      tenantId,
      name: d.name,
      fullName: d.fullName,
      lockStatus: live?.door_lock_relay_status ?? null,
      positionStatus: live?.door_position_status ?? null,
      isOnline: !!live,
      lockRule: lockRules[i] ?? null,
    }
  })

  const visibleDoors = sessionUser.role === 'admin'
    ? doorStatuses
    : doorStatuses.filter((d) => d.id in doorPermissions)

  return (
    <DashboardClient
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
      currentTenantId={tenantId}
      tenantName={selectedTenant.name}
      doors={visibleDoors}
      doorPermissions={doorPermissions}
      controllerError={controllerError}
      userName={sessionUser.name ?? sessionUser.email ?? 'User'}
      isAdmin={sessionUser.role === 'admin'}
      timezone={selectedTenant.timezone || undefined}
      branding={{
        portalName: selectedTenant.branding?.portalName ?? '',
        logoUrl: selectedTenant.branding?.logoUrl ?? '',
        accentColor: selectedTenant.branding?.accentColor ?? '',
      }}
    />
  )
}
