'use client'

import { useState, useEffect } from 'react'
import { cn, formatTime } from '@/lib/utils'
import type { DoorStatus, UnifiLockRule } from '@/types'

interface DoorControlProps {
  door: DoorStatus
  permissions: {
    canUnlock: boolean
    canEndLockSchedule: boolean
    canTempLock: boolean
    canEndTempLock: boolean
  }
  onAction: () => void  // refresh callback
  timezone?: string
}

type TimerMode = 'preset' | 'custom'
const PRESETS = [
  { label: '10 mins', minutes: 10 },
  { label: '30 mins', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: 'Always Unlock', minutes: 0 },
]

async function apiPost(url: string, body?: object) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error ?? 'Request failed')
  }
  return res.json()
}

async function apiPut(url: string, body: object) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error ?? 'Request failed')
  }
  return res.json()
}

export function DoorControl({ door, permissions, onAction, timezone }: DoorControlProps) {
  const [showTimer, setShowTimer] = useState(false)
  const [showTempLock, setShowTempLock] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(1) // 30 mins default
  const [customHours, setCustomHours] = useState(0)
  const [customMinutes, setCustomMinutes] = useState(30)
  const [timerMode, setTimerMode] = useState<TimerMode>('preset')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Track whether the last unlock action was a simple one-time unlock vs a lock-rule action
  const [lastAction, setLastAction] = useState<'simple' | 'rule' | null>(null)

  const base = `/api/doors/${door.id}`
  const lockRule = door.lockRule as UnifiLockRule | null | undefined

  const isLocked = door.lockStatus === 'lock'
  const hasActiveRule = lockRule && lockRule.type !== 'schedule'
  const hasAnyControl =
    permissions.canUnlock ||
    permissions.canTempLock ||
    permissions.canEndLockSchedule ||
    permissions.canEndTempLock
  const isUnauthorizedOpening =
    door.positionStatus === 'open' &&
    door.lockStatus === 'lock' &&
    lockRule?.type !== 'keep_lock'

  // When a temp-unlock rule is active, treat the door as visually unlocked
  // even if lockStatus hasn't refreshed yet
  const isEffectivelyUnlocked =
    !isLocked || lockRule?.type === 'custom' || lockRule?.type === 'keep_unlock'

  // Live countdown for unlock rules that have an end time
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // Reset lastAction when the door re-locks
  useEffect(() => {
    if (isLocked) setLastAction(null)
  }, [isLocked])

  useEffect(() => {
    if (!lockRule?.ended_time || !isEffectivelyUnlocked) { setSecondsLeft(null); return }
    const farFuture = lockRule.ended_time > Date.now() / 1000 + 5 * 365 * 86400
    if (farFuture) { setSecondsLeft(null); return } // "always unlock" — no countdown

    const calc = () => Math.max(0, Math.round(lockRule.ended_time - Date.now() / 1000))
    setSecondsLeft(calc())
    const id = setInterval(() => setSecondsLeft(calc()), 1000)
    return () => clearInterval(id)
  }, [lockRule, isLocked])

  function formatCountdown(secs: number): string {
    if (secs <= 0) return 'Expiring…'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}h ${m}m remaining`
    if (m > 0) return `${m}m ${s}s remaining`
    return `${s}s remaining`
  }

  async function doAction(action: () => Promise<unknown>) {
    setLoading(true)
    setError('')
    try {
      await action()
      onAction()
      setShowTimer(false)
      setShowTempLock(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleUnlock() {
    setLastAction('simple')
    doAction(() => apiPost(`${base}/unlock`))
  }

  function handleLeaveUnlocked() {
    setShowTimer(!showTimer)
    setShowTempLock(false)
  }

  function handleTempLock() {
    setShowTempLock(!showTempLock)
    setShowTimer(false)
  }

  function handleStartTimer() {
    setLastAction('rule')
    let minutes: number
    if (timerMode === 'preset') {
      const p = PRESETS[selectedPreset]
      if (p.minutes === 0) {
        return doAction(() => apiPut(`${base}/lock-rule`, { type: 'keep_unlock' }))
      }
      minutes = p.minutes
    } else {
      minutes = customHours * 60 + customMinutes
      if (minutes <= 0) return
    }
    doAction(() => apiPut(`${base}/lock-rule`, { type: 'custom', interval: minutes }))
  }

  function handleReset() {
    setLastAction('rule')
    doAction(() => apiPut(`${base}/lock-rule`, { type: 'reset' }))
  }

  function handleLockEarly() {
    setLastAction('rule')
    doAction(() => apiPut(`${base}/lock-rule`, { type: 'lock_early' }))
  }

  return (
    <div className={cn('card p-5 space-y-4', isUnauthorizedOpening && 'ring-2 ring-red-500 border-red-200')}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {isUnauthorizedOpening && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm font-semibold text-red-700 uppercase tracking-wide">Unauthorized Opening</p>
          <p className="text-xs text-red-600 mt-0.5">Door is open while lock state is locked.</p>
        </div>
      )}

      {/* Status header */}
      <div className="flex items-center gap-4">
        <div className={cn(
          'w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0',
          isEffectivelyUnlocked ? 'bg-blue-50' : 'bg-gray-900'
        )}>
          {isEffectivelyUnlocked ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="#006FFF" strokeWidth={1.5} className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          )}
        </div>

        <div className="flex-1">
          <p className="font-semibold text-gray-900">
            {isEffectivelyUnlocked ? 'Unlocked' : 'Locked'}
          </p>
          {lockRule?.type === 'keep_unlock' && (
            <p className="text-xs text-[#006FFF] mt-0.5">
              Leave Unlocked · Ends {formatTime(lockRule.ended_time, timezone)}
            </p>
          )}
          {lockRule?.type === 'custom' && (
            <p className="text-xs text-[#006FFF] mt-0.5">
              Temporary Unlock · Ends {formatTime(lockRule.ended_time, timezone)}
            </p>
          )}
          {lockRule?.type === 'keep_lock' && (
            <p className="text-xs text-red-500 mt-0.5">
              Lockdown Active
            </p>
          )}
          {lockRule?.type === 'schedule' && (
            <p className="text-xs text-gray-500 mt-0.5">
              On Schedule{lockRule.ended_time ? ` · Locks at ${formatTime(lockRule.ended_time, timezone)}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Action area — differs based on effective lock state */}
      {hasAnyControl && !isEffectivelyUnlocked ? (
        /* LOCKED */
        lockRule?.type === 'keep_lock' ? (
          /* LOCKDOWN ACTIVE: only offer to end it — UniFi blocks all unlocking during lockdown */
          <div className="flex gap-2 flex-wrap">
            {permissions.canEndTempLock && (
              <button
                className="flex-1 border border-red-500 text-red-500 text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                onClick={handleReset}
                disabled={loading}
              >
                End Lockdown
              </button>
            )}
          </div>
        ) : (
          /* NORMAL LOCKED: show unlock controls */
          <div className="flex gap-2 flex-wrap">
            {permissions.canUnlock && (
              <button
                className="flex-1 border border-[#006FFF] text-[#006FFF] text-sm font-medium px-4 py-2 rounded-lg
                           hover:bg-blue-50 transition-colors disabled:opacity-50"
                onClick={handleUnlock}
                disabled={loading}
              >
                Click to Unlock
              </button>
            )}
            {permissions.canTempLock && (
              <button
                className={cn(
                  'flex-1 border text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50',
                  showTimer
                    ? 'border-[#006FFF] bg-[#006FFF] text-white'
                    : 'border-[#006FFF] text-[#006FFF] hover:bg-blue-50'
                )}
                onClick={handleLeaveUnlocked}
                disabled={loading}
              >
                Leave Unlocked
              </button>
            )}
            {permissions.canTempLock && (
              <button
                className={cn(
                  'flex-1 border text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50',
                  showTempLock
                    ? 'border-red-600 bg-red-600 text-white'
                    : 'border-red-500 text-red-500 hover:bg-red-50'
                )}
                onClick={handleTempLock}
                disabled={loading}
              >
                Lockdown
              </button>
            )}
            {permissions.canEndLockSchedule && lockRule?.type === 'schedule' && (
              <button className="flex-1 border border-orange-400 text-orange-500 text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50"
                onClick={handleLockEarly} disabled={loading}>
                Lock Early
              </button>
            )}
          </div>
        )
      ) : hasAnyControl ? (
        /* UNLOCKED: countdown (if rule-based) + lock action */
        <div className="flex items-center justify-between gap-4 bg-blue-50 rounded-xl px-4 py-3">
          <div>
            {secondsLeft !== null && lastAction !== 'simple' ? (
              <>
                <p className="text-xs text-gray-500 font-medium">Time Remaining</p>
                <p className="text-lg font-bold text-[#006FFF] tabular-nums leading-tight">
                  {formatCountdown(secondsLeft)}
                </p>
              </>
            ) : lockRule?.type === 'keep_unlock' ? (
              <p className="text-sm font-medium text-[#006FFF]">Always Unlocked</p>
            ) : (
              <p className="text-sm font-medium text-[#006FFF]">Unlocked</p>
            )}
          </div>
          {(permissions.canEndTempLock || permissions.canEndLockSchedule) && (
            lastAction === 'simple' && secondsLeft !== null ? (
              /* Simple one-time unlock: show live re-lock countdown on the right; tap to lock early */
              <button
                className="flex-shrink-0 flex flex-col items-center bg-orange-500 hover:bg-orange-600
                           text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                onClick={handleReset}
                disabled={loading}
              >
                <span className="text-xs opacity-80 leading-none mb-0.5">Locks in</span>
                <span className="text-sm font-bold tabular-nums leading-none">{formatCountdown(secondsLeft)}</span>
              </button>
            ) : (
              <button
                className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium
                           px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                onClick={lockRule?.type === 'schedule' ? handleLockEarly : handleReset}
                disabled={loading}
              >
                Lock Now
              </button>
            )
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">View-only access</p>
        </div>
      )}

      {/* Leave unlocked timer panel */}
      {showTimer && (
        <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leave Unlocked Timer</p>
          {lockRule?.type === 'keep_unlock' && (
            <p className="text-xs text-[#006FFF]">Ends at {formatTime(lockRule.ended_time, timezone)}</p>
          )}

          {/* Preset buttons */}
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                className={cn(
                  'text-xs px-2 py-1.5 rounded-lg border transition-colors',
                  selectedPreset === i && timerMode === 'preset'
                    ? 'border-[#006FFF] bg-[#006FFF] text-white'
                    : 'border-gray-200 text-gray-700 hover:border-[#006FFF]'
                )}
                onClick={() => {
                  setSelectedPreset(i)
                  setTimerMode('preset')
                  if (p.minutes > 0) {
                    setCustomHours(Math.floor(p.minutes / 60))
                    setCustomMinutes(p.minutes % 60)
                  }
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom time picker */}
          <div
            className={cn(
              'flex items-center gap-3 cursor-pointer',
              timerMode === 'custom' ? 'opacity-100' : 'opacity-60'
            )}
            onClick={() => setTimerMode('custom')}
          >
            <div className="flex items-center gap-1">
              <div className="flex flex-col">
                <button className="text-gray-400 hover:text-gray-700 leading-none text-lg" onClick={(e) => { e.stopPropagation(); setTimerMode('custom'); setCustomHours((h) => h + 1) }}>▲</button>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={customHours}
                  onChange={(e) => { setTimerMode('custom'); setCustomHours(Number(e.target.value)) }}
                  className="w-12 text-center border rounded-md py-1 text-sm"
                />
                <button className="text-gray-400 hover:text-gray-700 leading-none text-lg" onClick={(e) => { e.stopPropagation(); setTimerMode('custom'); setCustomHours((h) => Math.max(0, h - 1)) }}>▼</button>
              </div>
              <span className="text-sm text-gray-600">Hours</span>
            </div>

            <div className="flex items-center gap-1">
              <div className="flex flex-col">
                <button className="text-gray-400 hover:text-gray-700 leading-none text-lg" onClick={(e) => { e.stopPropagation(); setTimerMode('custom'); setCustomMinutes((m) => Math.min(59, m + 1)) }}>▲</button>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={customMinutes}
                  onChange={(e) => { setTimerMode('custom'); setCustomMinutes(Number(e.target.value)) }}
                  className="w-12 text-center border rounded-md py-1 text-sm"
                />
                <button className="text-gray-400 hover:text-gray-700 leading-none text-lg" onClick={(e) => { e.stopPropagation(); setTimerMode('custom'); setCustomMinutes((m) => Math.max(0, m - 1)) }}>▼</button>
              </div>
              <span className="text-sm text-gray-600">Minutes</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleStartTimer} disabled={loading}>Start</button>
            <button className="btn-secondary" onClick={() => setShowTimer(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Lockdown panel */}
      {showTempLock && (
        <div className="border border-red-200 rounded-xl p-4 space-y-3 bg-red-50">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Lockdown</p>
          <p className="text-sm text-gray-700">This will override any unlock schedule and keep the door locked until you end the lockdown.</p>
          <div className="flex gap-2">
            <button
              className="btn-danger"
              onClick={() => doAction(() => apiPut(`${base}/lock-rule`, { type: 'keep_lock' }))}
              disabled={loading}
            >
              Start Lockdown
            </button>
            <button className="btn-secondary" onClick={() => setShowTempLock(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
