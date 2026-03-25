'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { isAccessDenied } from '@/lib/utils'
import type { UnifiLogEntry } from '@/types'

export type RangeType = '1D' | '1W' | '1M' | '3M' | 'custom'

interface Props {
  doorId: string
  tenantId: string
  since: number
  until: number
  rangeType: RangeType
  rangeLabel: string
  refreshTrigger?: number
  pageSize?: number
  externalLogs?: UnifiLogEntry[] | null
  externalLoading?: boolean
}


type Slot = { time: string; granted: number; denied: number }

function bucketLogs(logs: UnifiLogEntry[], since: number, until: number, rangeType: RangeType): Slot[] {
  if (rangeType === '1D') {
    // 24 hourly buckets anchored to current hour (always use real now, not frozen until)
    const nowHour = new Date()
    nowHour.setMinutes(0, 0, 0)
    const slots: (Slot & { hourMs: number })[] = []
    for (let h = 23; h >= 0; h--) {
      const hourMs = nowHour.getTime() - h * 3600_000
      const label = new Date(hourMs).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
      slots.push({ time: label, granted: 0, denied: 0, hourMs })
    }
    for (const log of logs) {
      const ts = log.event?.timestamp
      if (!ts) continue
      const logHourMs = Math.floor(ts * 1000 / 3600_000) * 3600_000
      const slot = slots.find((s) => s.hourMs === logHourMs)
      if (!slot) continue
      if (isAccessDenied(log)) slot.denied++
      else slot.granted++
    }
    return slots.map(({ time, granted, denied }) => ({ time, granted, denied }))
  }

  // Daily buckets aligned to local calendar days
  const sinceDay = new Date(since * 1000)
  sinceDay.setHours(0, 0, 0, 0)
  const untilDay = new Date(until * 1000)
  untilDay.setHours(23, 59, 59, 999)

  const slots: (Slot & { dateKey: string })[] = []
  const cur = new Date(sinceDay)
  while (cur <= untilDay) {
    const label = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const dateKey = cur.toLocaleDateString('en-US')
    slots.push({ time: label, granted: 0, denied: 0, dateKey })
    cur.setDate(cur.getDate() + 1)
  }

  for (const log of logs) {
    const ts = log.event?.timestamp
    if (!ts) continue
    const dateKey = new Date(ts * 1000).toLocaleDateString('en-US')
    const slot = slots.find((s) => s.dateKey === dateKey)
    if (!slot) continue
    if (isAccessDenied(log)) slot.denied++
    else slot.granted++
  }
  return slots.map(({ time, granted, denied }) => ({ time, granted, denied }))
}

export function ActivityChart({
  doorId,
  tenantId,
  since,
  until,
  rangeType,
  rangeLabel,
  refreshTrigger,
  pageSize = 500,
  externalLogs,
  externalLoading = false,
}: Props) {
  const [logs, setLogs] = useState<UnifiLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const fetchCountRef = useRef(0)
  const useExternal = externalLogs !== undefined

  const fetchLogs = useCallback(async (silent = false) => {
    const myCount = ++fetchCountRef.current
    if (!silent) setLoading(true)
    try {
      const res = await fetch(
        `/api/logs?tenantId=${tenantId}&doorId=${doorId}&since=${since}&until=${until}&pageSize=${pageSize}`,
        { cache: 'no-store' }
      )
      if (res.ok && myCount === fetchCountRef.current) setLogs(await res.json())
    } finally {
      if (!silent && myCount === fetchCountRef.current) setLoading(false)
    }
  }, [doorId, tenantId, since, until, pageSize])

  // Full reload when range changes
  useEffect(() => {
    if (useExternal) return
    fetchLogs(false)
  }, [fetchLogs, useExternal])

  // Silent refresh on action trigger
  const prevTrigger = useRef(refreshTrigger)
  useEffect(() => {
    if (useExternal) return
    if (refreshTrigger === prevTrigger.current) return
    prevTrigger.current = refreshTrigger
    fetchLogs(true)
  }, [refreshTrigger, fetchLogs, useExternal])

  // Periodic silent refresh every 30s
  useEffect(() => {
    if (useExternal) return
    const id = setInterval(() => fetchLogs(true), 60_000)
    return () => clearInterval(id)
  }, [fetchLogs, useExternal])

  const effectiveLogs = useExternal ? (externalLogs ?? []) : logs
  const effectiveLoading = useExternal ? externalLoading : loading
  const data = bucketLogs(effectiveLogs, since, until, rangeType)
  const granted = effectiveLogs.filter((l) => !isAccessDenied(l)).length
  const denied = effectiveLogs.filter(isAccessDenied).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Granted</p>
            <p className="text-xl font-bold text-gray-900">{granted}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Denied</p>
            <p className="text-xl font-bold text-red-500">{denied}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">{rangeLabel}</p>
      </div>

      <div className="h-64">
        {effectiveLoading ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={rangeType === '1D' ? 12 : undefined}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                cursor={{ fill: '#f9fafb' }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar
                dataKey="granted"
                name="Granted"
                stackId="a"
                fill="#006FFF"
                shape={(props: any) => {
                  const { x, y, width, height } = props
                  if (!width || !height || height <= 0) return <g />
                  if (!props.denied) {
                    // No denied bar on top — round the top corners
                    const r = Math.min(3, width / 2, height)
                    return (
                      <path
                        d={`M${x+r},${y} h${width-2*r} a${r},${r} 0 0 1 ${r},${r} v${height-r} H${x} V${y+r} a${r},${r} 0 0 1 ${r},${-r}Z`}
                        fill="#006FFF"
                      />
                    )
                  }
                  return <rect x={x} y={y} width={width} height={height} fill="#006FFF" />
                }}
              />
              <Bar dataKey="denied" name="Denied" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
