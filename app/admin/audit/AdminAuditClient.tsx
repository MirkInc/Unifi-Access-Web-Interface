'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'
import { DateRangePicker } from '@/components/DateRangePicker'

interface Tenant {
  _id: string
  name: string
}
interface UserRow {
  _id: string
  name: string
  email: string
}
interface DoorRow {
  _id: string
  name: string
  tenantId: string
}
interface AuditRow {
  _id: string
  timestamp: string
  tenantId?: string | null
  doorId?: string | null
  actorUserId?: string | null
  actorName: string
  actorEmail?: string
  action: string
  entityType: string
  entityId?: string
  outcome: 'success' | 'failure'
  message?: string
  metadata?: Record<string, unknown>
}
interface AuditResponse {
  items: AuditRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface Props {
  tenants: Tenant[]
  users: UserRow[]
  doors: DoorRow[]
}

export function AdminAuditClient({ tenants, users, doors }: Props) {
  const [tenantId, setTenantId] = useState('')
  const [userId, setUserId] = useState('')
  const [selectedActions, setSelectedActions] = useState<string[]>([])
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false)
  const [outcome, setOutcome] = useState('')
  const [entityType, setEntityType] = useState('')
  const [query, setQuery] = useState('')
  const [since, setSince] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [until, setUntil] = useState(() => new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState<AuditRow[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const actionDropdownRef = useRef<HTMLDivElement>(null)

  const actionOptions = useMemo(() => ([
    { value: 'screen.view', label: 'Viewed Screen' },
    { value: 'door.unlock', label: 'Unlock Door' },
    { value: 'door.lock_rule.keep_lock', label: 'Set Lockdown' },
    { value: 'door.lock_rule.reset', label: 'Reset Lock Rule' },
    { value: 'door.lock_rule.custom', label: 'Temp Unlock' },
    { value: 'tenant.create', label: 'Create Site' },
    { value: 'tenant.update', label: 'Update Site' },
    { value: 'tenant.delete', label: 'Delete Site' },
    { value: 'user.create', label: 'Create User' },
    { value: 'user.update', label: 'Update User' },
    { value: 'user.delete', label: 'Delete User' },
    { value: 'profile.update', label: 'Update Profile' },
    { value: 'door.admin_settings.update', label: 'Update Door Settings' },
  ]), [])

  const tenantMap = useMemo(() => {
    return new Map(tenants.map((t) => [t._id, t.name]))
  }, [tenants])

  const userMap = useMemo(() => {
    return new Map(users.map((u) => [u._id, `${u.name} (${u.email})`]))
  }, [users])
  const doorMap = useMemo(() => {
    return new Map(doors.map((d) => [d._id, d]))
  }, [doors])

  function actionLabel(action: string): string {
    const labels: Record<string, string> = Object.fromEntries(actionOptions.map((o) => [o.value, o.label]))
    return labels[action] ?? action
  }

  function normalizeScreenPath(r: AuditRow): string {
    const rawPath = (r.entityId ?? '').trim() || '/'
    if (rawPath === '/dashboard' && r.tenantId) return `/${r.tenantId}`
    if (rawPath.startsWith('/door/')) {
      const segments = rawPath.split('/').filter(Boolean)
      const doorId = segments[1]
      if (r.tenantId && doorId) return `/${r.tenantId}/${doorId}`
    }
    return rawPath
  }

  function entityLabel(r: AuditRow): string {
    const md = r.metadata ?? {}
    if (r.entityType === 'door') {
      const doorName = typeof md.doorName === 'string' ? md.doorName : ''
      if (doorName) return `Door: ${doorName}`
    }
    if (r.entityType === 'tenant') {
      const tenantName = typeof md.tenantName === 'string' ? md.tenantName : ''
      if (tenantName) return `Site: ${tenantName}`
      if (r.tenantId) return `Site: ${tenantMap.get(r.tenantId) ?? r.tenantId}`
    }
    if (r.entityType === 'user') {
      const email = typeof md.email === 'string' ? md.email : ''
      if (email) return `User: ${email}`
      if (r.entityId) return `User: ${userMap.get(r.entityId) ?? r.entityId}`
    }
    if (r.entityType === 'screen') {
      const rawPath = normalizeScreenPath(r)
      if (!rawPath) return 'Dashboard'
      if (rawPath === '/') return 'Site Manager'
      if (rawPath === '/admin') return 'Admin'
      if (rawPath === '/admin/tenants') return 'Admin / Sites'
      if (rawPath === '/admin/users') return 'Admin / Users'
      if (rawPath === '/admin/schedules') return 'Admin / Schedules'
      if (rawPath === '/admin/audit') return 'Admin / Audit Logs'
      const segments = rawPath.split('/').filter(Boolean)
      if (segments.length === 1) {
        const tName = tenantMap.get(segments[0])
        if (tName) return `${tName} / Dashboard`
      }
      if (segments.length === 2) {
        const tName = tenantMap.get(segments[0])
        const d = doorMap.get(segments[1])
        if (tName && d && d.tenantId === segments[0]) {
          return `${tName} / Door: ${d.name}`
        }
      }
      return rawPath
    }
    if (r.entityId) return `${r.entityType}: ${r.entityId}`
    return r.entityType
  }

  function messageLabel(r: AuditRow): string {
    if (r.entityType === 'screen' && r.action === 'screen.view') {
      return `Opened ${entityLabel(r)}`
    }
    return r.message ?? ''
  }

  function auditTimeParts(iso: string): { date: string; time: string } {
    const d = new Date(iso)
    const parts = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return {
      date: `${get('month')} ${get('day')}, ${get('year')}`,
      time: `${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`,
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionDropdownRef.current && !actionDropdownRef.current.contains(event.target as Node)) {
        setActionDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [tenantId, userId, outcome, entityType, selectedActions, query, since, until, pageSize])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (tenantId) params.set('tenantId', tenantId)
      if (userId) params.set('userId', userId)
      if (selectedActions.length > 0) params.set('action', selectedActions.join(','))
      if (outcome) params.set('outcome', outcome)
      if (entityType) params.set('entityType', entityType)
      if (query.trim()) params.set('q', query.trim())
      if (since) params.set('since', String(Math.floor(new Date(since).getTime() / 1000)))
      if (until) params.set('until', String(Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000)))

      try {
        const res = await fetch(`/api/audit?${params}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as AuditResponse
        if (!cancelled) {
          setRows(data.items ?? [])
          setTotal(data.total ?? 0)
          setTotalPages(data.totalPages ?? 1)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [tenantId, userId, selectedActions, outcome, entityType, query, since, until, page, pageSize, refreshTick])

  const actionFilterLabel = useMemo(() => {
    if (selectedActions.length === 0) return 'All actions'
    if (selectedActions.length === 1) {
      return actionLabel(selectedActions[0])
    }
    return `${selectedActions.length} actions selected`
  }, [selectedActions])

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-sm text-gray-500 mt-1">System actions performed inside this portal</p>
          </div>
          <button
            className="btn-secondary text-xs"
            onClick={() => setRefreshTick((v) => v + 1)}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 mb-5">
          <div>
            <label className="label">Site</label>
            <Select.Root value={tenantId || '__all'} onValueChange={(v) => setTenantId(v === '__all' ? '' : v)}>
              <Select.Trigger className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
                <Select.Value placeholder="All sites" />
                <Select.Icon className="ml-auto">
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                  <Select.Viewport className="p-1">
                    <Select.Item value="__all" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                      <Select.ItemText>All sites</Select.ItemText>
                      <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                    </Select.Item>
                    {tenants.map((t) => (
                      <Select.Item key={t._id} value={t._id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                        <Select.ItemText>{t.name}</Select.ItemText>
                        <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
          <div>
            <label className="label">User</label>
            <Select.Root value={userId || '__all'} onValueChange={(v) => setUserId(v === '__all' ? '' : v)}>
              <Select.Trigger className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
                <Select.Value placeholder="All users" />
                <Select.Icon className="ml-auto">
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                  <Select.Viewport className="p-1 max-h-72">
                    <Select.Item value="__all" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                      <Select.ItemText>All users</Select.ItemText>
                      <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                    </Select.Item>
                    {users.map((u) => (
                      <Select.Item key={u._id} value={u._id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                        <Select.ItemText>{u.name} ({u.email})</Select.ItemText>
                        <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
          <div ref={actionDropdownRef} className="relative">
            <label className="label">Action</label>
            <button
              type="button"
              className="input h-10 bg-white w-full text-left flex items-center justify-between gap-2"
              onClick={() => setActionDropdownOpen((v) => !v)}
            >
              <span className={selectedActions.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
                {actionFilterLabel}
              </span>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {actionDropdownOpen && (
              <div className="absolute left-0 z-50 mt-1 w-[420px] max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs text-[#006FFF] hover:underline"
                    onClick={() => setSelectedActions(actionOptions.map((o) => o.value))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-xs text-gray-500 hover:underline"
                    onClick={() => setSelectedActions([])}
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {actionOptions.map((option) => {
                    const checked = selectedActions.includes(option.value)
                    return (
                      <label key={option.value} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-[#006FFF]"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedActions((prev) => [...prev, option.value])
                            } else {
                              setSelectedActions((prev) => prev.filter((v) => v !== option.value))
                            }
                          }}
                        />
                        <span>{option.label}</span>
                        <span className="text-xs text-gray-400">{option.value}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="label">Outcome</label>
            <Select.Root value={outcome || '__all'} onValueChange={(v) => setOutcome(v === '__all' ? '' : v)}>
              <Select.Trigger className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
                <Select.Value placeholder="All" />
                <Select.Icon className="ml-auto"><ChevronDown className="w-4 h-4 text-gray-400" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                  <Select.Viewport className="p-1">
                    {[
                      { v: '__all', l: 'All' },
                      { v: 'success', l: 'Success' },
                      { v: 'failure', l: 'Failure' },
                    ].map((opt) => (
                      <Select.Item key={opt.v} value={opt.v} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                        <Select.ItemText>{opt.l}</Select.ItemText>
                        <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
          <div>
            <label className="label">Entity Type</label>
            <Select.Root value={entityType || '__all'} onValueChange={(v) => setEntityType(v === '__all' ? '' : v)}>
              <Select.Trigger className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
                <Select.Value placeholder="All entity types" />
                <Select.Icon className="ml-auto"><ChevronDown className="w-4 h-4 text-gray-400" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                  <Select.Viewport className="p-1">
                    {[
                      { v: '__all', l: 'All entity types' },
                      { v: 'screen', l: 'Screen' },
                      { v: 'door', l: 'Door' },
                      { v: 'tenant', l: 'Site' },
                      { v: 'user', l: 'User' },
                    ].map((opt) => (
                      <Select.Item key={opt.v} value={opt.v} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                        <Select.ItemText>{opt.l}</Select.ItemText>
                        <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
          <div className="md:col-span-2 xl:col-span-2">
            <label className="label">Date Range</label>
            <DateRangePicker
              start={since}
              end={until}
              onStartChange={setSince}
              onEndChange={setUntil}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-7">
            <label className="label">Search</label>
            <input className="input w-full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="action, actor, message..." />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading audit logs...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No audit entries for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Site</th>
                  <th className="py-2 pr-3">Details</th>
                  <th className="py-2 pr-3">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => {
                  const t = auditTimeParts(r.timestamp)
                  return (
                    <tr key={r._id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap leading-tight">
                        <div>{t.date}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{t.time}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="text-gray-800">{r.actorName}</div>
                        {r.actorEmail && <div className="text-xs text-gray-400">{r.actorEmail}</div>}
                      </td>
                      <td className="py-2 pr-3 text-gray-800 whitespace-nowrap">
                        <div>{actionLabel(r.action)}</div>
                        {actionLabel(r.action) !== r.action && (
                          <div className="text-xs text-gray-400">{r.action}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{r.tenantId ? tenantMap.get(r.tenantId) ?? r.tenantId : '-'}</td>
                      <td className="py-2 pr-3 text-gray-500 min-w-[360px]">
                        <div className="text-gray-700">{entityLabel(r)}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{messageLabel(r)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${r.outcome === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {r.outcome}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-xs text-gray-500">
                Showing {Math.min(total, (page - 1) * pageSize + 1)}-{Math.min(total, page * pageSize)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Rows</label>
                <div className="relative">
                  <select
                    className="input h-8 py-1 text-xs w-[88px] appearance-none pr-8"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </span>
                </div>
                <button
                  className="btn-secondary h-8 text-xs px-3"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  Previous
                </button>
                <span className="text-xs text-gray-500 min-w-[64px] text-center">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn-secondary h-8 text-xs px-3"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
