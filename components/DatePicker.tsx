'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  format, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, getDay,
} from 'date-fns'
import { cn } from '@/lib/utils'

interface Props {
  value: string        // 'YYYY-MM-DD'
  onChange: (v: string) => void
  min?: string
  max?: string
  placeholder?: string
}

export function DatePicker({ value, onChange, min, max, placeholder = 'Pick a date' }: Props) {
  const selected = value ? new Date(value + 'T00:00:00') : null
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date())

  const minDate = min ? new Date(min + 'T00:00:00') : null
  const maxDate = max ? new Date(max + 'T00:00:00') : null

  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad leading days so grid starts on Sunday
  const leadingBlanks = getDay(monthStart)

  function select(day: Date) {
    if (minDate && day < minDate) return
    if (maxDate && day > maxDate) return
    onChange(format(day, 'yyyy-MM-dd'))
  }

  function isDisabled(day: Date) {
    if (minDate && day < minDate) return true
    if (maxDate && day > maxDate) return true
    return false
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 h-9 px-3 rounded-xl border border-gray-200 bg-white text-sm transition-colors hover:border-[#006FFF]/50 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF]',
            selected ? 'text-gray-800' : 'text-gray-400'
          )}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          {selected ? format(selected, 'MMM d, yyyy') : placeholder}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 w-72 animate-in fade-in-0 zoom-in-95"
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-900">
              {format(viewMonth, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {days.map((day) => {
              const isSelected = selected ? isSameDay(day, selected) : false
              const disabled = isDisabled(day)
              const todayDay = isToday(day)

              return (
                <Popover.Close key={day.toISOString()} asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => select(day)}
                    className={cn(
                      'w-full aspect-square flex items-center justify-center rounded-lg text-sm transition-colors',
                      isSelected
                        ? 'bg-[#006FFF] text-white font-semibold'
                        : disabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : todayDay
                        ? 'text-[#006FFF] font-semibold hover:bg-[#006FFF]/10'
                        : 'text-gray-700 hover:bg-gray-100'
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                </Popover.Close>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
