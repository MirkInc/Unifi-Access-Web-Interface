'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock, faLockOpen, faDoorOpen } from '@fortawesome/free-solid-svg-icons'
import { KeypadIcon } from './KeypadIcon'
import { cn, formatTime } from '@/lib/utils'
import type { DoorStatus, UnifiLockRule } from '@/types'

interface DoorCardProps {
  door: DoorStatus
  lockRule?: UnifiLockRule | null
  timezone?: string
  accentColor?: string
}

function statusLabel(door: DoorStatus): { text: string; color: 'red' | 'accent' | 'gray' } {
  if (!door.isOnline) return { text: 'Offline', color: 'gray' }
  if (door.positionStatus === 'open' && door.lockStatus === 'lock') {
    return { text: 'Unauthorized Opening', color: 'red' }
  }
  if (door.lockStatus === 'unlock') {
    return { text: 'Unlocked', color: 'accent' }
  }
  return { text: 'Locked', color: 'gray' }
}

function ruleLabel(lockRule?: UnifiLockRule | null, timezone?: string): string | null {
  if (!lockRule) return null
  if (lockRule.type === 'keep_unlock') {
    const endTime = new Date(lockRule.ended_time * 1000)
    return `Leave Unlocked Until ${formatTime(endTime, timezone)}`
  }
  if (lockRule.type === 'custom') {
    const endTime = new Date(lockRule.ended_time * 1000)
    return `Unlocked Until ${formatTime(endTime, timezone)}`
  }
  if (lockRule.type === 'keep_lock') return 'Lockdown Active'
  if (lockRule.type === 'schedule') return 'On Schedule'
  return null
}

export function DoorCard({ door, lockRule, timezone, accentColor = '#006FFF' }: DoorCardProps) {
  const { text, color } = statusLabel(door)
  const rule = ruleLabel(lockRule, timezone)
  const isWarning = door.positionStatus === 'open' && door.lockStatus === 'lock' && lockRule?.type !== 'keep_lock'
  const isLockdown = lockRule?.type === 'keep_lock'

  const textClass =
    isLockdown
      ? 'text-amber-600 font-medium'
      : color === 'red'
      ? 'text-red-500'
      : color === 'gray'
      ? 'text-gray-600'
      : ''

  return (
    <Link
      href={`/${door.tenantId}/${door.id}`}
      className={cn(
        'card hover:shadow-md transition-shadow text-left w-full p-4 flex flex-col',
        isLockdown && 'ring-2 ring-amber-500',
        isWarning && 'ring-2 ring-red-500'
      )}
    >
      <div
        className={cn(
          'relative rounded-lg flex items-center justify-center mb-3 aspect-[4/3] overflow-hidden transition-colors',
          isLockdown ? 'bg-yellow-600' : isWarning ? 'bg-red-900' : door.lockStatus === 'unlock' ? 'bg-green-900' : 'bg-gray-800'
        )}
      >
        <KeypadIcon className="h-20 w-auto" isUnlocked={door.lockStatus === 'unlock' && !isWarning && !isLockdown} isWarning={isWarning || isLockdown} />

        {isLockdown && (
          <div className="absolute inset-x-0 top-0 bg-amber-500 text-white text-xs font-bold tracking-widest text-center py-1 uppercase">
            Lockdown
          </div>
        )}

        {isWarning && (
          <div className="absolute inset-x-0 top-0 bg-red-600 text-white text-xs font-bold tracking-widest text-center py-1 uppercase">
            Unauthorized Opening
          </div>
        )}

        {door.positionStatus && !isLockdown && !isWarning && (
          <span
            className={cn(
              'absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              door.positionStatus === 'open' ? 'bg-amber-500/90 text-white' : 'bg-black/40 text-white/70'
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', door.positionStatus === 'open' ? 'bg-white' : 'bg-white/60')} />
            {door.positionStatus === 'open' ? 'Open' : 'Closed'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{door.name}</p>
          <p className={cn('text-xs mt-0.5 truncate', textClass)} style={!isLockdown && color === 'accent' ? { color: accentColor } : undefined}>
            {rule ? `${text} - ${rule}` : text}
          </p>
        </div>
        {isWarning ? (
          <FontAwesomeIcon icon={faDoorOpen} className="w-4 h-4 text-red-500 flex-shrink-0" />
        ) : door.lockStatus === 'unlock' && !isLockdown ? (
          <FontAwesomeIcon icon={faLockOpen} className="w-4 h-4 text-green-500 flex-shrink-0" />
        ) : (
          <FontAwesomeIcon icon={faLock} className={cn('w-4 h-4 flex-shrink-0', isLockdown ? 'text-amber-600' : 'text-gray-400')} />
        )}
      </div>
    </Link>
  )
}

