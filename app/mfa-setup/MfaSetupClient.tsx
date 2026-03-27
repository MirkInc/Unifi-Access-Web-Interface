'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startRegistration } from '@simplewebauthn/browser'
import { KeyRound, Mail, Smartphone } from 'lucide-react'
import { OtpInput } from '@/components/OtpInput'

interface Props {
  initialMfa: {
    mfaEnforced: boolean
    emailEnabled: boolean
    emailVerified: boolean
    totpEnabled: boolean
    passkeys: { id: string; name: string; createdAt: Date }[]
  }
}

export function MfaSetupClient({ initialMfa }: Props) {
  const router = useRouter()

  const [emailEnabled, setEmailEnabled] = useState(initialMfa.emailEnabled)
  const [emailVerified, setEmailVerified] = useState(initialMfa.emailVerified)
  const [totpEnabled, setTotpEnabled] = useState(initialMfa.totpEnabled)
  const [passkeys, setPasskeys] = useState(initialMfa.passkeys)

  const hasMethod = emailEnabled || totpEnabled || passkeys.length > 0
  const [mfaActive, setMfaActive] = useState(hasMethod)
  const methodCount = (emailEnabled ? 1 : 0) + (totpEnabled ? 1 : 0) + passkeys.length
  const canRemove = !initialMfa.mfaEnforced || methodCount > 1

  const [emailCode, setEmailCode] = useState('')
  const [emailSetupOpen, setEmailSetupOpen] = useState(false)
  const [totpSetupOpen, setTotpSetupOpen] = useState(false)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function disableAllMfa() {
    setBusy(true); setError('')
    try {
      if (emailEnabled) {
        const res = await fetch('/api/mfa/email/disable', { method: 'POST' })
        if (res.ok) { setEmailEnabled(false); setEmailVerified(false); setEmailSetupOpen(false); setEmailCode('') }
      }
      if (totpEnabled) {
        const res = await fetch('/api/mfa/totp/disable', { method: 'POST' })
        if (res.ok) { setTotpEnabled(false); setTotpSetupOpen(false); setTotpCode(''); setTotpSecret(''); setTotpQrDataUrl('') }
      }
      const currentPasskeys = passkeys
      for (const p of currentPasskeys) {
        const res = await fetch('/api/mfa/passkeys/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id }),
        })
        if (res.ok) setPasskeys((prev) => prev.filter((x) => x.id !== p.id))
      }
      setMfaActive(false)
      setSuccess('MFA disabled.')
    } finally { setBusy(false) }
  }

  async function enableEmail() {
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/mfa/email/setup/start', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Failed to send code'); return }
      setEmailSetupOpen(true)
      setSuccess('Verification code sent to your email.')
    } finally { setBusy(false) }
  }

  async function verifyEmail(codeValue?: string) {
    const code = codeValue ?? emailCode
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/mfa/email/setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Invalid code'); setEmailCode(''); return }
      setEmailEnabled(true); setEmailVerified(true); setEmailSetupOpen(false); setEmailCode('')
      setSuccess('Email MFA enabled.')
    } finally { setBusy(false) }
  }

  async function disableEmail() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/mfa/email/disable', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Failed to disable'); return }
      setEmailEnabled(false); setEmailVerified(false); setEmailSetupOpen(false); setEmailCode('')
      setSuccess('Email MFA disabled.')
    } finally { setBusy(false) }
  }

  async function startTotp() {
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/mfa/totp/setup/start', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Failed to start setup'); return }
      setTotpSecret(data.secret ?? ''); setTotpQrDataUrl(data.qrDataUrl ?? ''); setTotpSetupOpen(true)
      setSuccess('Scan the QR code with your authenticator app.')
    } finally { setBusy(false) }
  }

  async function verifyTotp(codeValue?: string) {
    const code = codeValue ?? totpCode
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/mfa/totp/setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Invalid code'); setTotpCode(''); return }
      setTotpEnabled(true); setTotpSetupOpen(false); setTotpCode(''); setTotpSecret(''); setTotpQrDataUrl('')
      setSuccess('Authenticator app enabled.')
    } finally { setBusy(false) }
  }

  async function disableTotp() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/mfa/totp/disable', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Failed to disable'); return }
      setTotpEnabled(false); setTotpSetupOpen(false); setTotpCode(''); setTotpSecret(''); setTotpQrDataUrl('')
      setSuccess('Authenticator app disabled.')
    } finally { setBusy(false) }
  }

  async function addPasskey() {
    setBusy(true); setError('')
    try {
      const optRes = await fetch('/api/mfa/passkeys/register/options', { method: 'POST' })
      const options = await optRes.json().catch(() => ({}))
      if (!optRes.ok) { setError(options.error ?? 'Could not start passkey registration'); return }
      const credential = await startRegistration({ optionsJSON: options })
      const verRes = await fetch('/api/mfa/passkeys/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      const verData = await verRes.json().catch(() => ({}))
      if (!verRes.ok) { setError(verData.error ?? 'Passkey registration failed'); return }
      const statusRes = await fetch('/api/mfa/status')
      const statusData = await statusRes.json().catch(() => ({}))
      if (statusRes.ok) setPasskeys(statusData.passkeys ?? [])
      setSuccess('Passkey added.')
    } catch {
      setError('Passkey registration was cancelled or failed')
    } finally { setBusy(false) }
  }

  async function removePasskey(id: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/mfa/passkeys/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Failed to remove passkey'); return }
      setPasskeys((prev) => prev.filter((p) => p.id !== id))
      setSuccess('Passkey removed.')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Set up multi-factor authentication</h1>
          <p className="text-sm text-gray-500 mt-1">Add at least one method to secure your account.</p>
        </div>

        {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{success}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

        {!initialMfa.mfaEnforced && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">{mfaActive ? 'MFA is enabled' : 'MFA is disabled'}</p>
            {mfaActive
              ? <button type="button" className="btn-secondary text-sm" onClick={disableAllMfa} disabled={busy}>Disable MFA</button>
              : <button type="button" className="btn-primary text-sm" onClick={() => setMfaActive(true)} disabled={busy}>Enable MFA</button>
            }
          </div>
        )}

        <div className={`space-y-3 transition-opacity ${!mfaActive ? 'opacity-40 pointer-events-none select-none' : ''}`}>
          {/* Email */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-[#006FFF]" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Email code</p>
                  <p className="text-xs text-gray-500">6-digit code sent to your email</p>
                </div>
              </div>
              {emailEnabled
                ? <button type="button" className="btn-secondary text-sm" onClick={disableEmail} disabled={busy || !canRemove} title={!canRemove ? 'Cannot remove your only MFA method' : undefined}>Disable</button>
                : <button type="button" className="btn-secondary text-sm" onClick={enableEmail} disabled={busy}>Enable</button>
              }
            </div>
            {emailEnabled && <p className="text-xs text-green-700 mt-2 ml-12">Enabled {emailVerified ? '(verified)' : ''}</p>}
            {emailSetupOpen && !emailEnabled && (
              <div className="mt-3 ml-12 space-y-3">
                <OtpInput value={emailCode} onChange={setEmailCode} onComplete={verifyEmail} disabled={busy} />
                <button type="button" className="btn-primary text-sm" onClick={() => verifyEmail()} disabled={busy || emailCode.length !== 6}>Verify</button>
              </div>
            )}
          </div>

          {/* Authenticator */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-4 h-4 text-[#006FFF]" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Authenticator app</p>
                  <p className="text-xs text-gray-500">Google Authenticator, Microsoft Authenticator, etc.</p>
                </div>
              </div>
              {totpEnabled
                ? <button type="button" className="btn-secondary text-sm" onClick={disableTotp} disabled={busy || !canRemove} title={!canRemove ? 'Cannot remove your only MFA method' : undefined}>Disable</button>
                : <button type="button" className="btn-secondary text-sm" onClick={startTotp} disabled={busy}>Setup</button>
              }
            </div>
            {totpEnabled && <p className="text-xs text-green-700 mt-2 ml-12">Enabled</p>}
            {totpSetupOpen && !totpEnabled && (
              <div className="mt-3 ml-12 space-y-3">
                {totpQrDataUrl && <img src={totpQrDataUrl} alt="Authenticator QR Code" className="w-44 h-44 border rounded-lg" />}
                {totpSecret && <p className="text-xs text-gray-600">Manual key: <span className="font-mono">{totpSecret}</span></p>}
                <OtpInput value={totpCode} onChange={setTotpCode} onComplete={verifyTotp} disabled={busy} />
                <button type="button" className="btn-primary text-sm" onClick={() => verifyTotp()} disabled={busy || totpCode.length !== 6}>Verify</button>
              </div>
            )}
          </div>

          {/* Passkeys */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <KeyRound className="w-4 h-4 text-[#006FFF]" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Passkeys</p>
                  <p className="text-xs text-gray-500">Windows Hello, Face ID, Touch ID, security keys</p>
                </div>
              </div>
              <button type="button" className="btn-secondary text-sm" onClick={addPasskey} disabled={busy}>Add passkey</button>
            </div>
            {passkeys.length > 0 && (
              <div className="mt-3 ml-12 space-y-2">
                {passkeys.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</p>
                    </div>
                    <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removePasskey(p.id)} disabled={busy || !canRemove} title={!canRemove ? 'Cannot remove your only MFA method' : undefined}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => router.push('/')}
          disabled={initialMfa.mfaEnforced && !hasMethod}
        >
          Continue
        </button>
        {initialMfa.mfaEnforced && !hasMethod && <p className="text-xs text-center text-gray-400">Enable at least one method to continue</p>}
      </div>
    </div>
  )
}
