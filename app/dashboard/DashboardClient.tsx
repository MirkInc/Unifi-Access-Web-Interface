'use client'

import { useState, useEffect, useRef } from 'react'
import { DoorCard } from '@/components/DoorCard'
import { AppHeader } from '@/components/AppHeader'
import { cn } from '@/lib/utils'
import type { DoorStatus, UnifiLockRule } from '@/types'

type StatusFilter = 'all' | 'locked' | 'unlocked' | 'open' | 'warning'

interface Props {
  tenants: { _id: string; name: string }[]
  currentTenantId: string
  tenantName: string
  doors: DoorStatus[]
  doorPermissions: Record<string, object>
  controllerError: string | null
  userName: string
  isAdmin: boolean
  timezone?: string
}

export function DashboardClient({
  tenants,
  currentTenantId,
  tenantName,
  doors,
  controllerError,
  userName,
  isAdmin,
  timezone,
}: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Live status overlay — keyed by MongoDB door id
  type LiveStatus = { lockStatus: DoorStatus['lockStatus']; positionStatus: DoorStatus['positionStatus']; isOnline: boolean; lockRule: UnifiLockRule | null }
  const [liveStatuses, setLiveStatuses] = useState<Record<string, LiveStatus>>({})
  const doorsRef = useRef(doors)
  doorsRef.current = doors

  // Initial fetch + SSE for real-time updates
  useEffect(() => {
    let es: EventSource | null = null
    let pollId: ReturnType<typeof setInterval> | null = null

    async function fetchLive() {
      try {
        const res = await fetch(`/api/tenants/${currentTenantId}/live`)
        if (!res.ok) return
        const data: (LiveStatus & { id: string })[] = await res.json()
        setLiveStatuses(Object.fromEntries(data.map((d) => [d.id, { lockStatus: d.lockStatus, positionStatus: d.positionStatus, isOnline: d.isOnline, lockRule: d.lockRule }])))
      } catch { /* ignore */ }
    }

    fetchLive() // initial load

    // Subscribe to SSE push for real-time door events
    es = new EventSource(`/api/tenants/${currentTenantId}/events`)
    es.addEventListener('door_update', () => {
      // A door changed — re-fetch live statuses
      fetchLive()
    })
    es.addEventListener('error', () => {
      // SSE failed — fall back to polling every 15s
      es?.close()
      es = null
      if (!pollId) pollId = setInterval(fetchLive, 15_000)
    })

    return () => {
      es?.close()
      if (pollId) clearInterval(pollId)
    }
  }, [currentTenantId])

  // Merge live statuses into door list
  const liveDoors = doors.map((d) => {
    const live = liveStatuses[d.id]
    if (!live) return d
    return { ...d, lockStatus: live.lockStatus, positionStatus: live.positionStatus, isOnline: live.isOnline, lockRule: live.lockRule }
  })

  // Count statuses
  const counts = {
    all: liveDoors.length,
    locked: liveDoors.filter((d) => d.lockStatus === 'lock' && d.positionStatus !== 'open').length,
    unlocked: liveDoors.filter((d) => d.lockStatus === 'unlock').length,
    open: liveDoors.filter((d) => d.positionStatus === 'open' && d.lockStatus === 'unlock').length,
    warning: liveDoors.filter((d) => d.positionStatus === 'open' && d.lockStatus === 'lock').length,
  }

  const filtered = liveDoors.filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (statusFilter === 'all') return true
    if (statusFilter === 'locked') return d.lockStatus === 'lock' && d.positionStatus !== 'open'
    if (statusFilter === 'unlocked') return d.lockStatus === 'unlock'
    if (statusFilter === 'open') return d.positionStatus === 'open' && d.lockStatus === 'unlock'
    if (statusFilter === 'warning') return d.positionStatus === 'open' && d.lockStatus === 'lock'
    return true
  })

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: `All` },
    { key: 'locked', label: `Locked (${counts.locked})` },
    { key: 'unlocked', label: `Unlocked (${counts.unlocked})` },
    { key: 'open', label: `Open (${counts.open})` },
    { key: 'warning', label: `Warning (${counts.warning})` },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader tenants={tenants} currentTenantId={currentTenantId} userName={userName} isAdmin={isAdmin} />

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Controller error banner */}
        {controllerError && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
            <strong>Controller Unreachable:</strong> {controllerError} — door statuses may be stale.
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Search + location filter */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-0 max-w-xs">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search doors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="outline-none text-sm bg-transparent flex-1 min-w-0 placeholder-gray-400"
            />
          </div>

          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1 py-1">
            <button className="flex items-center gap-1.5 text-sm text-gray-700 font-medium px-3 py-1 rounded-lg hover:bg-gray-50">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-400">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              All Locations ({counts.all})
            </button>
          </div>

          {/* Status filter tabs */}
          <div className="flex items-center gap-0">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={cn(
                  'px-3 py-1.5 text-sm transition-colors border-b-2',
                  statusFilter === f.key
                    ? 'border-[#006FFF] text-[#006FFF] font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Door grid */}
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto mb-3 text-gray-300">
              <path d="M8 40V10a2 2 0 012-2h20l10 10v22a2 2 0 01-2 2H10a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" />
            </svg>
            {liveDoors.length === 0 ? (
              <p>No doors synced yet. Sync doors from the Management Portal.</p>
            ) : (
              <p>No doors match your filters.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((door) => (
              <DoorCard key={door.id} door={door} lockRule={door.lockRule} timezone={timezone} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
