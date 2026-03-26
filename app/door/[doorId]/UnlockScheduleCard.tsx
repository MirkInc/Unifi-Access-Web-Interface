'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { UnifiSchedule } from '@/types'

interface Props {
  doorId: string
  scheduleId?: string
  fallbackName?: string
  firstPersonInRequired?: boolean
  open: boolean
  onToggle: () => void
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_LABELS = ['12 AM', '06 AM', '12 PM', '06 PM', '12 AM']
const TIME_TICKS = [0, 25, 50, 75, 100]

function timeToPercent(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return ((h * 60 + m) / 1440) * 100
}

function formatScheduleTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function TimeAxis() {
  return (
    <div className="relative h-4">
      {TIME_LABELS.map((label, i) => {
        const left = TIME_TICKS[i]
        const isFirst = i === 0
        const isLast = i === TIME_LABELS.length - 1
        const offsetClass = isFirst ? '' : isLast ? '-translate-x-full' : '-translate-x-1/2'
        return (
          <div
            key={`${label}-${i}`}
            className={`absolute text-[10px] text-gray-400 whitespace-nowrap ${offsetClass}`}
            style={{ left: `${left}%` }}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}

export function UnlockScheduleCard({ doorId, scheduleId, fallbackName, firstPersonInRequired = false, open, onToggle }: Props) {
  const [schedule, setSchedule] = useState<UnifiSchedule | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [holidayOpen, setHolidayOpen] = useState(false)

  useEffect(() => {
    if (!open || !scheduleId || loaded) return

    let cancelled = false

    async function loadSchedule() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/doors/${doorId}/schedule`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error ?? 'Failed to load unlock schedule')
        if (cancelled) return
        setSchedule((json.schedule as UnifiSchedule | null) ?? null)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoaded(true)
        }
      }
    }

    loadSchedule()
    return () => { cancelled = true }
  }, [open, scheduleId, loaded, doorId])

  const titleName = schedule?.name ?? fallbackName ?? 'No schedule assigned'
  const holidays = schedule?.holiday_group?.holidays ?? []
  const hasHolidaySchedule = (schedule?.holiday_schedule?.length ?? 0) > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-3 border-b border-gray-100 flex items-center gap-2 text-left"
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="2" width="14" height="13" rx="1.5" />
          <line x1="5" y1="1" x2="5" y2="4" />
          <line x1="11" y1="1" x2="11" y2="4" />
          <line x1="1" y1="6" x2="15" y2="6" />
        </svg>
        <span className="text-sm font-medium text-[#006FFF]">Unlock Schedule</span>
        {firstPersonInRequired && (
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            First Person In Required
          </span>
        )}
        <span className="ml-auto text-sm text-gray-800 truncate max-w-[55%]">{titleName}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {!scheduleId ? (
            <div className="px-5 py-3 text-sm text-gray-500">No schedule assigned.</div>
          ) : loading && !schedule ? (
            <div className="px-5 py-3 text-sm text-gray-400">Loading schedule...</div>
          ) : error && !schedule ? (
            <div className="px-5 py-3 text-sm text-red-600">{error}</div>
          ) : schedule ? (
            <>
              <div className="px-5 py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-800">{schedule.name}</span>
              </div>

              <div className="px-3 pt-2">
                <div className="ml-10">
                  <TimeAxis />
                </div>
              </div>

              <div className="px-3 pb-2">
                {DAYS.map((day, i) => {
                  const ranges = schedule.weekly[day] ?? []
                  return (
                    <div key={day} className="flex items-center h-9 gap-2">
                      <div className="w-8 text-[11px] text-gray-500 text-right flex-shrink-0">
                        {DAY_LABELS[i]}
                      </div>
                      <div className="flex-1 relative h-5 bg-gray-50 border border-gray-100 rounded-sm">
                        {[25, 50, 75].map((pct) => (
                          <div
                            key={pct}
                            className="absolute top-0 bottom-0 w-px bg-gray-200"
                            style={{ left: `${pct}%` }}
                          />
                        ))}
                        {ranges.map((range, ri) => {
                          const left = timeToPercent(range.start_time)
                          const width = timeToPercent(range.end_time) - left
                          return (
                            <div
                              key={ri}
                              className="absolute top-0.5 bottom-0.5 bg-emerald-100 border border-emerald-300 rounded-sm flex items-center justify-center overflow-hidden"
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${formatScheduleTime(range.start_time)} - ${formatScheduleTime(range.end_time)}`}
                            >
                              <span className="text-[10px] text-emerald-700 font-medium whitespace-nowrap px-1 truncate">
                                {formatScheduleTime(range.start_time)} - {formatScheduleTime(range.end_time)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {(holidays.length > 0 || hasHolidaySchedule) && (
                <div className="border-t border-gray-100">
                  <button
                    onClick={() => setHolidayOpen((o) => !o)}
                    className="w-full px-5 py-3 flex flex-col gap-1.5 text-sm hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-gray-500">Holiday Exceptions</span>
                      <div className="flex items-center gap-2 text-[#006FFF]">
                        <span className="text-xs">{holidays.length} {holidays.length === 1 ? 'Holiday' : 'Holidays'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${holidayOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    <div className={`w-full relative h-5 border rounded-sm ${hasHolidaySchedule ? 'bg-gray-50 border-gray-100' : 'bg-red-50 border-red-100'}`}>
                      {[25, 50, 75].map((pct) => (
                        <div key={pct} className={`absolute top-0 bottom-0 w-px ${hasHolidaySchedule ? 'bg-gray-200' : 'bg-red-100'}`} style={{ left: `${pct}%` }} />
                      ))}
                      {hasHolidaySchedule
                        ? schedule.holiday_schedule!.map((r, ri) => {
                            const left = timeToPercent(r.start_time)
                            const width = timeToPercent(r.end_time) - left
                            return (
                              <div
                                key={ri}
                                className="absolute top-0.5 bottom-0.5 bg-amber-200 border border-amber-300 rounded-sm"
                                style={{ left: `${left}%`, width: `${width}%` }}
                              />
                            )
                          })
                        : <span className="absolute inset-0 flex items-center justify-center text-[9px] text-red-300 font-medium tracking-wide">NO HOURS</span>
                      }
                    </div>
                    <div className="w-full">
                      <TimeAxis />
                    </div>
                  </button>
                  {holidayOpen && holidays.length > 0 && (
                    <div className="px-5 pb-3 space-y-1">
                      {holidays.map((h) => (
                        <div key={h.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">{h.name}</span>
                          <span className="text-gray-400">
                            {new Date(h.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {h.repeat && ' (annual)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="h-1" />
            </>
          ) : (
            <div className="px-5 py-3 text-sm text-gray-500">Schedule data unavailable.</div>
          )}
        </>
      )}
    </div>
  )
}
