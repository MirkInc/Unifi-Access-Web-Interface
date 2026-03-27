'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDoorOpen, faDoorClosed, faLock, faLockOpen, faBuildingLock, faBuilding } from '@fortawesome/free-solid-svg-icons'
import { formatTime, getInitials, isAccessDenied } from '@/lib/utils'
import { unlockMethodLabel, denialReason as classifyDenialReason, actorLabel as classifyActorLabel } from '@/lib/accessLogClassification'
import type { UnifiLogEntry } from '@/types'

type LogFilter = 'access' | 'door_status' | 'door_position'

interface DoorStatusEvent {
  id: string
  event: string
  timestamp: number
  unifiDoorId: string
  doorName: string
  label: string
  sublabel?: string
  statusType: 'open' | 'close' | 'unlock' | 'lockdown_on' | 'lockdown_off' | 'evac_on' | 'evac_off' | 'schedule_on' | 'schedule_off' | 'temp_unlock_on' | 'temp_unlock_off' | 'other'
}

const FILTER_LABELS: { value: LogFilter; label: string }[] = [
  { value: 'access', label: 'Access Events' },
  { value: 'door_position', label: 'Door Open/Close' },
  { value: 'door_status', label: 'All' },
]

interface Props {
  tenantId: string
  doorId?: string
  showExport?: boolean
  since?: number
  until?: number
  pageSize?: number
  timezone?: string
  refreshTrigger?: number
  accessLogsOverride?: UnifiLogEntry[] | null
  accessLogsLoadingOverride?: boolean
}

export function ActivityLogTable({
  tenantId,
  doorId,
  showExport = false,
  since,
  until,
  pageSize = 100,
  timezone,
  refreshTrigger,
  accessLogsOverride,
  accessLogsLoadingOverride = false,
}: Props) {
  const [logs, setLogs] = useState<UnifiLogEntry[]>([])
  const [pendingLogs, setPendingLogs] = useState<UnifiLogEntry[]>([])
  const [doorStatusLogs, setDoorStatusLogs] = useState<DoorStatusEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [logFilter, setLogFilter] = useState<LogFilter>('access')
  const currentLogsRef = useRef<UnifiLogEntry[]>([])
  const fetchCountRef = useRef(0)

  // topic drives what UniFi returns for the access tab
  const topic = 'door_openings'
  const useExternalAccess = accessLogsOverride !== undefined

  const displayedLogs = logs

  const fetchLogs = useCallback(async (silent = false) => {
    const myCount = ++fetchCountRef.current
    if (!silent) setLoading(true)

    if (logFilter === 'door_status' || logFilter === 'door_position') {
      // Fetch from webhook-events; only works when doorId is provided
      if (!doorId) {
        if (!silent) setLoading(false)
        return
      }
      try {
        const params = new URLSearchParams({ tenantId, limit: String(pageSize) })
        params.set('doorId', doorId)
        if (since) params.set('since', String(since))
        if (until) params.set('until', String(until))
        const res = await fetch(`/api/webhook-events?${params}`, { cache: 'no-store' })
        if (res.ok && myCount === fetchCountRef.current) {
          const fresh: DoorStatusEvent[] = await res.json()
          const filtered =
            logFilter === 'door_position'
              ? fresh.filter((evt) => evt.statusType === 'open' || evt.statusType === 'close')
              : fresh
          setDoorStatusLogs(filtered)
        }
      } finally {
        if (!silent && myCount === fetchCountRef.current) setLoading(false)
      }
      return
    }

    // Access tab can use parent-provided shared dataset
    if (useExternalAccess) {
      if (!silent) setLoading(false)
      return
    }

    // Access tab: fetch from /api/logs
    const params = new URLSearchParams({ tenantId, pageSize: String(pageSize), topic })
    if (doorId) params.set('doorId', doorId)
    if (since) params.set('since', String(since))
    if (until) params.set('until', String(until))
    try {
      const res = await fetch(`/api/logs?${params}`, { cache: 'no-store' })
      if (res.ok && myCount === fetchCountRef.current) {
        const fresh: UnifiLogEntry[] = await res.json()
        if (silent) {
          const newestTs = currentLogsRef.current[0]?.event?.timestamp ?? 0
          const newer = fresh.filter((l) => (l.event?.timestamp ?? 0) > newestTs)
          if (newer.length > 0) setPendingLogs(newer)
        } else {
          setPendingLogs([])
          setLogs(fresh)
          currentLogsRef.current = fresh
        }
      }
    } finally {
      if (!silent && myCount === fetchCountRef.current) setLoading(false)
    }
  }, [tenantId, doorId, since, until, pageSize, topic, logFilter, useExternalAccess])

  const flushPending = useCallback(() => {
    setLogs((prev) => {
      const merged = [...pendingLogs, ...prev]
      currentLogsRef.current = merged
      return merged
    })
    setPendingLogs([])
  }, [pendingLogs])

  // Keep ref in sync when logs are replaced by full reload
  useEffect(() => { currentLogsRef.current = logs }, [logs])

  // Sync access logs from parent when provided
  useEffect(() => {
    if (!useExternalAccess) return
    setLogs(accessLogsOverride ?? [])
    setPendingLogs([])
    setLoading(accessLogsLoadingOverride)
  }, [useExternalAccess, accessLogsOverride, accessLogsLoadingOverride])

  // Full reload when range/door changes
  useEffect(() => {
    if (useExternalAccess && logFilter !== 'door_status' && logFilter !== 'door_position') return
    fetchLogs(false)
  }, [fetchLogs, useExternalAccess, logFilter])

  // Silent refresh when an action is taken
  const prevTrigger = useRef(refreshTrigger)
  useEffect(() => {
    if (useExternalAccess && logFilter !== 'door_status' && logFilter !== 'door_position') return
    if (refreshTrigger === prevTrigger.current) return
    prevTrigger.current = refreshTrigger
    fetchLogs(true)
  }, [refreshTrigger, fetchLogs, useExternalAccess, logFilter])

  // Periodic silent refresh every 30s
  useEffect(() => {
    if (useExternalAccess && logFilter !== 'door_status' && logFilter !== 'door_position') return
    const id = setInterval(() => fetchLogs(true), 60_000)
    return () => clearInterval(id)
  }, [fetchLogs, useExternalAccess, logFilter])

  async function handleExport() {
    setExporting(true)
    const params = new URLSearchParams({ tenantId })
    params.set('filter', logFilter)
    if (doorId) params.set('doorId', doorId)
    if (since) params.set('since', String(since))
    if (until) params.set('until', String(until))
    try {
      const res = await fetch(`/api/logs/export?${params}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const baseName =
          logFilter === 'access'
            ? 'access-events'
            : logFilter === 'door_position'
            ? 'door-open-close'
            : 'door-status-all'
        a.download = `${baseName}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setExporting(false)
    }
  }

  function unlockMethod(log: UnifiLogEntry): string {
    return unlockMethodLabel(log)
  }

  function denialReason(log: UnifiLogEntry): string {
    return classifyDenialReason(log)
  }

  function actorLabel(log: UnifiLogEntry): string {
    return classifyActorLabel(log)
  }

  // Group logs by date
  const tzOpts = timezone ? { timeZone: timezone } : {}
  const dateKey = (d: Date) =>
    d.toLocaleDateString('en-US', { ...tzOpts, year: 'numeric', month: '2-digit', day: '2-digit' })
  const nowTs = Math.floor(Date.now() / 1000)
  const todayKey = dateKey(new Date(nowTs * 1000))
  const yesterdayKey = dateKey(new Date((nowTs - 86400) * 1000))

  const dayLabel = (d: Date) => {
    const k = dateKey(d)
    if (k === todayKey) return 'Today'
    if (k === yesterdayKey) return 'Yesterday'
    return d.toLocaleDateString('en-US', { ...tzOpts, month: 'long', day: 'numeric', year: 'numeric' })
  }

  // Build ordered list of all days in range (newest first)
  const rangeStart = since ? new Date(since * 1000) : new Date(nowTs * 1000)
  rangeStart.setHours(0, 0, 0, 0)
  const rangeEnd = until ? new Date(until * 1000) : new Date(nowTs * 1000)
  rangeEnd.setHours(23, 59, 59, 999)

  const allDays: { label: string; key: string }[] = []
  const cur = new Date(rangeEnd)
  cur.setHours(12, 0, 0, 0)
  while (cur >= rangeStart) {
    allDays.push({ label: dayLabel(cur), key: dateKey(cur) })
    cur.setDate(cur.getDate() - 1)
  }

  // Group access logs by day key
  const groups: Record<string, UnifiLogEntry[]> = {}
  for (const log of displayedLogs) {
    const ts = log.event?.timestamp
    if (!ts) continue
    const k = dateKey(new Date(ts * 1000))
    groups[k] = groups[k] ?? []
    groups[k].push(log)
  }

  // Group door status events by day key
  const doorStatusGroups: Record<string, DoorStatusEvent[]> = {}
  for (const evt of doorStatusLogs) {
    const k = dateKey(new Date(evt.timestamp * 1000))
    doorStatusGroups[k] = doorStatusGroups[k] ?? []
    doorStatusGroups[k].push(evt)
  }

  function statusTypeStyles(statusType: DoorStatusEvent['statusType']): { bg: string; text: string; pill: string; pillText: string } {
    switch (statusType) {
      case 'open':        return { bg: 'bg-red-500',    text: 'text-red-700',    pill: 'bg-red-50',    pillText: 'text-red-700' }
      case 'close':       return { bg: 'bg-sky-500',    text: 'text-sky-700',    pill: 'bg-sky-50',    pillText: 'text-sky-700' }
      case 'unlock':      return { bg: 'bg-blue-500',   text: 'text-blue-700',   pill: 'bg-blue-50',   pillText: 'text-blue-700' }
      case 'lockdown_on': return { bg: 'bg-red-600',    text: 'text-red-700',    pill: 'bg-red-50',    pillText: 'text-red-700' }
      case 'lockdown_off':return { bg: 'bg-gray-400',   text: 'text-gray-600',   pill: 'bg-gray-50',   pillText: 'text-gray-600' }
      case 'evac_on':     return { bg: 'bg-orange-500', text: 'text-orange-700', pill: 'bg-orange-50', pillText: 'text-orange-700' }
      case 'evac_off':    return { bg: 'bg-gray-400',   text: 'text-gray-600',   pill: 'bg-gray-50',   pillText: 'text-gray-600' }
      case 'schedule_on': return { bg: 'bg-purple-500', text: 'text-purple-700', pill: 'bg-purple-50', pillText: 'text-purple-700' }
      case 'schedule_off':return { bg: 'bg-gray-400',   text: 'text-gray-600',   pill: 'bg-gray-50',   pillText: 'text-gray-600' }
      case 'temp_unlock_on':  return { bg: 'bg-cyan-500',  text: 'text-cyan-700',  pill: 'bg-cyan-50',  pillText: 'text-cyan-700' }
      case 'temp_unlock_off': return { bg: 'bg-gray-400',  text: 'text-gray-600',  pill: 'bg-gray-50',  pillText: 'text-gray-600' }
      default:            return { bg: 'bg-gray-300',   text: 'text-gray-600',   pill: 'bg-gray-50',   pillText: 'text-gray-600' }
    }
  }

  function statusPillLabel(statusType: DoorStatusEvent['statusType']): string {
    switch (statusType) {
      case 'open':         return 'Open'
      case 'close':        return 'Closed'
      case 'unlock':       return 'Unlocked'
      case 'lockdown_on':  return 'Lockdown'
      case 'lockdown_off': return 'Cleared'
      case 'evac_on':      return 'Evacuation'
      case 'evac_off':     return 'Cleared'
      case 'schedule_on':  return 'Scheduled'
      case 'schedule_off': return 'Unscheduled'
      case 'temp_unlock_on':  return 'Started'
      case 'temp_unlock_off': return 'Ended'
      default:             return 'Event'
    }
  }

  function statusTypeIcon(statusType: DoorStatusEvent['statusType']) {
    switch (statusType) {
      case 'open':
        return faDoorOpen
      case 'lockdown_on':
        return faBuildingLock
      case 'lockdown_off':
        return faBuilding
      case 'close':
        return faDoorClosed
      case 'temp_unlock_off':
        return faLock
      case 'unlock':
      case 'evac_on':
      case 'evac_off':
      case 'schedule_on':
      case 'schedule_off':
      case 'temp_unlock_on':
        return faLockOpen
      default:
        return faLock
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Filter pills */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {FILTER_LABELS.map((f) => (
            <button
              key={f.value}
              onClick={() => setLogFilter(f.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                logFilter === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Export */}
        {showExport && (
          <button className="btn-secondary flex items-center gap-2 text-xs" onClick={handleExport} disabled={exporting || ((logFilter === 'door_status' || logFilter === 'door_position') && !doorId)}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        )}
      </div>

      {logFilter === 'access' && pendingLogs.length > 0 && (
        <button
          onClick={flushPending}
          className="w-full mb-3 py-1.5 px-3 rounded-lg bg-[#006FFF]/10 text-[#006FFF] text-xs font-semibold hover:bg-[#006FFF]/20 transition-colors"
        >
          {pendingLogs.length} new event{pendingLogs.length > 1 ? 's' : ''} — tap to load
        </button>
      )}

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
      ) : logFilter === 'door_status' || logFilter === 'door_position' ? (
        /* ---- Door Status tab ---- */
        !doorId ? (
          <p className="text-sm text-gray-400 text-center py-8">Select a specific door to view door status events.</p>
        ) : doorStatusLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No door status events yet. Register a webhook in the site admin to enable real-time door status tracking.
          </p>
        ) : (
          <div className="space-y-4">
            {allDays.map(({ label: dayLbl, key }) => (
              <div key={key}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{dayLbl}</p>
                {!doorStatusGroups[key] || doorStatusGroups[key].length === 0 ? (
                  <p className="text-xs text-gray-300 italic pl-1">No activity</p>
                ) : (
                  <div className="space-y-1">
                    {doorStatusGroups[key].map((evt) => {
                      const styles = statusTypeStyles(evt.statusType)
                      return (
                        <div key={evt.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50">
                          <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                            {formatTime(evt.timestamp, timezone)}
                          </span>

                          {/* Status icon circle */}
                          <span className={`w-7 h-7 rounded-full ${styles.bg} flex items-center justify-center flex-shrink-0`}>
                            <FontAwesomeIcon icon={statusTypeIcon(evt.statusType)} className="w-3.5 h-3.5 text-white" />
                          </span>

                          {/* Label + sublabel */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">{evt.label}</p>
                            {evt.sublabel && (
                              <p className="text-xs text-gray-400">{evt.sublabel}</p>
                            )}
                          </div>

                          {/* Status pill */}
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md flex-shrink-0 ${styles.pill} ${styles.pillText}`}>
                            {statusPillLabel(evt.statusType)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        /* ---- Access tab ---- */
        <div className="space-y-4">
          {allDays.map(({ label, key }) => (
            <div key={key}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
              {!groups[key] || groups[key].length === 0 ? (
                <p className="text-xs text-gray-300 italic pl-1">No activity</p>
              ) : (
              <div className="space-y-1">
                {(groups[key] ?? []).map((log, i) => {
                  const ts = log.event?.timestamp
                  const actor = actorLabel(log)
                  const initials = getInitials(actor)
                  const method = unlockMethod(log)
                  const doorName = log.event?.object_name ?? ''
                  const denied = isAccessDenied(log)
                  const reason = denied ? denialReason(log) : null

                  return (
                    <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-lg ${denied ? 'bg-red-50/70 hover:bg-red-100/70' : 'hover:bg-gray-50'}`}>
                      <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                        {ts ? formatTime(ts, timezone) : '—'}
                      </span>

                      {/* Avatar */}
                      <span className={`w-7 h-7 rounded-full text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 ${denied ? 'bg-red-400' : 'bg-[#006FFF]'}`}>
                        {initials}
                      </span>

                      {/* Name + method / reason */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${denied ? 'text-red-600' : 'text-gray-700'}`}>{actor}</p>
                        <p className="text-xs text-gray-400">{denied ? reason : method}</p>
                      </div>

                      {/* Door name (when not on a door-specific view) */}
                      {!doorId && doorName && (
                        <span className="text-xs text-gray-400 truncate max-w-[120px]">{doorName}</span>
                      )}

                      {/* Result badge + icon */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {denied ? (
                          <>
                            <span className="text-xs font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md">Denied</span>
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">Granted</span>
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-500">
                              <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0010 5.5V9H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1.5V5.5a3 3 0 116 0v2.75a.75.75 0 001.5 0V5.5A4.5 4.5 0 0014.5 1z" clipRule="evenodd" />
                            </svg>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

