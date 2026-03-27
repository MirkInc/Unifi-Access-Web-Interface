'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { startRegistration } from '@simplewebauthn/browser'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  initialName: string
  initialEmail: string
  role: 'admin' | 'user'
  initialMfa: {
    mfaEnforced: boolean
    emailEnabled: boolean
    emailVerified: boolean
    totpEnabled: boolean
    passkeys: { id: string; name: string; createdAt: Date }[]
  }
}

export function ProfileClient({ initialName, initialEmail, role, initialMfa }: Props) {
  const { update } = useSession()
  const router = useRouter()

  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [emailEnabled, setEmailEnabled] = useState(initialMfa.emailEnabled)
  const [emailVerified, setEmailVerified] = useState(initialMfa.emailVerified)
  const [totpEnabled, setTotpEnabled] = useState(initialMfa.totpEnabled)
  const [passkeys, setPasskeys] = useState(initialMfa.passkeys)
  const [emailCode, setEmailCode] = useState('')
  const [emailSetupOpen, setEmailSetupOpen] = useState(false)
  const [totpSetupOpen, setTotpSetupOpen] = useState(false)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(role === 'admin' ? '/admin' : '/')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        return
      }

      await update({ name: data.name, email: data.email })
      setSuccess('Profile updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function enableEmailMfa() {
    setMfaBusy(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/mfa/email/setup/start', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to send verification code')
        return
      }
      setEmailSetupOpen(true)
      setSuccess('Verification code sent to your email.')
    } finally {
      setMfaBusy(false)
    }
  }

  async function verifyEmailMfa() {
    setMfaBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mfa/email/setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Invalid code')
        return
      }
      setEmailEnabled(true)
      setEmailVerified(true)
      setEmailSetupOpen(false)
      setEmailCode('')
      setSuccess('Email MFA enabled.')
    } finally {
      setMfaBusy(false)
    }
  }

  async function disableEmailMfa() {
    setMfaBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mfa/email/disable', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to disable email MFA')
        return
      }
      setEmailEnabled(false)
      setEmailVerified(false)
      setEmailSetupOpen(false)
      setEmailCode('')
      setSuccess('Email MFA disabled.')
    } finally {
      setMfaBusy(false)
    }
  }

  async function startTotpSetup() {
    setMfaBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mfa/totp/setup/start', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to start authenticator setup')
        return
      }
      setTotpSecret(data.secret ?? '')
      setTotpQrDataUrl(data.qrDataUrl ?? '')
      setTotpSetupOpen(true)
      setSuccess('Scan the QR code with your authenticator app.')
    } finally {
      setMfaBusy(false)
    }
  }

  async function verifyTotpSetup() {
    setMfaBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mfa/totp/setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Invalid authenticator code')
        return
      }
      setTotpEnabled(true)
      setTotpSetupOpen(false)
      setTotpCode('')
      setTotpSecret('')
      setTotpQrDataUrl('')
      setSuccess('Authenticator app MFA enabled.')
    } finally {
      setMfaBusy(false)
    }
  }

  async function disableTotp() {
    setMfaBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mfa/totp/disable', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to disable authenticator MFA')
        return
      }
      setTotpEnabled(false)
      setTotpSetupOpen(false)
      setTotpCode('')
      setTotpSecret('')
      setTotpQrDataUrl('')
      setSuccess('Authenticator app MFA disabled.')
    } finally {
      setMfaBusy(false)
    }
  }

  async function addPasskey() {
    setMfaBusy(true)
    setError('')
    try {
      const optionsRes = await fetch('/api/mfa/passkeys/register/options', { method: 'POST' })
      const options = await optionsRes.json().catch(() => ({}))
      if (!optionsRes.ok) {
        setError(options.error ?? 'Could not start passkey registration')
        return
      }

      const credential = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/mfa/passkeys/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok) {
        setError(verifyData.error ?? 'Passkey registration failed')
        return
      }

      const statusRes = await fetch('/api/mfa/status')
      const statusData = await statusRes.json().catch(() => ({}))
      if (statusRes.ok) setPasskeys(statusData.passkeys ?? [])
      setSuccess('Passkey added.')
    } catch {
      setError('Passkey registration was cancelled or failed')
    } finally {
      setMfaBusy(false)
    }
  }

  async function removePasskey(id: string) {
    setMfaBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mfa/passkeys/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to remove passkey')
        return
      }
      setPasskeys((prev) => prev.filter((p) => p.id !== id))
      setSuccess('Passkey removed.')
    } finally {
      setMfaBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button type="button" onClick={handleBack} className="text-gray-500 hover:text-gray-700 transition-colors" aria-label="Go back">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="font-semibold text-gray-900">My Profile</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-[#006FFF]'}`}>
            {role === 'admin' ? 'Administrator' : 'User'}
          </span>
          {initialMfa.mfaEnforced && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">MFA Enforced</span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{success}</div>}
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Account Information</h2>
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Change Password</h2>
              <p className="text-xs text-gray-400 mt-0.5">Leave blank to keep your current password</p>
            </div>
            <div>
              <label className="label">Current Password</label>
              <div className="relative">
                <input className="input pr-10" type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to change password" autoComplete="current-password" />
                <button type="button" onClick={() => setShowCurrentPassword((v) => !v)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600" aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}>
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">New Password</label>
                <div className="relative">
                  <input className="input pr-10" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowNewPassword((v) => !v)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600" aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}>
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <div className="relative">
                  <input className="input pr-10" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-5">
            <h2 className="font-semibold text-gray-900">Security - Multi-Factor Authentication</h2>

            <div className="border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">Email code</p>
                  <p className="text-xs text-gray-500">6-digit code sent to your email</p>
                </div>
                {emailEnabled ? (
                  <button type="button" className="btn-secondary" onClick={disableEmailMfa} disabled={mfaBusy}>Disable</button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={enableEmailMfa} disabled={mfaBusy}>Enable</button>
                )}
              </div>
              {emailEnabled && <p className="text-xs text-green-700 mt-2">Enabled {emailVerified ? '(verified)' : ''}</p>}
              {emailSetupOpen && !emailEnabled && (
                <div className="mt-3 flex items-center gap-2">
                  <input className="input max-w-[180px]" value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" />
                  <button type="button" className="btn-primary" onClick={verifyEmailMfa} disabled={mfaBusy || emailCode.length !== 6}>Verify</button>
                </div>
              )}
            </div>

            <div className="border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">Authenticator app</p>
                  <p className="text-xs text-gray-500">Google Authenticator, Microsoft Authenticator, etc.</p>
                </div>
                {totpEnabled ? (
                  <button type="button" className="btn-secondary" onClick={disableTotp} disabled={mfaBusy}>Disable</button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={startTotpSetup} disabled={mfaBusy}>Setup</button>
                )}
              </div>
              {totpEnabled && <p className="text-xs text-green-700 mt-2">Enabled</p>}
              {totpSetupOpen && !totpEnabled && (
                <div className="mt-3 space-y-3">
                  {totpQrDataUrl && <img src={totpQrDataUrl} alt="Authenticator QR Code" className="w-44 h-44 border rounded-lg" />}
                  {totpSecret && <p className="text-xs text-gray-600">Manual key: <span className="font-mono">{totpSecret}</span></p>}
                  <div className="flex items-center gap-2">
                    <input className="input max-w-[180px]" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" />
                    <button type="button" className="btn-primary" onClick={verifyTotpSetup} disabled={mfaBusy || totpCode.length !== 6}>Verify</button>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">Passkeys</p>
                  <p className="text-xs text-gray-500">Windows Hello, Face ID, Touch ID, security keys</p>
                </div>
                <button type="button" className="btn-secondary" onClick={addPasskey} disabled={mfaBusy}>Add passkey</button>
              </div>
              <div className="mt-3 space-y-2">
                {passkeys.length === 0 ? (
                  <p className="text-xs text-gray-500">No passkeys registered yet.</p>
                ) : (
                  passkeys.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm text-gray-800">{p.name}</p>
                        <p className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</p>
                      </div>
                      <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removePasskey(p.id)} disabled={mfaBusy}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

