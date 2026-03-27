'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const EXCLUDED_PREFIXES = ['/api', '/login', '/setup', '/forgot-password', '/reset-password', '/confirm-email']

export function ScreenAccessTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastSentRef = useRef('')

  useEffect(() => {
    if (!pathname) return
    if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return

    const query = searchParams?.toString() ?? ''
    const key = `${pathname}?${query}`
    if (key === lastSentRef.current) return
    lastSentRef.current = key

    fetch('/api/audit/screen-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, query }),
      keepalive: true,
    }).catch(() => undefined)
  }, [pathname, searchParams])

  return null
}
