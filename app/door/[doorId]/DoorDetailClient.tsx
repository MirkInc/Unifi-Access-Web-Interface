'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { DoorControl } from '@/components/DoorControl'
import { ActivityChart, type RangeType } from '@/components/ActivityChart'
import { ActivityLogTable } from '@/components/ActivityLogTable'
import { cn } from '@/lib/utils'
import { DateRangePicker } from '@/components/DateRangePicker'
import { UnlockScheduleCard } from './UnlockScheduleCard'
import type { DoorStatus, UnifiLogEntry } from '@/types'

interface Props {
  door: DoorStatus
  permissions: {
    canUnlock: boolean
    canEndLockSchedule: boolean
    canTempLock: boolean
    canEndTempLock: boolean
    canViewLogs: boolean
  }
  controllerError: string | null
  timezone?: string
  doorName: string
  backHref: string
  scheduleId?: string
  scheduleName?: string
}

const QUICK_RANGES: { label: string; value: RangeType }[] = [
  { label: '1D', value: '1D' },
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: 'Custom', value: 'custom' },
]
const MIN_STATUS_REFRESH_MS = 1500

function toDateInput(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function formatRangeLabel(since: number, until: number, range: RangeType): string {
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (range === '1D') {
    const d = new Date(until * 1000)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return 'Last 24 hours'
    return fmt(since) + ' - ' + fmt(until)
  }
  return fmt(since) + ' - ' + fmt(until)
}

function computeWindow(range: RangeType, customStart: string, customEnd: string): { since: number; until: number } {
  const now = Math.floor(Date.now() / 1000)
  if (range === 'custom') {
    const since = customStart ? Math.floor(new Date(customStart).getTime() / 1000) : now - 86400
    const until = customEnd ? Math.floor(new Date(customEnd + 'T23:59:59').getTime() / 1000) : now
    return { since, until }
  }
  if (range === '1D') {
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    return { since: now - 86400, until: Math.floor(endOfToday.getTime() / 1000) }
  }
  const offsets: Record<string, number> = { '1W': 7 * 86400, '1M': 30 * 86400, '3M': 90 * 86400 }
  return { since: now - offsets[range], until: now }
}

function useSessionBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(key)
      if (stored !== null) setValue(stored === '1')
    } catch {
      // ignore
    } finally {
      setHydrated(true)
    }
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.sessionStorage.setItem(key, value ? '1' : '0')
    } catch {
      // ignore
    }
  }, [key, value, hydrated])

  return [value, setValue] as const
}

export function DoorDetailClient({ door: initialDoor, permissions, controllerError, timezone, doorName, backHref, scheduleId, scheduleName }: Props) {
  const [door, setDoor] = useState(initialDoor)
  const [refreshKey, setRefreshKey] = useState(0)
  const controlRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const statusInFlightRef = useRef(false)
  const statusQueuedRef = useRef(false)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStatusFetchAtRef = useRef(0)

  const [scheduleOpen, setScheduleOpen] = useSessionBoolean('door.section.unlockSchedule', true)
  const [chartOpen, setChartOpen] = useSessionBoolean('door.section.activityChart', true)
  const [logOpen, setLogOpen] = useSessionBoolean('door.section.activityLog', true)

  useEffect(() => {
    function onScroll() {
      const card = controlRef.current
      const badge = badgeRef.current
      if (!card || !badge) return
      badge.style.opacity = card.getBoundingClientRect().bottom < 56 ? '1' : '0'
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const [range, setRange] = useState<RangeType>('1D')
  const [customStart, setCustomStart] = useState(() => toDateInput(Math.floor(Date.now() / 1000) - 7 * 86400))
  const [customEnd, setCustomEnd] = useState(() => toDateInput(Math.floor(Date.now() / 1000)))
  const [sharedLogs, setSharedLogs] = useState<UnifiLogEntry[]>([])
  const [sharedLogsLoading, setSharedLogsLoading] = useState(false)

  const { since, until } = useMemo(
    () => computeWindow(range, customStart, customEnd),
    [range, customStart, customEnd]
  )
  const rangeLabel = formatRangeLabel(since, until, range)
  const logPageSize = range === '1D' ? 500 : range === '1W' ? 1000 : range === '1M' ? 2000 : 3000
  const shouldLoadSharedLogs = permissions.canViewLogs && (chartOpen || logOpen)

  useEffect(() => {
    if (!shouldLoadSharedLogs) {
      setSharedLogsLoading(false)
      return
    }

    let cancelled = false

    async function fetchSharedLogs() {
      setSharedLogsLoading(true)
      try {
        const params = new URLSearchParams({
          tenantId: door.tenantId,
          doorId: door.id,
          since: String(since),
          until: String(until),
          pageSize: String(logPageSize),
        })
        const res = await fetch(`/api/logs?${params}`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data: UnifiLogEntry[] = await res.json()
        if (!cancelled) setSharedLogs(data)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSharedLogsLoading(false)
      }
    }

    fetchSharedLogs()
    return () => { cancelled = true }
  }, [door.tenantId, door.id, since, until, logPageSize, refreshKey, shouldLoadSharedLogs])

  const fetchStatusNow = useCallback(async () => {
    if (statusInFlightRef.current) {
      statusQueuedRef.current = true
      return
    }

    statusInFlightRef.current = true
    try {
      const res = await fetch(`/api/doors/${door.id}/status`)
      if (res.ok) {
        const latest = await res.json()
        setDoor((prev) => ({
          ...prev,
          ...latest,
          firstPersonInRequired:
            latest.firstPersonInRequired ?? prev.firstPersonInRequired,
        }))
      }
    } catch {
      // ignore
    } finally {
      statusInFlightRef.current = false
      lastStatusFetchAtRef.current = Date.now()

      if (statusQueuedRef.current) {
        statusQueuedRef.current = false
        const waitMs = Math.max(0, MIN_STATUS_REFRESH_MS - (Date.now() - lastStatusFetchAtRef.current))
        if (waitMs === 0) {
          void fetchStatusNow()
        } else if (!statusTimerRef.current) {
          statusTimerRef.current = setTimeout(() => {
            statusTimerRef.current = null
            void fetchStatusNow()
          }, waitMs)
        }
      }
    }
  }, [door.id])

  const queueStatusRefresh = useCallback((force = false) => {
    if (force) {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current)
        statusTimerRef.current = null
      }
      void fetchStatusNow()
      return
    }

    const waitMs = Math.max(0, MIN_STATUS_REFRESH_MS - (Date.now() - lastStatusFetchAtRef.current))
    if (waitMs === 0) {
      void fetchStatusNow()
      return
    }
    if (statusTimerRef.current) return
    statusTimerRef.current = setTimeout(() => {
      statusTimerRef.current = null
      void fetchStatusNow()
    }, waitMs)
  }, [fetchStatusNow])

  const refresh = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 400))
    await fetchStatusNow()
    setRefreshKey((k) => k + 1)
    setTimeout(async () => {
      await fetchStatusNow()
      setRefreshKey((k) => k + 1)
    }, 1500)
  }, [fetchStatusNow])

  useEffect(() => {
    queueStatusRefresh(true)
  }, [queueStatusRefresh])

  useEffect(() => {
    let es: EventSource | null = null
    let pollId: ReturnType<typeof setInterval> | null = null

    es = new EventSource(`/api/tenants/${door.tenantId}/events`)
    es.addEventListener('door_update', () => queueStatusRefresh())
    es.addEventListener('error', () => {
      es?.close()
      es = null
      if (!pollId) pollId = setInterval(queueStatusRefresh, 10_000)
    })

    return () => {
      es?.close()
      if (pollId) clearInterval(pollId)
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current)
        statusTimerRef.current = null
      }
    }
  }, [door.tenantId, queueStatusRefresh])

  const isUnlocked = door.lockStatus === 'unlock'
  const isUnauthorizedOpening =
    door.positionStatus === 'open' &&
    door.lockStatus === 'lock' &&
    door.lockRule?.type !== 'keep_lock'

  return (
    <>
      <div className="bg-white border-b border-gray-100 sticky top-14 z-30">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href={backHref} className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-bold text-gray-900 text-base">{doorName}</h1>
          {door.lockStatus && (
            <span
              ref={badgeRef}
              style={{ opacity: 0, transition: 'opacity 0.15s' }}
              className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                isUnlocked ? 'bg-[#006FFF]/10 text-[#006FFF]' : 'bg-gray-100 text-gray-600'
              )}
            >
              {isUnlocked ? 'Unlocked' : 'Locked'}
            </span>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {controllerError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
            <strong>Controller unreachable:</strong> {controllerError}
          </div>
        )}

        <div ref={controlRef} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DoorControl door={door} permissions={permissions} onAction={refresh} timezone={timezone} />

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Door Status</h2>
            {isUnauthorizedOpening && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                Unauthorized Opening
              </div>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Lock</span>
                <span className={
                  isUnauthorizedOpening
                    ? 'text-red-600 font-medium'
                    : door.lockStatus === 'unlock'
                    ? 'text-[#006FFF] font-medium'
                    : 'text-gray-700'
                }>
                  {door.lockStatus === 'unlock' ? 'Unlocked' : door.lockStatus === 'lock' ? 'Locked' : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Position</span>
                <span className={
                  isUnauthorizedOpening
                    ? 'text-red-600 font-medium'
                    : door.positionStatus === 'open'
                    ? 'text-amber-500 font-medium'
                    : 'text-gray-700'
                }>
                  {door.positionStatus === 'open' ? 'Open' : door.positionStatus === 'close' ? 'Closed' : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Controller</span>
                <span className={door.isOnline ? 'text-green-500' : 'text-gray-400'}>
                  {door.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              {door.lockRule && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Active Rule</span>
                  <span className="text-gray-700 capitalize">{door.lockRule.type.replace('_', ' ')}</span>
                </div>
              )}
              {door.firstPersonInRequired && (
                <div className="flex justify-between">
                  <span className="text-gray-500">First Person In</span>
                  <span className="text-amber-700 font-medium">Required</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {(scheduleId || scheduleName) && (
          <UnlockScheduleCard
            doorId={door.id}
            scheduleId={scheduleId}
            fallbackName={scheduleName}
            firstPersonInRequired={door.firstPersonInRequired === true}
            open={scheduleOpen}
            onToggle={() => setScheduleOpen((v) => !v)}
          />
        )}

        {permissions.canViewLogs && (
          <>
            {(chartOpen || logOpen) && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-0.5">
                  {QUICK_RANGES.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRange(r.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                        range === r.value
                          ? 'bg-[#006FFF] text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                {range === 'custom' && (
                  <DateRangePicker
                    start={customStart}
                    end={customEnd}
                    onStartChange={setCustomStart}
                    onEndChange={setCustomEnd}
                    max={toDateInput(Math.floor(Date.now() / 1000))}
                  />
                )}
              </div>
            )}

            <div className="card p-5">
              <button
                type="button"
                onClick={() => setChartOpen((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <h2 className="font-semibold text-gray-900">Activity Chart</h2>
                <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform', chartOpen ? 'rotate-180' : '')} />
              </button>
              {chartOpen && (
                <div className="mt-4">
                  <ActivityChart
                    doorId={door.id}
                    tenantId={door.tenantId}
                    since={since}
                    until={until}
                    rangeType={range}
                    rangeLabel={rangeLabel}
                    refreshTrigger={refreshKey}
                    pageSize={logPageSize}
                    externalLogs={sharedLogs}
                    externalLoading={sharedLogsLoading}
                  />
                </div>
              )}
            </div>

            <div className="card p-5">
              <button
                type="button"
                onClick={() => setLogOpen((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <h2 className="font-semibold text-gray-900">Activity Log</h2>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">{rangeLabel}</p>
                  <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform', logOpen ? 'rotate-180' : '')} />
                </div>
              </button>
              {logOpen && (
                <div className="mt-4">
                  <ActivityLogTable
                    tenantId={door.tenantId}
                    doorId={door.id}
                    showExport
                    since={since}
                    until={until}
                    pageSize={logPageSize}
                    timezone={timezone}
                    refreshTrigger={refreshKey}
                    accessLogsOverride={sharedLogs}
                    accessLogsLoadingOverride={sharedLogsLoading}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  )
}
