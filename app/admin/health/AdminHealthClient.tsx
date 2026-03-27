'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import type { HealthOverviewResponse, HealthSeverity } from '@/types'

interface TenantRow { _id: string; name: string }
interface Props { tenants: TenantRow[] }

function severityClass(severity: HealthSeverity): string {
  if (severity === 'critical') return 'bg-red-50 text-red-700'
  if (severity === 'warn') return 'bg-amber-50 text-amber-700'
  return 'bg-green-50 text-green-700'
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return 'Never'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtTs(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString()
}

export function AdminHealthClient({ tenants }: Props) {
  const [tenantId, setTenantId] = useState('')
  const [includeDoors, setIncludeDoors] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [windowHours, setWindowHours] = useState(24)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [data, setData] = useState<HealthOverviewResponse | null>(null)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (tenantId) p.set('tenantId', tenantId)
    p.set('includeDoors', includeDoors ? 'true' : 'false')
    p.set('windowHours', String(windowHours))
    return p
  }, [tenantId, includeDoors, windowHours])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/health/overview?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/health/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId || undefined,
          includeDoors,
          windowHours,
        }),
      })
      if (!res.ok) return
      setData(await res.json())
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [params])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, params])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Health</h1>
          <p className="text-sm text-gray-500 mt-1">Controller, webhook delivery, sync age, and backfill/cache lag.</p>
        </div>
        <button className="btn-secondary text-xs flex items-center gap-2" onClick={refresh} disabled={refreshing || loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Site</label>
            <Select.Root value={tenantId || '__all'} onValueChange={(v) => setTenantId(v === '__all' ? '' : v)}>
              <Select.Trigger className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
                <Select.Value placeholder="All sites" />
                <Select.Icon className="ml-auto"><ChevronDown className="w-4 h-4 text-gray-400" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                  <Select.Viewport className="p-1">
                    <Select.Item value="__all" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                      <Select.ItemText>All sites</Select.ItemText>
                      <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                    </Select.Item>
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

          <div>
            <label className="label">Window</label>
            <select className="input" value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))}>
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={72}>Last 72 hours</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={includeDoors} onChange={(e) => setIncludeDoors(e.target.checked)} className="accent-[#006FFF]" />
              Show per-door backfill lag
            </label>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-[#006FFF]" />
              Auto refresh (30s)
            </label>
          </div>
        </div>
      </div>

      {!data || loading ? (
        <div className="card p-8 text-center text-sm text-gray-400">Loading health...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-4"><p className="text-xs uppercase tracking-wide text-gray-400">Sites</p><p className="text-2xl font-bold text-gray-900">{data.summary.total}</p></div>
            <div className="card p-4"><p className="text-xs uppercase tracking-wide text-gray-400">Good</p><p className="text-2xl font-bold text-green-600">{data.summary.good}</p></div>
            <div className="card p-4"><p className="text-xs uppercase tracking-wide text-gray-400">Warn</p><p className="text-2xl font-bold text-amber-600">{data.summary.warn}</p></div>
            <div className="card p-4"><p className="text-xs uppercase tracking-wide text-gray-400">Critical</p><p className="text-2xl font-bold text-red-600">{data.summary.critical}</p></div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-xs text-gray-500">
              Last updated: {fmtTs(data.generatedAt)}
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b">
                    <th className="px-4 py-2">Site</th>
                    <th className="px-4 py-2">Overall</th>
                    <th className="px-4 py-2">Controller</th>
                    <th className="px-4 py-2">Webhook (24h)</th>
                    <th className="px-4 py-2">Last Success</th>
                    <th className="px-4 py-2">Last Sync</th>
                    <th className="px-4 py-2">Stale Doors</th>
                    <th className="px-4 py-2">Doors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((r) => (
                    <Fragment key={r.tenantId}>
                      <tr>
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900">{r.tenantName}</div>
                          <div className="text-xs text-gray-400">{r.timezone}</div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${severityClass(r.overallSeverity)}`}>{r.overallSeverity}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className={`text-xs inline-flex px-2 py-0.5 rounded ${severityClass(r.controller.severity)}`}>{r.controller.reachable ? 'Reachable' : 'Unreachable'}</div>
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {r.webhook.successCount} ok / {r.webhook.failureCount} fail
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {formatAge(r.webhook.lastSuccessAgeSeconds)}
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {formatAge(r.backfill.syncAgeSeconds)}
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {r.backfill.staleDoorCount}/{r.backfill.activeDoorCount}
                        </td>
                        <td className="px-4 py-2">
                          {includeDoors && (
                            <button
                              type="button"
                              className="text-xs text-[#006FFF] hover:underline"
                              onClick={() => setExpanded((p) => ({ ...p, [r.tenantId]: !p[r.tenantId] }))}
                            >
                              {expanded[r.tenantId] ? 'Hide' : 'Show'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {includeDoors && expanded[r.tenantId] && (
                        <tr key={`${r.tenantId}-doors`}>
                          <td className="px-4 pb-4 pt-0" colSpan={8}>
                            <div className="border border-gray-100 rounded-lg overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50">
                                  <tr className="text-left text-gray-400 uppercase tracking-wide">
                                    <th className="px-3 py-2">Door</th>
                                    <th className="px-3 py-2">Cached Through</th>
                                    <th className="px-3 py-2">Lag</th>
                                    <th className="px-3 py-2">Stale</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {r.backfill.doors.map((d) => (
                                    <tr key={d.doorId}>
                                      <td className="px-3 py-2 text-gray-700">{d.doorName}</td>
                                      <td className="px-3 py-2 text-gray-500">{fmtTs(d.logsCachedThrough)}</td>
                                      <td className="px-3 py-2 text-gray-500">{formatAge(d.lagSeconds)}</td>
                                      <td className="px-3 py-2">
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${d.stale ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                                          {d.stale ? 'stale' : 'current'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
