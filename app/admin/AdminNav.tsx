'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/admin/tenants', label: 'Sites' },
  { href: '/admin/doors', label: 'Doors' },
  { href: '/admin/schedules', label: 'Schedules' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/logs', label: 'Activity Logs' },
  { href: '/admin/audit', label: 'Audit Logs' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-1 ml-4">
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
  )
}
