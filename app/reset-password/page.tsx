'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [valid, setValid] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) { setValid(false); return }
    fetch(`/api/password-reset?token=${token}`)
      .then((r) => r.json())
      .then((d) => { setValid(d.valid); if (d.name) setName(d.name) })
      .catch(() => setValid(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    setLoading(false)
    if (res.ok) { setSuccess(true); setTimeout(() => router.push('/login'), 2000) }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  if (valid === null) return <div className="text-center text-gray-500 mt-8">Verifying…</div>

  if (!valid) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card p-8 max-w-sm w-full text-center">
        <div className="text-red-500 text-4xl mb-4">✕</div>
        <h2 className="text-lg font-semibold mb-2">Link Expired</h2>
        <p className="text-gray-500 text-sm">This password reset link is invalid or has expired.</p>
        <button className="btn-primary mt-4" onClick={() => router.push('/login')}>Back to Login</button>
      </div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card p-8 max-w-sm w-full text-center">
        <div className="text-green-500 text-4xl mb-4">✓</div>
        <h2 className="text-lg font-semibold">Password Set!</h2>
        <p className="text-gray-500 text-sm mt-2">Redirecting to login…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#006FFF] mb-4">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-white" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold">Set Your Password</h1>
          {name && <p className="text-gray-500 text-sm mt-1">Welcome, {name}</p>}
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} className="input pr-10" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Minimum 8 characters" />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <div className="relative">
              <input type={showConfirm ? 'text' : 'password'} className="input pr-10" value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="Re-enter password" />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Saving…' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
