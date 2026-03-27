'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'


interface UserRow {
  _id: string
  name: string
  email: string
  role: string
  isActive: boolean
  pendingEmail: string | null
  preferredPortalUrl: string | null
  tenantCount: number
}

interface Tenant { _id: string; name: string }

interface Props {
  users: UserRow[]
  tenants: Tenant[]
  portalUrls: string[]
}

function CreateUserModal({
  portalUrls,
  onClose,
  onCreated,
}: {
  portalUrls: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
  const [sendInvite, setSendInvite] = useState(true)
  const [password, setPassword] = useState('')
  const [preferredPortalUrl, setPreferredPortalUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        role,
        sendInvite,
        password: sendInvite ? undefined : password,
        preferredPortalUrl: preferredPortalUrl || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) { onCreated(); onClose() }
    else { const d = await res.json(); setError(d.error) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg text-gray-900">Create User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">{error}</div>}

          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Smith" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@example.com" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">User (tenant access only)</option>
              <option value="admin">Admin (full management access)</option>
            </select>
          </div>
          <div>
            <label className="label">Preferred Portal URL</label>
            <select
              className="input"
              value={preferredPortalUrl}
              onChange={(e) => setPreferredPortalUrl(e.target.value)}
            >
              <option value="">Default (current domain)</option>
              {portalUrls.map((url) => (
                <option key={url} value={url}>{url}</option>
              ))}
            </select>
          </div>

          {/* Password method */}
          <div className="border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Password Setup</p>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                checked={sendInvite}
                onChange={() => setSendInvite(true)}
                className="accent-[#006FFF]"
              />
              <span className="text-sm text-gray-700">Send invite email — user sets their own password</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                checked={!sendInvite}
                onChange={() => setSendInvite(false)}
                className="accent-[#006FFF]"
              />
              <span className="text-sm text-gray-700">Set password manually</span>
            </label>
            {!sendInvite && (
              <input
                className="input"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!sendInvite}
                minLength={8}
              />
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function UsersClient({ users, tenants: _tenants, portalUrls }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete user "${name}"?`)) return
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  async function handleResendInvite(id: string, name: string) {
    setResendingId(id)
    setNotice(null)
    try {
      const res = await fetch(`/api/users/${id}/resend-invite`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice({ type: 'error', text: d.error ?? 'Failed to resend invitation' })
        return
      }
      setNotice({ type: 'success', text: `Reminder email sent to ${name}.` })
    } finally {
      setResendingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Create User</button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b">
          <input
            className="input max-w-xs"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {notice && (
            <div
              className={`mt-3 text-sm px-3 py-2 rounded-lg border ${
                notice.type === 'success'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {notice.text}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No users found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Sites</th>
                <th className="px-4 py-3">Preferred URL</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-[#006FFF] text-white text-xs font-semibold
                                       flex items-center justify-center flex-shrink-0">
                        {getInitials(u.name)}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-gray-900">{u.name}</p>
                          {!u.isActive && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Pending</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{u.email}</p>
                        {u.pendingEmail && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-gray-400">{u.pendingEmail}</p>
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Pending</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                      ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.tenantCount} site{u.tenantCount !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.preferredPortalUrl ? (
                      <span className="break-all">{u.preferredPortalUrl}</span>
                    ) : (
                      <span className="text-gray-400">Default (current domain)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!u.isActive && (
                        <button
                          className="text-xs text-gray-600 hover:underline disabled:opacity-50"
                          onClick={() => handleResendInvite(u._id, u.name)}
                          disabled={resendingId === u._id}
                        >
                          {resendingId === u._id ? 'Sending…' : 'Resend Invite'}
                        </button>
                      )}
                      <Link
                        href={`/admin/users/${u._id}`}
                        className="text-xs text-[#006FFF] hover:underline font-medium"
                      >
                        Manage
                      </Link>
                      <button
                        className="text-xs text-red-500 hover:underline"
                        onClick={() => handleDelete(u._id, u.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          portalUrls={portalUrls}
          onClose={() => setShowCreate(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}
