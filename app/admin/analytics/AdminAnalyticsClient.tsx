'use client'

import { useMemo, useState, useEffect } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown, Download, RefreshCw } from 'lucide-react'
import { DateRangePicker } from '@/components/DateRangePicker'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts'
import type { AnalyticsOverview } from '@/types'

interface TenantRow { _id: string; name: string }
interface DoorRow { _id: string; name: string; tenantId: string }

interface Props {
  tenants: TenantRow[]
  doors: DoorRow[]
}

function toDateInput(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

function formatDurationAxis(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

export function AdminAnalyticsClient({ tenants, doors }: Props) {
  const [tenantId, setTenantId] = useState(tenants[0]?._id ?? '')
  const [doorId, setDoorId] = useState('')
  const [start, setStart] = useState(() => toDateInput(Math.floor(Date.now() / 1000) - 30 * 86400))
  const [end, setEnd] = useState(() => toDateInput(Math.floor(Date.now() / 1000)))
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const scopedDoors = useMemo(
    () => doors.filter((d) => d.tenantId === tenantId).sort((a, b) => a.name.localeCompare(b.name)),
    [doors, tenantId]
  )

  useEffect(() => {
    if (doorId && !scopedDoors.some((d) => d._id === doorId)) setDoorId('')
  }, [doorId, scopedDoors])

  const sinceTs = Math.floor(new Date(start).getTime() / 1000)
  const untilTs = Math.floor(new Date(`${end}T23:59:59`).getTime() / 1000)

  async function load() {
    if (!tenantId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        tenantId,
        since: String(sinceTs),
        until: String(untilTs),
      })
      if (doorId) params.set('doorIds', doorId)
      const res = await fetch(`/api/analytics/overview?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [tenantId, doorId, start, end])

  async function refresh() {
    if (!tenantId) return
    setRefreshing(true)
    try {
      await fetch('/api/analytics/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          since: sinceTs,
          until: untilTs,
          doorIds: doorId ? [doorId] : [],
        }),
      })
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  async function exportZip() {
    if (!tenantId) return
    setExporting(true)
    try {
      const params = new URLSearchParams({
        tenantId,
        since: String(sinceTs),
        until: String(untilTs),
      })
      if (doorId) params.set('doorIds', doorId)
      const res = await fetch(`/api/analytics/export?${params}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'analytics-export.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const methodColors = ['#006FFF', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b', '#94a3b8']

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Busiest doors, denial trends, method mix, and anomaly detection.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-2" onClick={refresh} disabled={refreshing || loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="btn-secondary text-xs flex items-center gap-2" onClick={exportZip} disabled={exporting || loading}>
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exporting...' : 'Export XLSX'}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {tenants.length > 1 && (
            <div>
              <label className="label">Site</label>
              <Select.Root value={tenantId || '__none'} onValueChange={(v) => setTenantId(v === '__none' ? '' : v)}>
                <Select.Trigger className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
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

          <div>
            <label className="label">Door (Optional)</label>
            <Select.Root value={doorId || '__all'} onValueChange={(v) => setDoorId(v === '__all' ? '' : v)}>
              <Select.Trigger className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
                <Select.Value placeholder="All doors" />
                <Select.Icon className="ml-auto"><ChevronDown className="w-4 h-4 text-gray-400" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                  <Select.Viewport className="p-1 max-h-72">
                    <Select.Item value="__all" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                      <Select.ItemText>All doors</Select.ItemText>
                      <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                    </Select.Item>
                    {scopedDoors.map((d) => (
                      <Select.Item key={d._id} value={d._id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                        <Select.ItemText>{d.name}</Select.ItemText>
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
            <DateRangePicker start={start} end={end} onStartChange={setStart} onEndChange={setEnd} max={toDateInput(Math.floor(Date.now() / 1000))} />
          </div>
        </div>
      </div>

      {loading || !data ? (
        <div className="card p-8 text-center text-sm text-gray-400">Loading analytics...</div>
      ) : (
        <div className="space-y-5">
          <div className={`grid grid-cols-2 ${data.analyticsPreferences.hideUnlockedTime && data.analyticsPreferences.hideUnauthorizedOpenTime ? 'md:grid-cols-6' : data.analyticsPreferences.hideUnlockedTime || data.analyticsPreferences.hideUnauthorizedOpenTime ? 'md:grid-cols-7' : 'md:grid-cols-8'} gap-3`}>
            <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Total</p><p className="text-2xl font-bold text-gray-900">{data.kpi.total}</p></div>
            <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Granted</p><p className="text-2xl font-bold text-[#006FFF]">{data.kpi.granted}</p></div>
            <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Denied</p><p className="text-2xl font-bold text-red-500">{data.kpi.denied}</p></div>
            <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Denial Rate</p><p className="text-2xl font-bold text-gray-900">{(data.kpi.denialRate * 100).toFixed(1)}%</p></div>
            <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Door Opened</p><p className="text-2xl font-bold text-amber-500">{data.openCloseKpi.opened}</p></div>
            <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Door Closed</p><p className="text-2xl font-bold text-emerald-600">{data.openCloseKpi.closed}</p></div>
            {!data.analyticsPreferences.hideUnlockedTime && (
              <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Time Unlocked</p><p className="text-2xl font-bold text-indigo-600">{formatDuration(data.openCloseKpi.unlockedSeconds)}</p></div>
            )}
            {!data.analyticsPreferences.hideUnauthorizedOpenTime && (
              <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Unauthorized Open Time</p><p className="text-2xl font-bold text-red-600">{formatDuration(data.openCloseKpi.unauthorizedOpenSeconds)}</p></div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Denial Trend by Day</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.denialByDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="denied" stroke="#ef4444" strokeWidth={2} dot={false} name="Denied" />
                    <Line type="monotone" dataKey="total" stroke="#006FFF" strokeWidth={2} dot={false} name="Total" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Denial Pattern by Hour</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.denialByHour}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#006FFF" name="Total" />
                    <Bar dataKey="denied" fill="#ef4444" name="Denied" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {(!data.analyticsPreferences.hideUnlockedTime || !data.analyticsPreferences.hideUnauthorizedOpenTime) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {!data.analyticsPreferences.hideUnlockedTime && (
                <div className="card p-5">
                  <h2 className="font-semibold text-gray-900 mb-3">Estimated Time Unlocked by Day</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.unlockedByDay}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={formatDurationAxis} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(v: number) => formatDuration(Number(v))} />
                        <Bar dataKey="unlockedSeconds" fill="#4f46e5" name="Unlocked" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {!data.analyticsPreferences.hideUnauthorizedOpenTime && (
                <div className="card p-5">
                  <h2 className="font-semibold text-gray-900 mb-3">Unauthorized Open Time by Day</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.unauthorizedOpenByDay}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={formatDurationAxis} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(v: number) => formatDuration(Number(v))} />
                        <Bar dataKey="unauthorizedOpenSeconds" fill="#ef4444" name="Unauthorized Open" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Door Open/Close by Day</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.openCloseByDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="opened" fill="#f59e0b" name="Opened" />
                    <Bar dataKey="closed" fill="#10b981" name="Closed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Door Open/Close by Hour</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.openCloseByHour}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="opened" fill="#f59e0b" name="Opened" />
                    <Bar dataKey="closed" fill="#10b981" name="Closed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Unlock Method Mix</h2>
              {data.methodMix.length === 0 ? (
                <p className="text-sm text-gray-400">No data in selected window.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.methodMix} dataKey="count" nameKey="method" outerRadius={90} label>
                        {data.methodMix.map((m, i) => <Cell key={m.method} fill={methodColors[i % methodColors.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Busiest Doors</h2>
              {data.busiestDoors.length === 0 ? (
                <p className="text-sm text-gray-400">No data in selected window.</p>
              ) : (
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b">
                        <th className="py-2 pr-3">Door</th>
                        <th className="py-2 pr-3">Total</th>
                        <th className="py-2 pr-3">Denied</th>
                        <th className="py-2">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.busiestDoors.slice(0, 20).map((r) => (
                        <tr key={r.doorId}>
                          <td className="py-2 pr-3 text-gray-800">{r.doorName}</td>
                          <td className="py-2 pr-3 text-gray-600">{r.total}</td>
                          <td className="py-2 pr-3 text-red-500">{r.denied}</td>
                          <td className="py-2 text-gray-600">{(r.denialRate * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Anomalies</h2>
            {data.anomalies.length === 0 ? (
              <p className="text-sm text-gray-400">No anomalies detected for this window.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b">
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">Door</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Bucket</th>
                      <th className="py-2 pr-3">Denied Rate</th>
                      <th className="py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.anomalies.slice(0, 50).map((a, idx) => (
                      <tr key={`${a.doorId}-${a.type}-${a.bucket}-${idx}`}>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${a.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                            {a.severity}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-gray-800">{a.doorName}</td>
                        <td className="py-2 pr-3 text-gray-600">{a.type}</td>
                        <td className="py-2 pr-3 text-gray-600">{a.bucket}</td>
                        <td className="py-2 pr-3 text-gray-600">{(a.denialRate * 100).toFixed(1)}%</td>
                        <td className="py-2 text-gray-600">{a.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
