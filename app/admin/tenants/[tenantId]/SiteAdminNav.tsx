'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const sections = [
  { segment: 'doors', label: 'Doors' },
  { segment: 'schedules', label: 'Schedules' },
  { segment: 'analytics', label: 'Analytics' },
  { segment: 'logs', label: 'Activity Logs' },
  { segment: 'preferences', label: 'Preferences' },
]

export function SiteAdminNav({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const links = sections.map((s) => ({
    href: `/admin/tenants/${tenantId}/${s.segment}`,
    label: s.label,
  }))

  const activeHref =
    links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))?.href ??
    links[0].href

  return (
    <>
      <div className="sm:hidden">
        <Select.Root value={activeHref} onValueChange={(v) => router.push(v)}>
          <Select.Trigger
            aria-label="Site section"
            className="flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors cursor-pointer min-w-[160px]"
          >
            <Select.Value />
            <Select.Icon className="ml-auto">
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
              <Select.Viewport className="p-1">
                {links.map((l) => (
                  <Select.Item
                    key={l.href}
                    value={l.href}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50"
                  >
                    <Select.ItemText>{l.label}</Select.ItemText>
                    <Select.ItemIndicator className="ml-auto">
                      <Check className="w-3.5 h-3.5 text-[#006FFF]" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <nav className="hidden sm:flex items-center gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm transition-colors',
              pathname === l.href || pathname.startsWith(`${l.href}/`)
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
