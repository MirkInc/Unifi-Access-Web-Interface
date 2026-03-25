'use client'

import { useState, useRef, useEffect } from 'react'

// Common IANA timezones grouped by region
const TIMEZONES = [
  { value: 'America/New_York',      label: 'Eastern Time (ET)' },
  { value: 'America/Chicago',       label: 'Central Time (CT)' },
  { value: 'America/Denver',        label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix',       label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles',   label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage',     label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu',      label: 'Hawaii Time (HT)' },
  { value: 'America/Puerto_Rico',   label: 'Atlantic Time (AT)' },
  { value: 'America/Toronto',       label: 'Toronto (ET)' },
  { value: 'America/Vancouver',     label: 'Vancouver (PT)' },
  { value: 'America/Winnipeg',      label: 'Winnipeg (CT)' },
  { value: 'America/Edmonton',      label: 'Edmonton (MT)' },
  { value: 'America/Halifax',       label: 'Halifax (AT)' },
  { value: 'America/St_Johns',      label: 'Newfoundland (NT)' },
  { value: 'America/Sao_Paulo',     label: 'São Paulo' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'America/Bogota',        label: 'Bogotá (COT)' },
  { value: 'America/Lima',          label: 'Lima (PET)' },
  { value: 'America/Mexico_City',   label: 'Mexico City (CT)' },
  { value: 'Europe/London',         label: 'London (GMT/BST)' },
  { value: 'Europe/Dublin',         label: 'Dublin (GMT/IST)' },
  { value: 'Europe/Paris',          label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin',         label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Amsterdam',      label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Brussels',       label: 'Brussels (CET/CEST)' },
  { value: 'Europe/Zurich',         label: 'Zurich (CET/CEST)' },
  { value: 'Europe/Madrid',         label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Rome',           label: 'Rome (CET/CEST)' },
  { value: 'Europe/Stockholm',      label: 'Stockholm (CET/CEST)' },
  { value: 'Europe/Oslo',           label: 'Oslo (CET/CEST)' },
  { value: 'Europe/Copenhagen',     label: 'Copenhagen (CET/CEST)' },
  { value: 'Europe/Helsinki',       label: 'Helsinki (EET/EEST)' },
  { value: 'Europe/Warsaw',         label: 'Warsaw (CET/CEST)' },
  { value: 'Europe/Prague',         label: 'Prague (CET/CEST)' },
  { value: 'Europe/Budapest',       label: 'Budapest (CET/CEST)' },
  { value: 'Europe/Bucharest',      label: 'Bucharest (EET/EEST)' },
  { value: 'Europe/Athens',         label: 'Athens (EET/EEST)' },
  { value: 'Europe/Istanbul',       label: 'Istanbul (TRT)' },
  { value: 'Europe/Moscow',         label: 'Moscow (MSK)' },
  { value: 'Asia/Dubai',            label: 'Dubai (GST)' },
  { value: 'Asia/Karachi',          label: 'Karachi (PKT)' },
  { value: 'Asia/Kolkata',          label: 'India (IST)' },
  { value: 'Asia/Dhaka',            label: 'Dhaka (BST)' },
  { value: 'Asia/Bangkok',          label: 'Bangkok (ICT)' },
  { value: 'Asia/Singapore',        label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong',        label: 'Hong Kong (HKT)' },
  { value: 'Asia/Shanghai',         label: 'China (CST)' },
  { value: 'Asia/Tokyo',            label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul',            label: 'Seoul (KST)' },
  { value: 'Asia/Jakarta',          label: 'Jakarta (WIB)' },
  { value: 'Australia/Perth',       label: 'Perth (AWST)' },
  { value: 'Australia/Darwin',      label: 'Darwin (ACST)' },
  { value: 'Australia/Adelaide',    label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Brisbane',    label: 'Brisbane (AEST)' },
  { value: 'Australia/Sydney',      label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland',      label: 'Auckland (NZST/NZDT)' },
  { value: 'UTC',                   label: 'UTC' },
]

interface Props {
  value: string
  onChange: (tz: string) => void
}

export function TimezoneSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = TIMEZONES.find((t) => t.value === value)
  const filtered = search
    ? TIMEZONES.filter(
        (t) =>
          t.label.toLowerCase().includes(search.toLowerCase()) ||
          t.value.toLowerCase().includes(search.toLowerCase())
      )
    : TIMEZONES

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
    else setSearch('')
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="input w-full text-left flex items-center justify-between gap-2"
        onClick={() => setOpen(!open)}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? `${selected.label} — ${selected.value}` : 'Select timezone…'}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search timezones…"
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#006FFF]"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400">No results</li>
            ) : (
              filtered.map((tz) => (
                <li key={tz.value}>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${
                      tz.value === value ? 'text-[#006FFF] font-medium bg-blue-50' : 'text-gray-700'
                    }`}
                    onClick={() => { onChange(tz.value); setOpen(false) }}
                  >
                    <span>{tz.label}</span>
                    <span className="ml-2 text-xs text-gray-400">{tz.value}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
