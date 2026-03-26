'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import * as Select from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'
import type { UnifiSchedule } from '@/types'

interface Tenant { _id: string; name: string; timezone?: string }
interface DoorRow {
  _id: string
  name: string
  fullName: string
  tenantId: string
  scheduleId: string | null
  scheduleName: string | null
}

interface Props {
  tenants: Tenant[]
  doors: DoorRow[]
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function timeToPercent(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return ((h * 60 + m) / 1440) * 100
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function TimeBlock({
  left, width, tooltip, color,
}: {
  left: number
  width: number
  tooltip: string
  color: 'emerald' | 'amber'
}) {
  const [show, setShow] = useState(false)
  const colorClass = color === 'emerald'
    ? 'bg-emerald-200 border-emerald-300'
    : 'bg-amber-200 border-amber-300'
  return (
    <div
      className={`absolute top-0.5 bottom-0.5 border rounded-sm cursor-default ${colorClass}`}
      style={{ left: `${left}%`, width: `${width}%` }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] bg-gray-800 text-white rounded-md whitespace-nowrap z-50 pointer-events-none shadow-lg">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </div>
      )}
    </div>
  )
}

const TIME_AXIS = ['12 AM', '6 AM', '12 PM', '6 PM', '12 AM']

function MiniWeekGrid({ schedule, timezone }: { schedule: UnifiSchedule; timezone?: string }) {
  const tzSuffix = timezone ? ` ${timezone}` : ''
  return (
    <div className="mt-2">
      {/* Time axis */}
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-7 flex-shrink-0" />
        <div className="flex-1 flex justify-between">
          {TIME_AXIS.map((label, i) => (
            <span key={i} className="text-[9px] text-gray-300 leading-none">{label}</span>
          ))}
        </div>
      </div>

      <div className="space-y-0.5">
        {DAYS.map((day, i) => {
          const ranges = schedule.weekly[day] ?? []
          return (
            <div key={day} className="flex items-center gap-2 h-5">
              <span className="w-7 text-[10px] text-gray-400 text-right flex-shrink-0">{DAY_LABELS[i]}</span>
              <div className="flex-1 relative h-3 bg-gray-50 border border-gray-100 rounded-sm overflow-visible">
                {[25, 50, 75].map((pct) => (
                  <div key={pct} className="absolute top-0 bottom-0 w-px bg-gray-200" style={{ left: `${pct}%` }} />
                ))}
                {ranges.map((range, ri) => (
                  <TimeBlock
                    key={ri}
                    left={timeToPercent(range.start_time)}
                    width={timeToPercent(range.end_time) - timeToPercent(range.start_time)}
                    tooltip={`${formatTime(range.start_time)} – ${formatTime(range.end_time)}${tzSuffix}`}
                    color="emerald"
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SchedulesClient({ tenants, doors }: Props) {
  const [selectedTenantId, setSelectedTenantId] = useState(tenants[0]?._id ?? '')
  const [schedules, setSchedules] = useState<UnifiSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const router = useRouter()

  const tenantDoors = doors.filter((d) => d.tenantId === selectedTenantId)
  const currentTenant = tenants.find((t) => t._id === selectedTenantId)
  const timezone = currentTenant?.timezone

  useEffect(() => {
    if (!selectedTenantId) return
    setLoading(true)
    setError('')
    setSchedules([])
    fetch(`/api/tenants/${selectedTenantId}/schedules`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSchedules(data)
        else setError(data.error ?? 'Failed to load schedules')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [selectedTenantId])

  async function assignSchedule(doorId: string, schedule: UnifiSchedule | null) {
    setSaving(doorId)
    try {
      const res = await fetch(`/api/doors/${doorId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: schedule?.id ?? null,
          scheduleName: schedule?.name ?? null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error ?? 'Failed to save')
      } else {
        router.refresh()
      }
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedules</h1>
          <p className="text-sm text-gray-500 mt-1">Assign UniFi unlock schedules to doors</p>
        </div>
        {tenants.length > 1 && (
          <Select.Root value={selectedTenantId} onValueChange={setSelectedTenantId}>
            <Select.Trigger className="flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors cursor-pointer min-w-40">
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

      {loading && (
        <div className="card p-8 text-center text-gray-400 text-sm">Loading schedules…</div>
      )}

      {error && (
        <div className="card p-4 text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && schedules.length === 0 && (
        <div className="card p-8 text-center text-gray-400 text-sm">
          No schedules found on this controller.
        </div>
      )}

      {!loading && schedules.length > 0 && (
        <div className="space-y-6">
          {schedules.map((schedule) => {
            const assignedDoors = tenantDoors.filter((d) => d.scheduleId === schedule.id)
            const unassignedDoors = tenantDoors.filter((d) => d.scheduleId === null)

            return (
              <div key={schedule.id} className="card p-5">
                <div className="flex items-start gap-4">
                  {/* Schedule preview */}
                  <div className="w-72 flex-shrink-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-semibold text-gray-900 text-sm">{schedule.name}</span>
                      {schedule.is_default && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Default</span>
                      )}
                    </div>
                    <MiniWeekGrid schedule={schedule} timezone={timezone} />

                    {/* Holidays */}
                    {(schedule.holiday_group?.holidays?.length ?? 0) > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                          Holiday Exceptions · {schedule.holiday_group!.holidays.length}
                        </p>
                        {(() => {
                          const hasHours = schedule.holiday_schedule && schedule.holiday_schedule.length > 0
                          return (
                            <div className={`relative h-3 border rounded-sm mb-2 overflow-visible ${hasHours ? 'bg-gray-50 border-gray-100' : 'bg-red-50 border-red-100'}`}>
                              {[25, 50, 75].map((pct) => (
                                <div key={pct} className={`absolute top-0 bottom-0 w-px ${hasHours ? 'bg-gray-200' : 'bg-red-100'}`} style={{ left: `${pct}%` }} />
                              ))}
                              {hasHours
                                ? schedule.holiday_schedule!.map((r, ri) => (
                                    <TimeBlock
                                      key={ri}
                                      left={timeToPercent(r.start_time)}
                                      width={timeToPercent(r.end_time) - timeToPercent(r.start_time)}
                                      tooltip={`${formatTime(r.start_time)} – ${formatTime(r.end_time)}${timezone ? ` ${timezone}` : ''}`}
                                      color="amber"
                                    />
                                  ))
                                : <span className="absolute inset-0 flex items-center justify-center text-[9px] text-red-300 font-medium tracking-wide">NO HOURS</span>
                              }
                            </div>
                          )
                        })()}
                        <div className="space-y-1">
                          {schedule.holiday_group!.holidays.map((h) => (
                            <div key={h.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-gray-600 truncate">{h.name}</span>
                              <span className="text-gray-400 flex-shrink-0">
                                {new Date(h.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {h.repeat ? ' ↻' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Door assignment */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Assigned Doors</p>

                    {assignedDoors.length === 0 && (
                      <p className="text-xs text-gray-400 mb-3">No doors assigned</p>
                    )}

                    <div className="space-y-1 mb-3">
                      {assignedDoors.map((door) => (
                        <div key={door._id} className="flex items-center justify-between py-1 px-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-gray-800">{door.name}</span>
                            {door.fullName && door.fullName !== door.name && (
                              <span className="text-xs text-gray-400 ml-1.5 truncate">{door.fullName}</span>
                            )}
                          </div>
                          <button
                            className="text-xs text-red-500 hover:text-red-700 ml-3 flex-shrink-0 disabled:opacity-50"
                            onClick={() => assignSchedule(door._id, null)}
                            disabled={saving === door._id}
                          >
                            {saving === door._id ? '…' : 'Remove'}
                          </button>
                        </div>
                      ))}
                    </div>

                    {unassignedDoors.length > 0 && (
                      <>
                        <p className="text-xs text-gray-400 mb-1">Add door:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unassignedDoors.map((door) => (
                            <button
                              key={door._id}
                              className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[#006FFF] hover:text-[#006FFF] transition-colors disabled:opacity-50"
                              onClick={() => assignSchedule(door._id, schedule)}
                              disabled={saving === door._id}
                            >
                              {saving === door._id ? '…' : door.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
