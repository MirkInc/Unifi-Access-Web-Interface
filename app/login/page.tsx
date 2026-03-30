'use client'

import { useState, useEffect, useRef } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { startAuthentication } from '@simplewebauthn/browser'
import { Eye, EyeOff, KeyRound, Mail, Smartphone } from 'lucide-react'
import { OtpInput } from '@/components/OtpInput'
import { accentVars } from '@/lib/branding'

type MfaMethod = 'email' | 'totp' | 'passkey'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [step, setStep] = useState<'password' | 'notice' | 'mfa'>('password')
  const [mfaView, setMfaView] = useState<'choose' | 'verify'>('choose')
  const [challengeToken, setChallengeToken] = useState('')
  const [methods, setMethods] = useState<MfaMethod[]>([])
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>('email')
  const [code, setCode] = useState('')
  const [policyNotice, setPolicyNotice] = useState('')
  const [policyEnforceAt, setPolicyEnforceAt] = useState<string>('')
  const [brandPortalName, setBrandPortalName] = useState('Access Portal')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [brandAccent, setBrandAccent] = useState('#006FFF')

  useEffect(() => {
    let cancelled = false
    async function loadBranding() {
      try {
        const res = await fetch('/api/branding/login', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return
        const b = data.branding as { portalName?: string; logoUrl?: string; accentColor?: string } | null | undefined
        if (!b) return
        if (b.portalName) setBrandPortalName(b.portalName)
        if (b.logoUrl) setBrandLogoUrl(b.logoUrl)
        if (b.accentColor) setBrandAccent(b.accentColor)
      } catch {
        // keep default branding
      }
    }
    void loadBranding()
    return () => { cancelled = true }
  }, [])

  const { brand, brandDark } = accentVars(brandAccent)
  const primaryButtonStyle: React.CSSProperties = { backgroundColor: brand }

  const passkeyAutoTriggered = useRef(false)
  useEffect(() => {
    if (step === 'mfa' && mfaView === 'verify' && selectedMethod === 'passkey' && !loading) {
      if (passkeyAutoTriggered.current) return
      passkeyAutoTriggered.current = true
      void verifyPasskey()
    } else {
      passkeyAutoTriggered.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mfaView, selectedMethod])

  async function finishLogin(loginToken: string) {
    const res = await signIn('credentials', {
      mfaLoginToken: loginToken,
      redirect: false,
    })
    if (res?.error) {
      setError('Could not complete login')
      return
    }
    router.push('/')
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const mfaStartRes = await fetch('/api/auth/mfa/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const mfaStart = await mfaStartRes.json().catch(() => ({}))

      if (!mfaStartRes.ok) {
        setError(mfaStart.error ?? 'Invalid email or password')
        return
      }

      if (!mfaStart.requiresMfa) {
        if (mfaStart.policyNotice) {
          setPolicyNotice(String(mfaStart.policyNotice))
          setPolicyEnforceAt(String(mfaStart.enforceAt ?? ''))
          setStep('notice')
          return
        }
        const res = await signIn('credentials', { email, password, redirect: false })
        if (res?.error) setError('Invalid email or password')
        else router.push('/')
        return
      }

      const available = (mfaStart.methods ?? []) as MfaMethod[]
      const defaultMethod = (mfaStart.defaultMethod as MfaMethod) ?? available[0] ?? 'email'
      const token = mfaStart.challengeToken ?? ''
      setMethods(available)
      setSelectedMethod(defaultMethod)
      setChallengeToken(token)
      setPolicyNotice(String(mfaStart.policyNotice ?? ''))
      const skipChooser = available.length === 1
      setMfaView(skipChooser ? 'verify' : 'choose')
      setStep('mfa')
      // Send email code only if email is the method being shown immediately
      if (defaultMethod === 'email' && skipChooser) {
        void sendEmailCode(token)
      }
    } finally {
      setLoading(false)
    }
  }

  async function submitCode(codeValue: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/mfa/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, method: selectedMethod, code: codeValue }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'MFA verification failed')
        setCode('')
        return
      }
      await finishLogin(data.loginToken)
    } finally {
      setLoading(false)
    }
  }

  function handleCodeVerify(e: React.FormEvent) {
    e.preventDefault()
    void submitCode(code)
  }

  async function sendEmailCode(token: string) {
    try {
      const res = await fetch('/api/auth/mfa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? 'Failed to send code')
    } catch {
      setError('Failed to send code')
    }
  }

  async function resendEmailCode() {
    setLoading(true)
    setError('')
    try {
      await sendEmailCode(challengeToken)
    } finally {
      setLoading(false)
    }
  }

  async function verifyPasskey() {
    setLoading(true)
    setError('')
    try {
      const optionsRes = await fetch('/api/auth/mfa/passkey/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken }),
      })
      const options = await optionsRes.json().catch(() => ({}))
      if (!optionsRes.ok) {
        setError(options.error ?? 'Could not start passkey verification')
        return
      }

      const credential = await startAuthentication({ optionsJSON: options })
      const verifyRes = await fetch('/api/auth/mfa/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, credential }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok) {
        setError(verifyData.error ?? 'Passkey verification failed')
        return
      }

      await finishLogin(verifyData.loginToken)
    } catch {
      setError('Passkey verification was cancelled or failed')
    } finally {
      setLoading(false)
    }
  }

  const codePrompt = selectedMethod === 'totp' ? 'Authenticator code' : 'Email code'
  const methodLabel = (method: MfaMethod) => {
    if (method === 'email') return 'Email code'
    if (method === 'totp') return 'Authenticator app'
    return 'Passkey (Windows Hello / Face ID / Touch ID)'
  }
  const methodSubtitle = (method: MfaMethod) => {
    if (method === 'email') {
      const [name = '', domain = ''] = email.split('@')
      const maskedLocal = name ? `${name.charAt(0)}***` : ''
      if (!domain) return maskedLocal || email
      return `${maskedLocal}@${domain}`
    }
    if (method === 'totp') return 'Use your authenticator app'
    return 'Use your device passkey'
  }
  const methodIcon = (method: MfaMethod) => {
    if (method === 'email') return <Mail className="w-5 h-5" style={{ color: brand }} />
    if (method === 'totp') return <Smartphone className="w-5 h-5" style={{ color: brand }} />
    return <KeyRound className="w-5 h-5" style={{ color: brand }} />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 overflow-hidden"
            style={{ backgroundColor: brand }}
          >
            {brandLogoUrl ? (
              <img src={brandLogoUrl} alt={brandPortalName} className="w-full h-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-white" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{brandPortalName}</h1>
          <p className="text-sm text-gray-500 mt-1">{step === 'password' ? 'Sign in to your account' : 'Verify your identity'}</p>
        </div>

        <div className="card p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {step === 'password' ? (
            <form onSubmit={handlePasswordSubmit} method="post" className="space-y-4">
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>

              <div>
                <div className="mb-1">
                  <label className="label" htmlFor="password">Password</label>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-1 text-right">
                  <Link href="/forgot-password" className="text-xs hover:underline" style={{ color: brand }}>Forgot password?</Link>
                </div>
              </div>

              <button
                type="submit"
                className="w-full text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                style={primaryButtonStyle}
                onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brandDark }}
                onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brand }}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          ) : step === 'notice' ? (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg">
                {policyNotice || 'An administrator has updated your account security policy to require MFA.'}
              </div>
              {policyEnforceAt && (
                <p className="text-xs text-gray-500">
                  Enforcement starts: {new Date(policyEnforceAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
              <button
                type="button"
                className="w-full text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                style={primaryButtonStyle}
                onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brandDark }}
                onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brand }}
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  setError('')
                  const res = await signIn('credentials', { email, password, redirect: false })
                  setLoading(false)
                  if (res?.error) setError('Invalid email or password')
                  else router.push('/mfa-setup')
                }}
              >
                {loading ? 'Continuing...' : 'Set up MFA now'}
              </button>
              <button
                type="button"
                className="btn-secondary w-full"
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  setError('')
                  const res = await signIn('credentials', { email, password, redirect: false })
                  setLoading(false)
                  if (res?.error) setError('Invalid email or password')
                  else router.push('/')
                }}
              >
                {loading ? 'Continuing...' : 'Skip for now'}
              </button>
              <button
                type="button"
                className="w-full text-sm text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setStep('password')
                  setPolicyNotice('')
                }}
              >
                Back
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {policyNotice && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg">
                  {policyNotice}
                </div>
              )}
              {mfaView === 'choose' ? (
                <div className="space-y-3">
                  <h2 className="text-xl font-semibold text-gray-900">Authentication Method</h2>
                  {methods.map((method) => (
                    <button
                      key={method}
                      type="button"
                      className="w-full text-left px-1 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors rounded-md"
                      onClick={() => {
                        setSelectedMethod(method)
                        setCode('')
                        setError('')
                        setMfaView('verify')
                        if (method === 'email') void sendEmailCode(challengeToken)
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${brand}14` }}>
                          {methodIcon(method)}
                        </span>
                        <div>
                          <p className="text-base text-gray-900">{methodLabel(method)}</p>
                          <p className="text-sm text-gray-500">{methodSubtitle(method)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : selectedMethod === 'passkey' ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Use your selected method: {methodLabel(selectedMethod)}</p>
                  <button
                    type="button"
                    className="w-full text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    style={primaryButtonStyle}
                    onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brandDark }}
                    onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brand }}
                    onClick={verifyPasskey}
                    disabled={loading}
                  >
                    {loading ? 'Waiting for passkey...' : 'Use passkey'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCodeVerify} className="space-y-3">
                  <p className="text-sm text-gray-600">Use your selected method: {methodLabel(selectedMethod)}</p>
                  <div>
                    <label className="label">{codePrompt}</label>
                    <OtpInput value={code} onChange={setCode} onComplete={submitCode} disabled={loading} autoFocus />
                  </div>
                  <button
                    type="submit"
                    className="w-full text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    style={primaryButtonStyle}
                    onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brandDark }}
                    onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = brand }}
                    disabled={loading || code.length !== 6}
                  >
                    {loading ? 'Verifying...' : 'Verify'}
                  </button>
                  {selectedMethod === 'email' && (
                    <button type="button" className="btn-secondary w-full" onClick={resendEmailCode} disabled={loading}>
                      Resend code
                    </button>
                  )}
                </form>
              )}

              <button
                type="button"
                className="w-full text-sm text-gray-500 hover:text-gray-700"
                onClick={() => {
                  if (mfaView === 'verify' && methods.length > 1) {
                    setMfaView('choose')
                    setCode('')
                    setError('')
                    return
                  }
                  setStep('password')
                  setChallengeToken('')
                  setMethods([])
                  setCode('')
                  setError('')
                }}
              >
                {mfaView === 'verify' && methods.length > 1 ? 'Choose another method' : 'Cancel'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
