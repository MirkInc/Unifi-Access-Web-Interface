import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { UserAccessClient } from './UserAccessClient'

interface PageProps { params: { id: string } }

export default async function UserAccessPage({ params }: PageProps) {
  await connectDB()

  const [user, tenants] = await Promise.all([
    User.findById(params.id).select('-passwordHash').lean(),
    Tenant.find().sort({ name: 1 }).lean(),
  ])
  if (!user) notFound()

  // Get all active doors for all tenants
  const allDoors = await Door.find({ isActive: true }).sort({ name: 1 }).lean()

  // Map tenant -> doors
  const doorsByTenant: Record<string, { _id: string; name: string }[]> = {}
  for (const d of allDoors) {
    const tid = d.tenantId.toString()
    doorsByTenant[tid] = doorsByTenant[tid] ?? []
    doorsByTenant[tid].push({ _id: d._id.toString(), name: d.name })
  }

  // Normalize user's tenantAccess
  const tenantAccessMap: Record<string, Record<string, {
    canUnlock: boolean
    canEndLockSchedule: boolean
    canTempLock: boolean
    canEndTempLock: boolean
    canViewLogs: boolean
  }>> = {}

  for (const ta of user.tenantAccess) {
    const tid = ta.tenantId.toString()
    tenantAccessMap[tid] = {}
    for (const dp of ta.doorPermissions) {
      tenantAccessMap[tid][dp.doorId.toString()] = {
        canUnlock: dp.canUnlock,
        canEndLockSchedule: dp.canEndLockSchedule,
        canTempLock: dp.canTempLock,
        canEndTempLock: dp.canEndTempLock,
        canViewLogs: dp.canViewLogs,
      }
    }
  }

  return (
    <UserAccessClient
      user={{ _id: user._id.toString(), name: user.name, email: user.email, role: user.role, isActive: user.isActive ?? true, pendingEmail: user.pendingEmail ?? null }}
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
      doorsByTenant={doorsByTenant}
      initialAccess={tenantAccessMap}
    />
  )
}
