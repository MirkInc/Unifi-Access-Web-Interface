'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { TenantSwitcher } from '@/components/TenantSwitcher'
import { getInitials } from '@/lib/utils'

interface Props {
  tenants: { _id: string; name: string }[]
  currentTenantId: string
  userName: string
  isAdmin: boolean
  tenantLabelOverride?: string
  activeNavItem?: 'tenant' | 'site-manager' | 'management-portal'
}

export function AppHeader({
  tenants,
  currentTenantId,
  userName,
  isAdmin,
  tenantLabelOverride,
  activeNavItem = 'tenant',
}: Props) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: logo + tenant switcher */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#006FFF] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </div>
          <TenantSwitcher
            tenants={tenants}
            currentTenantId={currentTenantId}
            showAdminLink={isAdmin}
            labelOverride={tenantLabelOverride}
            activeItem={activeNavItem}
          />
        </div>

        {/* Right: user menu */}
        <div className="relative">
          <button
            className="flex items-center gap-2 hover:bg-gray-100 px-2 py-1.5 rounded-lg transition-colors"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <span className="w-7 h-7 rounded-full bg-[#006FFF] text-white text-xs font-semibold flex items-center justify-center">
              {getInitials(userName)}
            </span>
            <span className="text-sm text-gray-700 hidden sm:block">{userName}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
              <Link
                href="/profile"
                className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                My Profile
              </Link>
              <div className="border-t border-gray-100" />
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
