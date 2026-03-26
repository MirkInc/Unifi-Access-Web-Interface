'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Door { _id: string; name: string }
interface Tenant { _id: string; name: string }
interface UserInfo { _id: string; name: string; email: string; role: string; isActive: boolean; pendingEmail: string | null }

type DoorPerms = {
  canUnlock: boolean
  canEndLockSchedule: boolean
  canTempLock: boolean
  canEndTempLock: boolean
  canViewLogs: boolean
  canViewAnalytics: boolean
}

const PERM_LABELS: { key: keyof DoorPerms; label: string; desc: string }[] = [
  { key: 'canUnlock', label: 'Unlock', desc: 'One-time unlock' },
  { key: 'canEndLockSchedule', label: 'End Schedule', desc: 'Lock door early when on unlock schedule' },
  { key: 'canTempLock', label: 'Lockdown / Timed Unlock', desc: 'Initiate lockdown or set a timed unlock' },
  { key: 'canEndTempLock', label: 'End Lockdown / Rule', desc: 'Cancel an active lockdown or timed rule' },
  { key: 'canViewLogs', label: 'View Logs', desc: 'View and export activity logs' },
  { key: 'canViewAnalytics', label: 'Analytics', desc: 'View door analytics page and analytics data' },
]

const DEFAULT_PERMS: DoorPerms = {
  canUnlock: false, canEndLockSchedule: false,
  canTempLock: false, canEndTempLock: false, canViewLogs: false, canViewAnalytics: false,
}

interface Props {
  user: UserInfo
  tenants: Tenant[]
  doorsByTenant: Record<string, Door[]>
  initialAccess: Record<string, Record<string, DoorPerms>>
}

export function UserAccessClient({ user, tenants, doorsByTenant, initialAccess }: Props) {
  const router = useRouter()

  // Profile fields
  const [profileName, setProfileName] = useState(user.name)
  const [profileEmail, setProfileEmail] = useState(user.email)
  const [profileRole, setProfileRole] = useState(user.role)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Access state
  const [access, setAccess] = useState<Record<string, Record<string, DoorPerms>>>(initialAccess)
  const [expandedTenants, setExpandedTenants] = useState<Set<string>>(new Set(Object.keys(initialAccess)))

  // Save state
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true); setError(''); setSuccess('')

    const tenantAccess = Object.entries(access).map(([tenantId, doorMap]) => ({
      tenantId,
      doorPermissions: Object.entries(doorMap).map(([doorId, perms]) => ({ doorId, ...perms })),
    }))

    const body: Record<string, unknown> = {
      name: profileName,
      email: profileEmail,
      role: profileRole,
      tenantAccess,
    }
    if (newPassword) body.password = newPassword

    const res = await fetch(`/api/users/${user._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      const msg = profileEmail !== user.email
        ? 'Saved. A confirmation email has been sent to the new address.'
        : 'Saved.'
      setSuccess(msg)
      setNewPassword('')
      router.refresh()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Save failed')
    }
  }

  const hasTenantAccess = (tid: string) => tid in access
  const hasDoorAccess = (tid: string, did: string) => !!(access[tid]?.[did])

  function toggleTenant(tid: string) {
    setAccess((prev) => {
      const next = { ...prev }
      if (tid in next) {
        delete next[tid]
        setExpandedTenants((e) => { const s = new Set(e); s.delete(tid); return s })
      } else {
        next[tid] = {}
        setExpandedTenants((e) => new Set([...e, tid]))
      }
      return next
    })
  }

  function toggleDoor(tid: string, did: string) {
    setAccess((prev) => {
      const next = { ...prev }
      if (!next[tid]) next[tid] = {}
      if (did in next[tid]) {
        const doors = { ...next[tid] }
        delete doors[did]
        next[tid] = doors
      } else {
        next[tid] = { ...next[tid], [did]: { ...DEFAULT_PERMS } }
      }
      return next
    })
  }

  function setPerm(tid: string, did: string, perm: keyof DoorPerms, value: boolean) {
    setAccess((prev) => ({
      ...prev,
      [tid]: { ...prev[tid], [did]: { ...(prev[tid]?.[did] ?? DEFAULT_PERMS), [perm]: value } },
    }))
  }

  function setAllPermsForDoor(tid: string, did: string, value: boolean) {
    const perms = Object.fromEntries(PERM_LABELS.map((p) => [p.key, value])) as DoorPerms
    setAccess((prev) => ({ ...prev, [tid]: { ...prev[tid], [did]: perms } }))
  }

  function setAllDoorsForTenant(tid: string, enable: boolean) {
    const doors = doorsByTenant[tid] ?? []
    setAccess((prev) => {
      const next = { ...prev }
      next[tid] = {}
      if (enable) for (const d of doors) next[tid][d._id] = { ...DEFAULT_PERMS }
      return next
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/users" className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
              {!user.isActive && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Pending</span>
              )}
              {user.pendingEmail && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Email Pending</span>
              )}
            </div>
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {success && <span className="text-sm text-green-600 font-medium">{success}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Profile fields */}
      <div className="card p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">User Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
            {user.pendingEmail && (
              <p className="text-xs text-amber-600 mt-1">Pending confirmation: {user.pendingEmail}</p>
            )}
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={profileRole} onChange={(e) => setProfileRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Access */}
      <h2 className="font-semibold text-gray-900 mb-4">Site &amp; Door Access</h2>

      {tenants.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          No sites yet. <Link href="/admin/tenants" className="text-[#006FFF] hover:underline">Add a site first.</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {tenants.map((tenant) => {
            const doors = doorsByTenant[tenant._id] ?? []
            const isEnabled = hasTenantAccess(tenant._id)
            const isExpanded = expandedTenants.has(tenant._id)
            const enabledDoorCount = Object.keys(access[tenant._id] ?? {}).length

            return (
              <div key={tenant._id} className="card overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b bg-gray-50">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleTenant(tenant._id)}
                    className="w-4 h-4 accent-[#006FFF] cursor-pointer"
                    id={`tenant-${tenant._id}`}
                  />
                  <label htmlFor={`tenant-${tenant._id}`} className="flex-1 cursor-pointer">
                    <span className="font-semibold text-gray-900">{tenant.name}</span>
                    {isEnabled && (
                      <span className="ml-2 text-xs text-gray-400">
                        {enabledDoorCount}/{doors.length} door{doors.length !== 1 ? 's' : ''} assigned
                      </span>
                    )}
                  </label>

                  {isEnabled && (
                    <>
                      <button className="text-xs text-gray-400 hover:text-gray-700 transition-colors" onClick={() => setAllDoorsForTenant(tenant._id, true)}>All doors</button>
                      <button className="text-xs text-gray-400 hover:text-gray-700 transition-colors" onClick={() => setAllDoorsForTenant(tenant._id, false)}>No doors</button>
                      <button
                        className="text-gray-400 hover:text-gray-700 transition-colors p-1"
                        onClick={() => setExpandedTenants((e) => {
                          const s = new Set(e)
                          isExpanded ? s.delete(tenant._id) : s.add(tenant._id)
                          return s
                        })}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')}>
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>

                {isEnabled && isExpanded && (
                  <div className="overflow-x-auto">
                    {doors.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">
                        No doors synced for this site.{' '}
                        <Link href="/admin/tenants" className="text-[#006FFF] hover:underline">Sync doors</Link>
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b">
                            <th className="px-4 py-2 w-8"></th>
                            <th className="px-4 py-2">Door</th>
                            {PERM_LABELS.map((p) => (
                              <th key={p.key} className="px-3 py-2 text-center whitespace-nowrap" title={p.desc}>{p.label}</th>
                            ))}
                            <th className="px-3 py-2 text-center">All</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {doors.map((door) => {
                            const doorEnabled = hasDoorAccess(tenant._id, door._id)
                            const perms = access[tenant._id]?.[door._id] ?? DEFAULT_PERMS
                            return (
                              <tr key={door._id} className={cn('transition-colors', doorEnabled ? 'bg-white' : 'bg-gray-50/50')}>
                                <td className="px-4 py-2">
                                  <input type="checkbox" checked={doorEnabled} onChange={() => toggleDoor(tenant._id, door._id)} className="w-4 h-4 accent-[#006FFF] cursor-pointer" />
                                </td>
                                <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{door.name}</td>
                                {PERM_LABELS.map((p) => (
                                  <td key={p.key} className="px-3 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={doorEnabled && perms[p.key]}
                                      disabled={!doorEnabled}
                                      onChange={(e) => setPerm(tenant._id, door._id, p.key, e.target.checked)}
                                      className="w-4 h-4 accent-[#006FFF] cursor-pointer disabled:opacity-30"
                                    />
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-center">
                                  <button className="text-xs text-[#006FFF] hover:underline disabled:opacity-30" disabled={!doorEnabled} onClick={() => setAllPermsForDoor(tenant._id, door._id, true)}>All</button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
