'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function ConfirmEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [name, setName] = useState('')
  const called = useRef(false)

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    if (called.current) return
    called.current = true
    fetch(`/api/confirm-email?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) { setStatus('success'); setName(d.name ?? '') }
        else setStatus('error')
      })
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card p-8 max-w-sm w-full text-center">
        {status === 'loading' && <p className="text-gray-500">Confirming…</p>}
        {status === 'success' && (
          <>
            <div className="text-green-500 text-4xl mb-4">✓</div>
            <h2 className="text-lg font-semibold mb-2">Email Confirmed</h2>
            <p className="text-gray-500 text-sm mb-4">
              {name ? `Hi ${name}, your` : 'Your'} email address has been updated successfully.
            </p>
            <button className="btn-primary" onClick={() => router.push('/login')}>Sign In</button>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-red-500 text-4xl mb-4">✕</div>
            <h2 className="text-lg font-semibold mb-2">Link Invalid</h2>
            <p className="text-gray-500 text-sm mb-4">This confirmation link is invalid or has expired.</p>
            <button className="btn-primary" onClick={() => router.push('/login')}>Back to Login</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailForm />
    </Suspense>
  )
}
