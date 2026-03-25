'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { cn } from '@/lib/utils'

type ConsoleFilter = 'all' | 'connected' | 'attention'

interface ConsoleSummary {
  id: string
  name: string
  host: string
  timezone?: string
  isConnected: boolean
  totalDoors: number
  locked: number
  unlocked: number
  open: number
  warning: number
  error?: string
}

interface Props {
  consoles: ConsoleSummary[]
  tenants: { _id: string; name: string }[]
  currentTenantId: string
  userName: string
  isAdmin: boolean
  emptyMessage?: string
}

export function SiteManagerClient({ consoles, tenants, currentTenantId, userName, isAdmin, emptyMessage }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ConsoleFilter>('all')

  const counts = useMemo(() => ({
    all: consoles.length,
    connected: consoles.filter((c) => c.isConnected).length,
    attention: consoles.filter((c) => !c.isConnected || c.warning > 0).length,
  }), [consoles])

  const filtered = useMemo(() => {
    return consoles.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase())
      if (!matchSearch) return false
      if (filter === 'connected') return c.isConnected
      if (filter === 'attention') return !c.isConnected || c.warning > 0
      return true
    })
  }, [consoles, filter, search])

  const filters: { key: ConsoleFilter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'connected', label: `Connected (${counts.connected})` },
    { key: 'attention', label: `Attention (${counts.attention})` },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        tenants={tenants}
        currentTenantId={currentTenantId}
        userName={userName}
        isAdmin={isAdmin}
        tenantLabelOverride="Site Manager"
        activeNavItem="site-manager"
      />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-0 max-w-sm">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search consoles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="outline-none text-sm bg-transparent flex-1 min-w-0 placeholder-gray-400"
            />
          </div>

          <div className="flex items-center gap-0">
            {filters.map((f) => (
              <button
                key={f.key}
                className={cn(
                  'px-3 py-1.5 text-sm transition-colors border-b-2',
                  filter === f.key
                    ? 'border-[#006FFF] text-[#006FFF] font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-gray-500">
            {consoles.length === 0
              ? (emptyMessage ?? 'No consoles assigned to your account. Contact your administrator.')
              : 'No consoles match your filters.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((console) => {
              const hasWarning = console.warning > 0
              const isOffline = !console.isConnected
              return (
                <Link
                  key={console.id}
                  href={`/dashboard?tenantId=${console.id}`}
                  className={cn(
                    'card text-left p-4 hover:shadow-md transition-shadow',
                    hasWarning && 'ring-2 ring-red-500',
                    isOffline && 'ring-2 ring-amber-500'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 min-h-[1.75rem]">
                    <p className="font-semibold text-gray-900 truncate leading-7">{console.name}</p>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium mt-0.5',
                      console.isConnected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                    )}>
                      {console.isConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>

                  {console.timezone && <p className="text-xs text-gray-400 mt-1 truncate">{console.timezone}</p>}

                  <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Doors</span>
                      <span className="font-medium text-gray-700">{console.totalDoors}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Locked</span>
                      <span className="font-medium text-gray-700">{console.locked}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Unlocked</span>
                      <span className="font-medium text-[#006FFF]">{console.unlocked}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Open</span>
                      <span className="font-medium text-amber-600">{console.open}</span>
                    </div>
                  </div>

                  {hasWarning && (
                    <p className="mt-3 text-xs font-medium text-red-600">
                      {console.warning} unauthorized opening{console.warning === 1 ? '' : 's'}
                    </p>
                  )}
                  {isOffline && console.error && (
                    <p className="mt-3 text-xs text-amber-700 truncate">{console.error}</p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
