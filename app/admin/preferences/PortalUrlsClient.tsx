'use client'

import { useEffect, useState } from 'react'

export function PortalUrlsClient() {
  const [portalUrlsText, setPortalUrlsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/portal-urls', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { portalUrls?: string[] }
        if (!cancelled) setPortalUrlsText((data.portalUrls ?? []).join('\n'))
      } catch {
        // no-op
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  async function onSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const portalUrls = portalUrlsText.split('\n').map((v) => v.trim()).filter(Boolean)
      const res = await fetch('/api/admin/portal-urls', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalUrls }),
      })
      if (!res.ok) { setError('Failed to save portal URLs'); return }
      const data = await res.json() as { portalUrls?: string[] }
      setPortalUrlsText((data.portalUrls ?? []).join('\n'))
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
          Configure allowed portal domains (one per line). Users can select from this list in their profile.
        </p>
      </div>
      <textarea
        className="input min-h-28 font-mono text-sm"
        value={portalUrlsText}
        onChange={(e) => setPortalUrlsText(e.target.value)}
        placeholder={'https://access.plrei.com\nhttps://access.mirkinc.us'}
      />
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
