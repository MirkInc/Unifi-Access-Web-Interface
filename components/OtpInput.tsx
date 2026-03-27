'use client'

import { useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
}

export function OtpInput({ value, onChange, onComplete, disabled, autoFocus }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function focus(i: number) {
    refs.current[i]?.focus()
  }

  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    const chars = value.padEnd(6, ' ').split('')
    chars[i] = digit
    const next = chars.join('').trimEnd().slice(0, 6)
    onChange(next)
    if (i < 5) {
      focus(i + 1)
    } else if (next.replace(/ /g, '').length === 6) {
      onComplete?.(next)
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const current = value.replace(/ /g, '')
      if (current.length === 6) onComplete?.(current)
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (value[i] && value[i] !== ' ') {
        const chars = value.padEnd(6, ' ').split('')
        chars[i] = ' '
        onChange(chars.join('').trimEnd())
      } else if (i > 0) {
        const chars = value.padEnd(6, ' ').split('')
        chars[i - 1] = ' '
        onChange(chars.join('').trimEnd())
        focus(i - 1)
      }
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); focus(i - 1) }
    if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); focus(i + 1) }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(digits)
    focus(Math.min(digits.length, 5))
    if (digits.length === 6) onComplete?.(digits)
  }

  return (
    <div className="flex gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={value[i]?.trim() ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          className="w-10 h-12 text-center text-lg font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors disabled:opacity-50 bg-white"
        />
      ))}
    </div>
  )
}
