'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type MfaStatusResponse = {
  mfaEnforced: boolean
  mfaRequiredFrom: string | null
  emailEnabled: boolean
  totpEnabled: boolean
  passkeys: { id: string }[]
}

export function MfaPolicyBanner() {
  const [status, setStatus] = useState<MfaStatusResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const res = await fetch('/api/mfa/status', { cache: 'no-store' })
      if (!res.ok || cancelled) return
      const data = (await res.json()) as MfaStatusResponse
      if (!cancelled) setStatus(data)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const shouldShow = useMemo(() => {
    if (!status?.mfaEnforced) return false
    const hasMethod = Boolean(
      status.emailEnabled ||
      status.totpEnabled ||
      (status.passkeys?.length ?? 0) > 0
    )
    return !hasMethod
  }, [status])

  if (!shouldShow || !status) return null

  const requiredFrom = status.mfaRequiredFrom ? new Date(status.mfaRequiredFrom) : null
  const isFuture = Boolean(requiredFrom && requiredFrom > new Date())
  const when = requiredFrom
    ? requiredFrom.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <p className="text-sm text-amber-800">
          {isFuture
            ? `Admin policy: MFA setup is required by ${when}.`
            : 'Admin policy: MFA setup is required for your account.'}{' '}
          Configure it in your profile.
        </p>
        <Link href="/mfa-setup" className="text-sm font-medium text-amber-900 hover:underline whitespace-nowrap">
          Set up MFA
        </Link>
      </div>
    </div>
  )
}

