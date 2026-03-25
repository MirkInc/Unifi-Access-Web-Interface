'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  format, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, getDay, isWithinInterval,
  parseISO,
} from 'date-fns'
import { cn } from '@/lib/utils'

interface Props {
  start: string   // 'YYYY-MM-DD'
  end: string     // 'YYYY-MM-DD'
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  max?: string
}

function parseDate(s: string): Date | null {
  if (!s) return null
  return parseISO(s)
}

export function DateRangePicker({ start, end, onStartChange, onEndChange, max }: Props) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'start' | 'end'>('start')
  const [viewMonth, setViewMonth] = useState<Date>(() => parseDate(start) ?? new Date())
  const [hovered, setHovered] = useState<Date | null>(null)

  const startDate = parseDate(start)
  const endDate = parseDate(end)
  const maxDate = max ? parseDate(max) : null

  function openAs(p: 'start' | 'end') {
    setPhase(p)
    setViewMonth(p === 'start' ? (startDate ?? new Date()) : (endDate ?? startDate ?? new Date()))
    setOpen(true)
  }

  function selectDay(day: Date) {
    if (maxDate && day > maxDate) return
    if (phase === 'start') {
      onStartChange(format(day, 'yyyy-MM-dd'))
      // If new start is after current end, reset end
      if (endDate && day > endDate) onEndChange('')
      // Auto-advance to end
      setPhase('end')
    } else {
      if (startDate && day < startDate) {
        // Picked before start — swap to start mode instead
        onStartChange(format(day, 'yyyy-MM-dd'))
        onEndChange('')
        setPhase('end')
        return
      }
      onEndChange(format(day, 'yyyy-MM-dd'))
      setOpen(false)
      setHovered(null)
    }
  }

  function isInRange(day: Date): boolean {
    const s = startDate
    const e = phase === 'end' ? (hovered ?? endDate) : endDate
    if (!s || !e) return false
    if (isSameDay(s, e)) return false
    try {
      return isWithinInterval(day, { start: s < e ? s : e, end: s < e ? e : s })
    } catch { return false }
  }

  function isRangeStart(day: Date) { return startDate ? isSameDay(day, startDate) : false }
  function isRangeEnd(day: Date) {
    const e = phase === 'end' ? (hovered ?? endDate) : endDate
    return e ? isSameDay(day, e) : false
  }
  function isDisabled(day: Date) { return !!(maxDate && day > maxDate) }

  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const leadingBlanks = getDay(monthStart)

  const effectiveEnd = phase === 'end' ? (hovered ?? endDate) : endDate

  return (
    <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setHovered(null) }}>
      {/* Trigger — two date chips in one row */}
      <div className="flex items-center h-9 bg-white border border-gray-200 rounded-xl overflow-hidden divide-x divide-gray-200 hover:border-[#006FFF]/40 transition-colors">
        <Popover.Trigger asChild>
          <button
            type="button"
            onClick={() => openAs('start')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-full text-sm transition-colors hover:bg-gray-50',
              phase === 'start' && open ? 'text-[#006FFF] font-medium' : startDate ? 'text-gray-800' : 'text-gray-400'
            )}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-400 flex-shrink-0">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            {startDate ? format(startDate, 'MMM d, yyyy') : 'Start date'}
          </button>
        </Popover.Trigger>

        <span className="px-2 text-gray-300 text-xs select-none">→</span>

        <Popover.Trigger asChild>
          <button
            type="button"
            onClick={() => openAs('end')}
            className={cn(
              'flex items-center gap-1.5 px-3 h-full text-sm transition-colors hover:bg-gray-50',
              phase === 'end' && open ? 'text-[#006FFF] font-medium' : effectiveEnd ? 'text-gray-800' : 'text-gray-400'
            )}
          >
            {effectiveEnd ? format(effectiveEnd, 'MMM d, yyyy') : 'End date'}
          </button>
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 w-72"
          onInteractOutside={() => setOpen(false)}
        >
          {/* Phase label */}
          <p className="text-xs font-semibold text-[#006FFF] uppercase tracking-wide mb-3">
            {phase === 'start' ? 'Select start date' : 'Select end date'}
          </p>

          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-900">{format(viewMonth, 'MMMM yyyy')}</span>
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
            {days.map((day) => {
              const selStart = isRangeStart(day)
              const selEnd = isRangeEnd(day)
              const inRange = isInRange(day)
              const disabled = isDisabled(day)
              const today = isToday(day)
              const isSelected = selStart || selEnd

              return (
                <div
                  key={day.toISOString()}
                  className={cn('relative flex items-center justify-center', inRange && 'bg-[#006FFF]/10')}
                  style={{
                    borderRadius: selStart ? '8px 0 0 8px' : selEnd ? '0 8px 8px 0' : undefined,
                  }}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDay(day)}
                    onMouseEnter={() => phase === 'end' && setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      'w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors relative z-10',
                      isSelected
                        ? 'bg-[#006FFF] text-white font-semibold'
                        : disabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : today
                        ? 'text-[#006FFF] font-semibold hover:bg-[#006FFF]/10'
                        : 'text-gray-700 hover:bg-[#006FFF]/10'
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                </div>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
