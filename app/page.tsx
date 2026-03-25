export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import { clientForTenant } from '@/lib/unifi'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import type { UnifiDoor } from '@/types'
import { SiteManagerClient } from './SiteManagerClient'

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const sessionUser = session.user as { id: string; role: 'admin' | 'user'; name?: string; email?: string }
  await connectDB()

  let accessibleTenantIds: string[] = []
  let userTenantAccess: {
    tenantId: { toString(): string }
    doorPermissions: { doorId: { toString(): string } }[]
  }[] = []
  if (sessionUser.role === 'admin') {
    const allTenants = await Tenant.find().select('_id').lean()
    accessibleTenantIds = allTenants.map((t) => t._id.toString())
  } else {
    const user = await User.findById(sessionUser.id).lean()
    if (!user) redirect('/login')
    userTenantAccess = user.tenantAccess
    accessibleTenantIds = user.tenantAccess.map((ta) => ta.tenantId.toString())
  }

  if (accessibleTenantIds.length === 0) {
    return (
      <SiteManagerClient
        consoles={[]}
        tenants={[]}
        currentTenantId=""
        userName={sessionUser.name ?? sessionUser.email ?? 'User'}
        isAdmin={sessionUser.role === 'admin'}
        emptyMessage="No consoles assigned to your account. Contact your administrator."
      />
    )
  }

  const tenants = await Tenant.find({ _id: { $in: accessibleTenantIds } })
    .select('name unifiHost unifiApiKey timezone')
    .sort({ name: 1 })
    .lean()

  const cachedDoors = await Door.find({ tenantId: { $in: accessibleTenantIds }, isActive: true })
    .select('tenantId unifiDoorId')
    .lean()

  // Non-admin: restrict console-level counts to assigned doors only.
  const visibleDoorIdsByTenant = new Map<string, Set<string>>()
  if (sessionUser.role !== 'admin') {
    const assignedDoorIds = userTenantAccess.flatMap((ta) => ta.doorPermissions.map((dp) => dp.doorId.toString()))
    const assignedDoors = assignedDoorIds.length > 0
      ? await Door.find({ _id: { $in: assignedDoorIds }, isActive: true }).select('tenantId unifiDoorId').lean()
      : []

    for (const d of assignedDoors) {
      const tenantId = d.tenantId.toString()
      if (!visibleDoorIdsByTenant.has(tenantId)) visibleDoorIdsByTenant.set(tenantId, new Set<string>())
      visibleDoorIdsByTenant.get(tenantId)!.add(d.unifiDoorId)
    }
  }

  const cachedDoorCountByTenant = new Map<string, number>()
  for (const d of cachedDoors) {
    const tenantId = d.tenantId.toString()
    if (sessionUser.role !== 'admin') {
      const visible = visibleDoorIdsByTenant.get(tenantId)
      if (!visible || !visible.has(d.unifiDoorId)) continue
    }
    cachedDoorCountByTenant.set(tenantId, (cachedDoorCountByTenant.get(tenantId) ?? 0) + 1)
  }

  const consoles = await Promise.all(
    tenants.map(async (tenant) => {
      const tenantId = tenant._id.toString()
      const allowedDoorIds = sessionUser.role === 'admin'
        ? null
        : (visibleDoorIdsByTenant.get(tenantId) ?? new Set<string>())
      try {
        const liveDoors = await clientForTenant(tenant).getDoors()
        const visibleLiveDoors = allowedDoorIds
          ? liveDoors.filter((d: UnifiDoor) => allowedDoorIds.has(d.id))
          : liveDoors

        const warning = visibleLiveDoors.filter((d: UnifiDoor) => d.door_position_status === 'open' && d.door_lock_relay_status === 'lock').length
        const open = visibleLiveDoors.filter((d: UnifiDoor) => d.door_position_status === 'open').length
        const unlocked = visibleLiveDoors.filter((d: UnifiDoor) => d.door_lock_relay_status === 'unlock').length
        const locked = visibleLiveDoors.filter((d: UnifiDoor) => d.door_lock_relay_status === 'lock').length
        return {
          id: tenantId,
          name: tenant.name,
          host: tenant.unifiHost,
          timezone: tenant.timezone || undefined,
          isConnected: true,
          totalDoors: visibleLiveDoors.length,
          locked,
          unlocked,
          open,
          warning,
        }
      } catch (err) {
        return {
          id: tenantId,
          name: tenant.name,
          host: tenant.unifiHost,
          timezone: tenant.timezone || undefined,
          isConnected: false,
          totalDoors: cachedDoorCountByTenant.get(tenantId) ?? 0,
          locked: 0,
          unlocked: 0,
          open: 0,
          warning: 0,
          error: (err as Error).message,
        }
      }
    })
  )

  const cookieStore = cookies()
  const cookieTenantId = cookieStore.get('selectedTenant')?.value
  const currentTenantId = accessibleTenantIds.includes(cookieTenantId ?? '')
    ? cookieTenantId!
    : accessibleTenantIds[0]

  return (
    <SiteManagerClient
      consoles={consoles}
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
      currentTenantId={currentTenantId}
      userName={sessionUser.name ?? sessionUser.email ?? 'User'}
      isAdmin={sessionUser.role === 'admin'}
    />
  )
}
