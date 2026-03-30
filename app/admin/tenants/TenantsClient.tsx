'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Tenant {
  _id: string
  name: string
  description: string
  unifiHost: string
  timezone: string
  maskedApiKey: string
  lastDoorSync: string | null
  doorCount: number
  webhookId: string | null
  webhookBaseUrl: string | null
  branding?: {
    portalName?: string
    logoUrl?: string
    accentColor?: string
    loginHosts?: string[]
  }
}

interface Props { tenants: Tenant[] }

interface ControllerWebhook {
  id: string
  name: string
  endpoint: string
  events: string[]
  createdAt: string | null
  updatedAt: string | null
  managedByPortal: boolean
}

// Parse a stored unifiHost (may be "host:port" legacy or "https://host:port") into parts
function parseHost(unifiHost: string): { protocol: string; host: string; port: string } {
  try {
    if (unifiHost.startsWith('http://') || unifiHost.startsWith('https://')) {
      const url = new URL(unifiHost)
      return { protocol: url.protocol.replace(':', ''), host: url.hostname, port: url.port || '12445' }
    }
  } catch {}
  // Legacy "host:port"
  const colonIdx = unifiHost.lastIndexOf(':')
  if (colonIdx > 0) {
    return { protocol: 'https', host: unifiHost.slice(0, colonIdx), port: unifiHost.slice(colonIdx + 1) }
  }
  return { protocol: 'https', host: unifiHost, port: '12445' }
}

function TenantForm({
  initial,
  maskedApiKey,
  onSave,
  onCancel,
}: {
  initial?: Partial<Tenant>
  maskedApiKey?: string
  onSave: (data: {
    name: string
    description: string
    unifiHost: string
    unifiApiKey: string
  }) => Promise<void>
  onCancel: () => void
}) {
  const parsed = initial?.unifiHost ? parseHost(initial.unifiHost) : null

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [protocol, setProtocol] = useState(parsed?.protocol ?? 'https')
  const [host, setHost] = useState(parsed?.host ?? '')
  const [port, setPort] = useState(parsed?.port ?? '12445')
  const [unifiApiKey, setUnifiApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const unifiHost = `${protocol}://${host}:${port}`
    try {
      await onSave({ name, description, unifiHost, unifiApiKey })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Site name */}
        <div>
          <label className="label">Site Name *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="My Office"
          />
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        {/* Controller URL — protocol + host + port */}
        <div className="sm:col-span-2">
          <label className="label">Controller Address *</label>
          <div className="flex gap-2">
            <select
              className="input w-28 flex-shrink-0"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
            >
              <option value="https">https://</option>
              <option value="http">http://</option>
            </select>
            <input
              className="input flex-1"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              placeholder="192.168.1.1"
              autoComplete="off"
            />
            <input
              className="input w-24 flex-shrink-0"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              required
              placeholder="12445"
              inputMode="numeric"
              maxLength={5}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Protocol · IP or hostname · Port</p>
        </div>

        {/* API Key */}
        <div className="sm:col-span-2">
          <label className="label">
            API Key{initial ? ' — leave blank to keep existing' : ' *'}
          </label>
          {initial && maskedApiKey && !unifiApiKey && (
            <p className="text-xs font-mono text-gray-400 mb-1 tracking-wider">{maskedApiKey}</p>
          )}
          <input
            className="input"
            value={unifiApiKey}
            onChange={(e) => setUnifiApiKey(e.target.value)}
            required={!initial}
            type="text"
            autoComplete="off"
            placeholder={initial ? 'Paste new key to replace, or leave blank' : 'Paste API key from UniFi Access'}
          />
        </div>

      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Save Changes' : 'Add Site'}
        </button>
      </div>
    </form>
  )
}

export function TenantsClient({ tenants }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ id: string; msg: string; error?: boolean } | null>(null)
  const router = useRouter()

  // Webhook state keyed by tenant ID
  const [webhookLoading, setWebhookLoading] = useState<string | null>(null)
  const [webhookError, setWebhookError] = useState<Record<string, string>>({})
  const [showWebhookForm, setShowWebhookForm] = useState<string | null>(null)
  const [webhookBaseUrl, setWebhookBaseUrl] = useState<Record<string, string>>({})
  const [webhookList, setWebhookList] = useState<Record<string, ControllerWebhook[]>>({})
  const [webhookListLoading, setWebhookListLoading] = useState<Record<string, boolean>>({})

  async function loadWebhookList(tenantId: string) {
    setWebhookListLoading((prev) => ({ ...prev, [tenantId]: true }))
    setWebhookError((prev) => ({ ...prev, [tenantId]: '' }))
    try {
      const res = await fetch(`/api/tenants/${tenantId}/webhook`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWebhookError((prev) => ({ ...prev, [tenantId]: d.error ?? 'Failed to load webhooks' }))
        return
      }
      setWebhookList((prev) => ({ ...prev, [tenantId]: Array.isArray(d.webhooks) ? d.webhooks : [] }))
    } catch {
      setWebhookError((prev) => ({ ...prev, [tenantId]: 'Network error' }))
    } finally {
      setWebhookListLoading((prev) => ({ ...prev, [tenantId]: false }))
    }
  }

  useEffect(() => {
    tenants.forEach((t) => {
      void loadWebhookList(t._id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants.map((t) => t._id).join(',')])

  async function handleRegisterWebhook(tenantId: string) {
    const baseUrl = webhookBaseUrl[tenantId] ?? (typeof window !== 'undefined' ? window.location.origin : '')
    setWebhookLoading(tenantId)
    setWebhookError((prev) => ({ ...prev, [tenantId]: '' }))
    try {
      const res = await fetch(`/api/tenants/${tenantId}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl }),
      })
      if (!res.ok) {
        const d = await res.json()
        setWebhookError((prev) => ({ ...prev, [tenantId]: d.error ?? 'Failed to register webhook' }))
      } else {
        setShowWebhookForm(null)
        await loadWebhookList(tenantId)
        router.refresh()
      }
    } catch {
      setWebhookError((prev) => ({ ...prev, [tenantId]: 'Network error' }))
    } finally {
      setWebhookLoading(null)
    }
  }

  async function handleRemoveWebhook(tenantId: string, webhookId: string, managedByPortal: boolean) {
    const msg = managedByPortal
      ? 'Remove this portal webhook? Door status events to this app will stop until you register again.'
      : 'Remove this webhook from the UniFi site?'
    if (!confirm(msg)) return
    setWebhookLoading(tenantId)
    setWebhookError((prev) => ({ ...prev, [tenantId]: '' }))
    try {
      const res = await fetch(`/api/tenants/${tenantId}/webhook?webhookId=${encodeURIComponent(webhookId)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setWebhookError((prev) => ({ ...prev, [tenantId]: d.error ?? 'Failed to remove webhook' }))
      } else {
        await loadWebhookList(tenantId)
        router.refresh()
      }
    } catch {
      setWebhookError((prev) => ({ ...prev, [tenantId]: 'Network error' }))
    } finally {
      setWebhookLoading(null)
    }
  }

  const editingTenant = tenants.find((t) => t._id === editId)

  async function handleAdd(data: {
    name: string
    description: string
    unifiHost: string
    unifiApiKey: string
  }) {
    const res = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
    setShowAdd(false)
    router.refresh()
  }

  async function handleEdit(id: string, data: {
    name: string
    description: string
    unifiHost: string
    unifiApiKey: string
  }) {
    const res = await fetch(`/api/tenants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
    setEditId(null)
    router.refresh()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete site "${name}"? This will remove all associated doors and user access.`)) return
    const res = await fetch(`/api/tenants/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  async function handleSync(id: string) {
    setSyncing(id); setSyncResult(null)
    const res = await fetch(`/api/tenants/${id}/sync`, { method: 'POST' })
    const d = await res.json()
    setSyncing(null)
    if (res.ok) setSyncResult({ id, msg: `Synced ${d.synced} door${d.synced !== 1 ? 's' : ''}` })
    else setSyncResult({ id, msg: d.error, error: true })
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-1">Manage UniFi Access controllers and sync doors</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setShowAdd(true); setEditId(null) }}
        >
          + Add Site
        </button>
      </div>

      {/* Add form — full width */}
      {showAdd && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New Site</h2>
          <TenantForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {/* Edit form — full width, above grid */}
      {editId && editingTenant && (
        <div className="card p-6 mb-6 border-blue-200 ring-1 ring-[#006FFF]/20">
          <h2 className="font-semibold text-gray-900 mb-4">Edit — {editingTenant.name}</h2>
          <TenantForm
            initial={editingTenant}
            maskedApiKey={editingTenant.maskedApiKey}
            onSave={(data) => handleEdit(editId, data)}
            onCancel={() => setEditId(null)}
          />
        </div>
      )}

      {/* Site cards */}
      {tenants.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <p>No sites yet. Add your first UniFi Access controller above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((t) => (
            <div
              key={t._id}
              className={`card p-5 transition-opacity ${editId && editId !== t._id ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  <button
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Edit"
                    onClick={() => { setEditId(t._id); setShowAdd(false) }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                  <button
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                    onClick={() => handleDelete(t._id, t.name)}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-500 space-y-1 mb-4">
                {/* URL */}
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                  </svg>
                  <span className="font-mono truncate">{t.unifiHost}</span>
                </div>
                {/* Doors */}
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm5 7a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
                  </svg>
                  <span>{t.doorCount} door{t.doorCount !== 1 ? 's' : ''}</span>
                  {t.lastDoorSync && (
                    <span className="text-gray-400">
                      · last synced {new Date(t.lastDoorSync).toLocaleDateString()} {new Date(t.lastDoorSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                {/* Timezone */}
                {t.timezone && (
                  <div className="flex items-center gap-1.5">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span>{t.timezone}</span>
                  </div>
                )}
                {/* API Key */}
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0">
                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-mono tracking-wider text-gray-400">{t.maskedApiKey}</span>
                </div>
              </div>

              {syncResult?.id === t._id && (
                <div className={`text-xs px-2 py-1 rounded-md mb-3 ${syncResult.error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                  {syncResult.msg}
                </div>
              )}

              <Link
                href={`/admin/tenants/${t._id}/doors`}
                className="btn-primary w-full flex items-center justify-center gap-2 text-xs mb-2"
              >
                Manage Site
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </Link>

              <button
                className="btn-secondary w-full flex items-center justify-center gap-2 text-xs"
                onClick={() => handleSync(t._id)}
                disabled={syncing === t._id}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${syncing === t._id ? 'animate-spin' : ''}`}>
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {syncing === t._id ? 'Syncing…' : 'Sync Doors'}
              </button>

              {/* Webhook section */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                {webhookError[t._id] && (
                  <div className="text-xs px-2 py-1 rounded-md mb-2 bg-red-50 text-red-600">
                    {webhookError[t._id]}
                  </div>
                )}

                <div className="mb-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs text-gray-500">Controller webhooks</p>
                    <button
                      className="text-xs text-[#006FFF] hover:text-[#0056CC] disabled:opacity-50"
                      onClick={() => loadWebhookList(t._id)}
                      disabled={!!webhookListLoading[t._id] || webhookLoading === t._id}
                    >
                      {webhookListLoading[t._id] ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>
                  {webhookListLoading[t._id] && !webhookList[t._id] ? (
                    <p className="text-xs text-gray-400">Loading webhooks...</p>
                  ) : (webhookList[t._id] ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">No webhooks configured on this site.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(webhookList[t._id] ?? []).map((w) => (
                        <div key={w.id} className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${w.managedByPortal ? 'bg-green-400' : 'bg-gray-300'}`} />
                              <span className="text-xs text-gray-700 truncate">{w.name || 'Unnamed webhook'}</span>
                              {w.managedByPortal && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">Portal</span>}
                            </div>
                            <p className="text-[11px] text-gray-400 font-mono break-all whitespace-normal">{w.endpoint}</p>
                            <p className="text-[11px] text-gray-400">{w.events.length} event{w.events.length !== 1 ? 's' : ''}</p>
                          </div>
                          <button
                            className="text-xs text-red-500 hover:text-red-700 flex-shrink-0 disabled:opacity-50"
                            onClick={() => handleRemoveWebhook(t._id, w.id, w.managedByPortal)}
                            disabled={webhookLoading === t._id}
                          >
                            {webhookLoading === t._id ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {showWebhookForm === t._id ? (
                  // Inline registration form
                  <div className="space-y-2">
                    <label className="text-xs text-gray-500">Base URL for this app</label>
                    <input
                      className="input text-xs"
                      value={webhookBaseUrl[t._id] ?? (typeof window !== 'undefined' ? window.location.origin : '')}
                      onChange={(e) => setWebhookBaseUrl((prev) => ({ ...prev, [t._id]: e.target.value }))}
                      placeholder="https://your-app-domain.com"
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-primary text-xs flex-1"
                        onClick={() => handleRegisterWebhook(t._id)}
                        disabled={webhookLoading === t._id}
                      >
                        {webhookLoading === t._id ? 'Registering…' : 'Register'}
                      </button>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => { setShowWebhookForm(null); setWebhookError((prev) => ({ ...prev, [t._id]: '' })) }}
                        disabled={webhookLoading === t._id}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Show register button
                  <button
                    className="btn-secondary w-full flex items-center justify-center gap-2 text-xs"
                    onClick={() => {
                      setWebhookBaseUrl((prev) => ({
                        ...prev,
                        [t._id]: prev[t._id] ?? (typeof window !== 'undefined' ? window.location.origin : ''),
                      }))
                      setShowWebhookForm(t._id)
                    }}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                    </svg>
                    Register Webhook
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

