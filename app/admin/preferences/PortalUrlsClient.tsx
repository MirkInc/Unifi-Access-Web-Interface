'use client'

import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'

function normalizeDraftUrl(value: string): string {
  return value.trim()
}

export function PortalUrlsClient() {
  const [portalUrls, setPortalUrls] = useState<string[]>([])
  const [newUrl, setNewUrl] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/portal-urls', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { portalUrls?: string[] }
        if (!cancelled) setPortalUrls(data.portalUrls ?? [])
      } catch {
        // no-op
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditingValue(portalUrls[index] ?? '')
  }

  function cancelEdit() {
    setEditingIndex(null)
    setEditingValue('')
  }

  function applyEdit() {
    if (editingIndex === null) return
    const next = normalizeDraftUrl(editingValue)
    if (!next) return
    setPortalUrls((prev) => prev.map((v, i) => (i === editingIndex ? next : v)))
    cancelEdit()
    setSaved(false)
  }

  function addUrl() {
    const next = normalizeDraftUrl(newUrl)
    if (!next) return
    setPortalUrls((prev) => (prev.includes(next) ? prev : [...prev, next]))
    setNewUrl('')
    setSaved(false)
    setError(null)
  }

  function removeUrl(index: number) {
    setPortalUrls((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  async function onSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/admin/portal-urls', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalUrls }),
      })
      if (!res.ok) {
        setError('Failed to save portal URLs')
        return
      }
      const data = (await res.json()) as { portalUrls?: string[] }
      setPortalUrls(data.portalUrls ?? [])
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } catch {
      setError('Failed to save portal URLs')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-5 space-y-4 max-w-2xl">
      <div>
        <h2 className="font-semibold text-gray-900">Portal URLs</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage allowed portal domains. Users and site login host mappings select from this list.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="input"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://access.example.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addUrl()
            }
          }}
        />
        <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={addUrl}>
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <div className="space-y-2">
        {portalUrls.length === 0 ? (
          <p className="text-sm text-gray-400">No portal URLs configured yet.</p>
        ) : (
          portalUrls.map((url, index) => (
            <div key={`${url}-${index}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
              {editingIndex === index ? (
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        applyEdit()
                      }
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <button type="button" className="btn-secondary p-2" onClick={applyEdit} aria-label="Save edit">
                    <Check className="w-4 h-4" />
                  </button>
                  <button type="button" className="btn-secondary p-2" onClick={cancelEdit} aria-label="Cancel edit">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-gray-700 break-all">{url}</p>
                  <button type="button" className="btn-secondary p-2" onClick={() => startEdit(index)} aria-label="Edit URL">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" className="btn-secondary p-2 text-red-600 hover:bg-red-50 border-red-200" onClick={() => removeUrl(index)} aria-label="Delete URL">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary disabled:opacity-50" onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Portal URLs'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
