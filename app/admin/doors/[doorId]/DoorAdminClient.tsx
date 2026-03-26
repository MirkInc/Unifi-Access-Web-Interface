'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

interface DoorConfig {
  door: {
    id: string
    name: string
    fullName: string
    tenantId: string
    tenantName: string
    scheduleId: string | null
    scheduleName: string | null
    firstPersonInRequired: boolean
  }
  schedules: { id: string; name: string; isDefault: boolean }[]
  devices: { name: string; id: string; type: string; ip: string; mac: string; connectedReaders: string[] }[]
}

async function parseResponseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Request failed (${res.status})`)
  }
}

function normalizeDoorConfig(input: unknown): DoorConfig {
  const src = (input ?? {}) as Partial<DoorConfig>
  return {
    door: {
      id: src.door?.id ?? '',
      name: src.door?.name ?? '',
      fullName: src.door?.fullName ?? '',
      tenantId: src.door?.tenantId ?? '',
      tenantName: src.door?.tenantName ?? '',
      scheduleId: src.door?.scheduleId ?? null,
      scheduleName: src.door?.scheduleName ?? null,
      firstPersonInRequired: src.door?.firstPersonInRequired === true,
    },
    schedules: Array.isArray(src.schedules) ? src.schedules : [],
    devices: Array.isArray(src.devices)
      ? src.devices.map((d) => ({
          name: d?.name ?? '',
          id: d?.id ?? '',
          type: d?.type ?? '',
          ip: d?.ip ?? '',
          mac: d?.mac ?? '',
          connectedReaders: Array.isArray(d?.connectedReaders) ? d.connectedReaders : [],
        }))
      : [],
  }
}

export function DoorAdminClient({ doorId }: { doorId: string }) {
  const [data, setData] = useState<DoorConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [firstPersonInRequired, setFirstPersonInRequired] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/admin/doors/${doorId}`, { cache: 'no-store' })
        const json = (await parseResponseJson(res)) as { error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Failed to load door settings')
        if (cancelled) return
        const normalized = normalizeDoorConfig(json)
        setData(normalized)
        setScheduleId(normalized.door.scheduleId)
        setFirstPersonInRequired(normalized.door.firstPersonInRequired)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [doorId])

  const selectedScheduleName = useMemo(() => {
    const s = data?.schedules.find((x) => x.id === scheduleId)
    return s?.name ?? null
  }, [data, scheduleId])

  async function save() {
    if (!data) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch(`/api/admin/doors/${doorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          scheduleName: selectedScheduleName,
          firstPersonInRequired,
        }),
      })
      const json = (await parseResponseJson(res)) as { error?: string; scheduleId?: string | null; scheduleName?: string | null; firstPersonInRequired?: boolean }
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setData((prev) => prev ? {
        ...prev,
        door: {
          ...prev.door,
          scheduleId: json.scheduleId ?? null,
          scheduleName: json.scheduleName ?? null,
          firstPersonInRequired: json.firstPersonInRequired === true,
        },
      } : prev)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading door settings...</div>
  if (error && !data) return <div className="card p-8 text-center text-red-600">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/admin/doors" className="text-xs text-[#006FFF] hover:underline">Back to Doors</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{data.door.name}</h1>
          <p className="text-sm text-gray-500">{data.door.tenantName}</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Door Settings'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Door Admin Settings</h2>

          <div>
            <label className="label">Configured Schedule</label>
            <select
              className="input"
              value={scheduleId ?? ''}
              onChange={(e) => setScheduleId(e.target.value || null)}
            >
              <option value="">No schedule</option>
              {data.schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Updates here write the same door schedule fields used by the Schedules admin page.
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={firstPersonInRequired}
              onChange={(e) => setFirstPersonInRequired(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#006FFF] focus:ring-[#006FFF]"
            />
            <span className="text-gray-700">First Person In Required</span>
          </label>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Devices</h2>
        {data.devices.length === 0 ? (
          <p className="text-sm text-gray-400">No device info available.</p>
        ) : (
          <div className="space-y-2">
            {data.devices.map((d) => (
              <div key={d.id || d.name} className="rounded-lg border border-gray-100 p-3">
                <p className="text-sm font-medium text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-500">{d.type || 'Device'}</p>
                <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                  {d.id && <p>ID: {d.id}</p>}
                  {d.ip && <p>IP: {d.ip}</p>}
                  {d.mac && <p>MAC: {d.mac}</p>}
                  <p>Connected Readers: {d.connectedReaders.length > 0 ? d.connectedReaders.join(', ') : 'None reported'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
