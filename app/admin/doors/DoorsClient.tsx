'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'

interface DoorRow {
  id: string
  name: string
  fullName: string
  tenantId: string
  tenantName: string
  scheduleName: string | null
  firstPersonInRequired: boolean
}

interface Tenant {
  _id: string
  name: string
}

export function DoorsClient({ doors, tenants }: { doors: DoorRow[]; tenants: Tenant[] }) {
  const [query, setQuery] = useState('')
  const [selectedTenantId, setSelectedTenantId] = useState(tenants[0]?._id ?? '')

  const filtered = useMemo(() => {
    const scoped = selectedTenantId ? doors.filter((d) => d.tenantId === selectedTenantId) : doors
    const q = query.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      d.fullName.toLowerCase().includes(q) ||
      d.tenantName.toLowerCase().includes(q)
    )
  }, [doors, query, selectedTenantId])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doors</h1>
          <p className="text-sm text-gray-500 mt-1">Per-door admin settings, schedules, and policy visibility.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Search doors..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {tenants.length > 1 && (
            <Select.Root value={selectedTenantId} onValueChange={setSelectedTenantId}>
              <Select.Trigger className="flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors cursor-pointer min-w-44">
                <Select.Value />
                <Select.Icon className="ml-auto">
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                  <Select.Viewport className="p-1">
                    {tenants.map((t) => (
                      <Select.Item
                        key={t._id}
                        value={t._id}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 focus:bg-gray-50 outline-none data-[highlighted]:bg-gray-50"
                      >
                        <Select.ItemText>{t.name}</Select.ItemText>
                        <Select.ItemIndicator className="ml-auto">
                          <Check className="w-3.5 h-3.5 text-[#006FFF]" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Door</th>
              <th className="text-left px-4 py-3 font-medium">Site</th>
              <th className="text-left px-4 py-3 font-medium">Schedule</th>
              <th className="text-left px-4 py-3 font-medium">First Person In</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((door) => (
              <tr key={door.id} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{door.name}</p>
                  {door.fullName && door.fullName !== door.name && (
                    <p className="text-xs text-gray-400">{door.fullName}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">{door.tenantName}</td>
                <td className="px-4 py-3 text-gray-700">{door.scheduleName ?? 'None'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${door.firstPersonInRequired ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {door.firstPersonInRequired ? 'Required' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/doors/${door.id}`} className="text-[#006FFF] hover:underline font-medium">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No doors found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
