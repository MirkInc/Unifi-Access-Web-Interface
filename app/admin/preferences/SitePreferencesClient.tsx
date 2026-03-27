'use client'

import { useEffect, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

interface TenantRow {
  _id: string
  name: string
}

interface Props {
  tenants: TenantRow[]
  initialTenantId: string
}

export function SitePreferencesClient({ tenants, initialTenantId }: Props) {
  const [tenantId, setTenantId] = useState(initialTenantId)
  const [hideUnlockedTime, setHideUnlockedTime] = useState(true)
  const [hideUnauthorizedOpenTime, setHideUnauthorizedOpenTime] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setSaved(false)
      try {
        const res = await fetch(`/api/admin/site-preferences?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setError('Failed to load preferences')
          return
        }
        const data = await res.json() as { hideUnlockedTime: boolean; hideUnauthorizedOpenTime: boolean }
        if (cancelled) return
        setHideUnlockedTime(data.hideUnlockedTime !== false)
        setHideUnauthorizedOpenTime(data.hideUnauthorizedOpenTime !== false)
      } catch {
        if (!cancelled) setError('Failed to load preferences')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [tenantId])

  async function onSave() {
    if (!tenantId) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/site-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, hideUnlockedTime, hideUnauthorizedOpenTime }),
      })
      if (!res.ok) { setError('Failed to save preferences'); return }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } catch {
      setError('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {tenants.length > 1 && (
        <div>
          <label className="label">Site</label>
          <Select.Root value={tenantId || '__none'} onValueChange={(v) => setTenantId(v === '__none' ? '' : v)}>
            <Select.Trigger className="w-full md:w-80 flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
              <Select.Value placeholder="Select site" />
              <Select.Icon className="ml-auto"><ChevronDown className="w-4 h-4 text-gray-400" /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                <Select.Viewport className="p-1">
                  {tenants.map((t) => (
                    <Select.Item key={t._id} value={t._id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                      <Select.ItemText>{t.name}</Select.ItemText>
                      <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Analytics (Temporary Controls)</h2>
          <p className="text-sm text-gray-500 mt-1">Hide metrics that are still being refined.</p>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={hideUnlockedTime}
            onChange={(e) => setHideUnlockedTime(e.target.checked)}
            disabled={loading || saving}
          />
          <span className="text-sm text-gray-700">Hide &quot;Estimated Time Unlocked&quot; sections</span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={hideUnauthorizedOpenTime}
            onChange={(e) => setHideUnauthorizedOpenTime(e.target.checked)}
            disabled={loading || saving}
          />
          <span className="text-sm text-gray-700">Hide &quot;Unauthorized Open Time&quot; sections</span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            onClick={onSave}
            disabled={!tenantId || loading || saving}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  )
}
