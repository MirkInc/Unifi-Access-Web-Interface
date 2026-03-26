'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import type { AnalyticsOverview } from '@/types'

interface Props {
  doorId: string
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

export function DoorAnalyticsPanel({ doorId }: Props) {
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const end = useMemo(() => toDateInput(Math.floor(Date.now() / 1000)), [])
  const start = useMemo(() => toDateInput(Math.floor(Date.now() / 1000) - 30 * 86400), [])
  const since = useMemo(() => Math.floor(new Date(start).getTime() / 1000), [start])
  const until = useMemo(() => Math.floor(new Date(`${end}T23:59:59`).getTime() / 1000), [end])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          since: String(since),
          until: String(until),
        })
        const res = await fetch(`/api/analytics/door/${doorId}?${params}`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        setData(await res.json())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [doorId, since, until])

  const pieColors = ['#006FFF', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b', '#94a3b8']

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Door Analytics</h2>
        <p className="text-xs text-gray-400">Last 30 days</p>
      </div>

      {loading || !data ? (
        <p className="text-sm text-gray-400">Loading analytics...</p>
      ) : (
        <div className="space-y-4">
          <div className={`grid grid-cols-2 ${data.analyticsPreferences.hideUnlockedTime && data.analyticsPreferences.hideUnauthorizedOpenTime ? 'md:grid-cols-6' : data.analyticsPreferences.hideUnlockedTime || data.analyticsPreferences.hideUnauthorizedOpenTime ? 'md:grid-cols-7' : 'md:grid-cols-8'} gap-3`}>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p><p className="text-lg font-semibold text-gray-900">{data.kpi.total}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Granted</p><p className="text-lg font-semibold text-[#006FFF]">{data.kpi.granted}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Denied</p><p className="text-lg font-semibold text-red-500">{data.kpi.denied}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Rate</p><p className="text-lg font-semibold text-gray-900">{(data.kpi.denialRate * 100).toFixed(1)}%</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Opened</p><p className="text-lg font-semibold text-amber-500">{data.openCloseKpi.opened}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Closed</p><p className="text-lg font-semibold text-emerald-600">{data.openCloseKpi.closed}</p></div>
            {!data.analyticsPreferences.hideUnlockedTime && (
              <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Unlocked</p><p className="text-lg font-semibold text-indigo-600">{formatDuration(data.openCloseKpi.unlockedSeconds)}</p></div>
            )}
            {!data.analyticsPreferences.hideUnauthorizedOpenTime && (
              <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Unauthorized Open</p><p className="text-lg font-semibold text-red-600">{formatDuration(data.openCloseKpi.unauthorizedOpenSeconds)}</p></div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Denial Trend</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.denialByDay}>
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="denied" fill="#ef4444" name="Denied" />
                    <Bar dataKey="total" fill="#006FFF" name="Total" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Door Open/Close by Day</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.openCloseByDay}>
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="opened" fill="#f59e0b" name="Opened" />
                    <Bar dataKey="closed" fill="#10b981" name="Closed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Method Mix</p>
              {data.methodMix.length === 0 ? (
                <p className="text-sm text-gray-400">No method data.</p>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.methodMix} dataKey="count" nameKey="method" outerRadius={65} label>
                        {data.methodMix.map((m, i) => <Cell key={m.method} fill={pieColors[i % pieColors.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            {!data.analyticsPreferences.hideUnlockedTime && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Estimated Unlocked by Day</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.unlockedByDay}>
                      <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={formatDurationAxis} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v: number) => formatDuration(Number(v))} />
                      <Bar dataKey="unlockedSeconds" fill="#4f46e5" name="Unlocked" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {!data.analyticsPreferences.hideUnauthorizedOpenTime && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Unauthorized Open Time by Day</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.unauthorizedOpenByDay}>
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={formatDurationAxis} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => formatDuration(Number(v))} />
                    <Bar dataKey="unauthorizedOpenSeconds" fill="#ef4444" name="Unauthorized Open" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Anomalies</p>
            {data.anomalies.length === 0 ? (
              <p className="text-sm text-gray-400">No anomalies detected.</p>
            ) : (
              <div className="space-y-1">
                {data.anomalies.slice(0, 5).map((a, idx) => (
                  <div key={`${a.type}-${a.bucket}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 truncate">{a.type} / {a.bucket}</p>
                      <p className="text-xs text-gray-400 truncate">{a.reason}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${a.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                      {a.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
