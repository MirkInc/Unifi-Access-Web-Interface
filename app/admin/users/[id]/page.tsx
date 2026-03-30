import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import AppSetting from '@/models/AppSetting'
import { UserAccessClient } from './UserAccessClient'

interface PageProps { params: Promise<{ id: string }> }

export default async function UserAccessPage({ params }: PageProps) {
  const { id } = await params
  await connectDB()

  const [user, tenants, appSetting, allUsers] = await Promise.all([
    User.findById(id).select('-passwordHash').lean(),
    Tenant.find().sort({ name: 1 }).lean(),
    AppSetting.findOne({ key: 'global' }).select('portalUrls').lean(),
    User.find({ _id: { $ne: id } }).select('name email tenantAccess').sort({ name: 1 }).lean(),
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
    canViewAnalytics: boolean
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
        canViewAnalytics: dp.canViewAnalytics === true,
      }
    }
  }

  return (
      <UserAccessClient
      user={{
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive ?? true,
        pendingEmail: user.pendingEmail ?? null,
        preferredPortalUrl: user.preferredPortalUrl ?? null,
        mfaEnforced: user.mfaEnforced ?? false,
        mfaRequiredFrom: user.mfaRequiredFrom ? new Date(user.mfaRequiredFrom).toISOString() : null,
        mfaEmailEnabled: user.mfaEmailEnabled ?? false,
        mfaTotpEnabled: user.mfaTotpEnabled ?? false,
        mfaPasskeyCount: (user.mfaPasskeys ?? []).length,
      }}
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
      doorsByTenant={doorsByTenant}
      initialAccess={tenantAccessMap}
      portalUrls={appSetting?.portalUrls ?? []}
      copySources={allUsers.map((u) => {
        const src: Record<string, Record<string, {
          canUnlock: boolean
          canEndLockSchedule: boolean
          canTempLock: boolean
          canEndTempLock: boolean
          canViewLogs: boolean
          canViewAnalytics: boolean
        }>> = {}
        for (const ta of u.tenantAccess ?? []) {
          const tid = ta.tenantId.toString()
          src[tid] = {}
          for (const dp of ta.doorPermissions ?? []) {
            src[tid][dp.doorId.toString()] = {
              canUnlock: dp.canUnlock,
              canEndLockSchedule: dp.canEndLockSchedule,
              canTempLock: dp.canTempLock,
              canEndTempLock: dp.canEndTempLock,
              canViewLogs: dp.canViewLogs,
              canViewAnalytics: dp.canViewAnalytics === true,
            }
          }
        }
        return {
          _id: u._id.toString(),
          name: u.name,
          email: u.email,
          access: src,
        }
      })}
    />
  )
}
