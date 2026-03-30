'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type DoorPerms = {
  canUnlock: boolean
  canEndLockSchedule: boolean
  canTempLock: boolean
  canEndTempLock: boolean
  canViewLogs: boolean
  canViewAnalytics: boolean
}

type PermissionRole = DoorPerms & {
  id: string
  name: string
}

const DEFAULT_PERMS: DoorPerms = {
  canUnlock: false,
  canEndLockSchedule: false,
  canTempLock: false,
  canEndTempLock: false,
  canViewLogs: false,
  canViewAnalytics: false,
}

const PERM_LABELS: { key: keyof DoorPerms; label: string }[] = [
  { key: 'canUnlock', label: 'Unlock' },
  { key: 'canEndLockSchedule', label: 'End Schedule' },
  { key: 'canTempLock', label: 'Lockdown / Timed Unlock' },
  { key: 'canEndTempLock', label: 'End Lockdown / Rule' },
  { key: 'canViewLogs', label: 'View Logs' },
  { key: 'canViewAnalytics', label: 'View Analytics' },
]

export function PermissionRolesClient() {
  const [roles, setRoles] = useState<PermissionRole[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/permission-roles', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { permissionRoles?: PermissionRole[] }
        if (!cancelled) setRoles(data.permissionRoles ?? [])
      } catch {
        // no-op
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  function addRole() {
    setRoles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', ...DEFAULT_PERMS },
    ])
  }

  function updateRole(id: string, patch: Partial<PermissionRole>) {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRole(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id))
  }

  async function onSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/admin/permission-roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionRoles: roles }),
      })
      if (!res.ok) {
        setError('Failed to save permission roles')
        return
      }
      const data = await res.json() as { permissionRoles?: PermissionRole[] }
      setRoles(data.permissionRoles ?? [])
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } catch {
      setError('Failed to save permission roles')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-5 space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Permission Roles</h2>
          <p className="text-sm text-gray-500 mt-1">
            Define reusable door permission templates. These can be applied on user access pages, then adjusted per user.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={addRole}>+ Add Role</button>
      </div>

      {roles.length === 0 ? (
        <p className="text-sm text-gray-400">No roles yet. Add one to get started.</p>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  className="input max-w-sm"
                  placeholder="Role name (e.g., Front Desk)"
                  value={role.name}
                  onChange={(e) => updateRole(role.id, { name: e.target.value })}
                />
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeRole(role.id)}>
                  Remove
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {PERM_LABELS.map((p) => {
                  const active = role[p.key]
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => updateRole(role.id, { [p.key]: !active } as Partial<PermissionRole>)}
                      className={cn(
                        'text-xs px-3 py-1.5 rounded-full border transition-colors',
                        active
                          ? 'border-[#006FFF] bg-[#006FFF]/10 text-[#006FFF] font-medium'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary disabled:opacity-50" onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Permission Roles'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
