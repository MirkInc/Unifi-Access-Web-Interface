'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/admin/tenants', label: 'Sites' },
  { href: '/admin/doors', label: 'Doors' },
  { href: '/admin/schedules', label: 'Schedules' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/logs', label: 'Activity Logs' },
  { href: '/admin/health', label: 'Health' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/preferences', label: 'Preferences' },
  { href: '/admin/audit', label: 'Audit Logs' },
]

export function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()
  const activeHref =
    links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))?.href ??
    '/admin/tenants'

  return (
    <>
      <div className="lg:hidden ml-2">
        <select
          className="input !h-9 !py-1.5 !pr-8 !text-sm max-w-[170px]"
          value={activeHref}
          aria-label="Admin section"
          onChange={(e) => router.push(e.target.value)}
        >
          {links.map((l) => (
            <option key={l.href} value={l.href}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <nav className="hidden lg:flex items-center gap-1 ml-4">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm transition-colors',
              pathname.startsWith(l.href)
                ? 'bg-blue-50 text-[#006FFF] font-medium'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
