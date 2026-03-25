'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Tenant {
  _id: string
  name: string
}

interface Props {
  tenants: Tenant[]
  currentTenantId: string
  showAdminLink?: boolean
  labelOverride?: string
  activeItem?: 'tenant' | 'site-manager' | 'management-portal'
}

export function TenantSwitcher({
  tenants,
  currentTenantId,
  showAdminLink,
  labelOverride,
  activeItem = 'tenant',
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()

  const current = tenants.find((t) => t._id === currentTenantId)
  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-800 max-w-[160px] truncate">
          {labelOverride ?? current?.name ?? 'Select Site'}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500 flex-shrink-0">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1 left-0 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm outline-none flex-1 placeholder-gray-400"
                autoFocus
              />
            </div>
          </div>

          {/* Tenant list */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No sites found</p>
            ) : (
              filtered.map((t) => (
                <Link
                  key={t._id}
                  href={`/dashboard?tenantId=${t._id}`}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left',
                    activeItem === 'tenant' && t._id === currentTenantId && 'bg-blue-50'
                  )}
                  onClick={() => setOpen(false)}
                >
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className={cn(
                    'flex-1 text-sm truncate',
                    activeItem === 'tenant' && t._id === currentTenantId ? 'font-semibold text-[#006FFF]' : 'text-gray-700'
                  )}>
                    {t.name}
                  </span>
                </Link>
              ))
            )}
          </div>

          {/* Admin / Management link */}
          <div className="border-t">
            <Link
              href="/"
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors',
                activeItem === 'site-manager' && 'bg-blue-50'
              )}
              onClick={() => setOpen(false)}
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  activeItem === 'site-manager' ? 'text-[#006FFF]' : 'text-gray-500'
                )}
              >
                <path fillRule="evenodd" d="M10 2a1 1 0 01.707.293l7 7A1 1 0 0118 10v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4H8v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-7a1 1 0 01.293-.707l7-7A1 1 0 0110 2z" clipRule="evenodd" />
              </svg>
              <span className={cn('text-sm font-medium', activeItem === 'site-manager' ? 'text-[#006FFF]' : 'text-gray-700')}>
                Site Manager
              </span>
            </Link>
          </div>

          {(showAdminLink || (session?.user as { role?: string })?.role === 'admin') && (
            <div className="border-t">
              <Link
                href="/admin"
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors',
                  activeItem === 'management-portal' && 'bg-blue-50'
                )}
                onClick={() => setOpen(false)}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={cn(
                    'w-4 h-4 flex-shrink-0',
                    activeItem === 'management-portal' ? 'text-[#006FFF]' : 'text-gray-500'
                  )}
                >
                  <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                </svg>
                <span className={cn('text-sm font-medium', activeItem === 'management-portal' ? 'text-[#006FFF]' : 'text-gray-700')}>
                  Management Portal
                </span>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
