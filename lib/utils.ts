import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(date: Date | number, timeZone?: string): string {
  const d = typeof date === 'number' ? new Date(date * 1000) : date
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }
  if (timeZone) opts.timeZone = timeZone
  return d.toLocaleTimeString('en-US', opts)
}

export function formatDateTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date * 1000) : date
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function generateToken(length = 32): string {
  const { randomBytes } = require('crypto') as typeof import('crypto')
  return randomBytes(Math.ceil(length * 3 / 4)).toString('base64url').slice(0, length)
}

export function isAccessDenied(log: { event?: { log_key?: string; display_message?: string; result?: string } }): boolean {
  const key = (log.event?.log_key ?? '').toLowerCase()
  const msg = (log.event?.display_message ?? '').toLowerCase()
  const result = (log.event?.result ?? '').toLowerCase()
  return (
    result.includes('deny') || result.includes('denied') ||
    key.includes('denied') || key.includes('denial') ||
    msg.includes('denied') || msg.includes('access denied')
  )
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
