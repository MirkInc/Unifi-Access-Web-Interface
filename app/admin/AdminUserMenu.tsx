'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'

export function AdminUserMenu({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 hover:bg-gray-100 px-2 py-1.5 rounded-lg transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="w-7 h-7 rounded-full bg-[#006FFF] text-white text-xs font-semibold flex items-center justify-center">
          {getInitials(userName)}
        </span>
        <span className="text-sm text-gray-700 hidden sm:block">{userName}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
          <Link
            href="/profile"
            className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(false)}
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
  )
}
