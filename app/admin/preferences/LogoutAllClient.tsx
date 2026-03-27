'use client'

import { useState } from 'react'

export function LogoutAllClient() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function handleLogoutAll() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/logout-all', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Failed to log out all users'); return }
      setDone(true)
      setConfirming(false)
      window.setTimeout(() => setDone(false), 3000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-5 space-y-4 max-w-2xl">
      <div>
        <h2 className="font-semibold text-gray-900">Session Management</h2>
        <p className="text-sm text-gray-500 mt-1">
          Force all active sessions to expire within 5 minutes. Use this if you suspect a security incident.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {confirming ? (
          <>
            <button
              type="button"
              className="btn-primary bg-red-600 hover:bg-red-700 border-red-600"
              onClick={handleLogoutAll}
              disabled={busy}
            >
              {busy ? 'Logging out...' : 'Confirm — Log Out Everyone'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-secondary text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setConfirming(true)}
          >
            Log Out All Users
          </button>
        )}
        {done && <span className="text-sm text-green-600 font-medium">All sessions invalidated.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
