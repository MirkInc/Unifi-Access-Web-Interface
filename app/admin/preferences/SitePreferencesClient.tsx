'use client'

import { useEffect, useRef, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import { TimezoneSelect } from '@/components/TimezoneSelect'

interface TenantRow {
  _id: string
  name: string
}

interface Props {
  tenants: TenantRow[]
  initialTenantId: string
  portalUrls: string[]
}

const ACCENT_PRESETS = [
  '#006FFF',
  '#0052CC',
  '#1D4ED8',
  '#0EA5E9',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#7C3AED',
  '#0F766E',
]

function normalizeHex(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return withHash.toUpperCase()
}

function isValidHex(value: string): boolean {
  return /^#([0-9A-F]{6}|[0-9A-F]{3})$/i.test(value)
}

function extractHost(urlOrHost: string): string {
  const value = urlOrHost.trim()
  if (!value) return ''
  try {
    const withProtocol = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
    return new URL(withProtocol).host.toLowerCase()
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }
}

export function SitePreferencesClient({ tenants, initialTenantId, portalUrls }: Props) {
  const [tenantId, setTenantId] = useState(initialTenantId)
  const [hideUnlockedTime, setHideUnlockedTime] = useState(false)
  const [hideUnauthorizedOpenTime, setHideUnauthorizedOpenTime] = useState(false)
  const [timezone, setTimezone] = useState('')
  const [portalName, setPortalName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [accentColor, setAccentColor] = useState('')
  const [accentPickerOpen, setAccentPickerOpen] = useState(false)
  const [loginHosts, setLoginHosts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accentPickerRef = useRef<HTMLDivElement>(null)
  const accentDisplay = isValidHex(normalizeHex(accentColor)) ? normalizeHex(accentColor) : '#006FFF'
  const portalHostOptions = Array.from(
    new Set(
      portalUrls
        .map(extractHost)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))
  const loginHostOptions = Array.from(new Set([...portalHostOptions, ...loginHosts])).sort((a, b) => a.localeCompare(b))

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accentPickerRef.current && !accentPickerRef.current.contains(event.target as Node)) {
        setAccentPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setSaved(false)
      try {
        const res = await fetch(`/api/admin/site-preferences?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setError('Failed to load preferences')
          return
        }
        const data = await res.json() as {
          hideUnlockedTime: boolean
          hideUnauthorizedOpenTime: boolean
          timezone?: string
          branding?: {
            portalName?: string
            logoUrl?: string
            accentColor?: string
            loginHosts?: string[]
          }
        }
        if (cancelled) return
        setHideUnlockedTime(data.hideUnlockedTime !== false)
        setHideUnauthorizedOpenTime(data.hideUnauthorizedOpenTime !== false)
        setTimezone(data.timezone ?? '')
        setPortalName(data.branding?.portalName ?? '')
        setLogoUrl(data.branding?.logoUrl ?? '')
        setAccentColor(data.branding?.accentColor ?? '')
        setLoginHosts((data.branding?.loginHosts ?? []).map((h) => extractHost(h)).filter(Boolean))
      } catch {
        if (!cancelled) setError('Failed to load preferences')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [tenantId])

  async function onSave() {
    if (!tenantId) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/site-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          hideUnlockedTime,
          hideUnauthorizedOpenTime,
          timezone,
          branding: {
            portalName,
            logoUrl,
            accentColor,
            loginHosts,
          },
        }),
      })
      if (!res.ok) { setError('Failed to save preferences'); return }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } catch {
      setError('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {tenants.length > 1 && (
        <div>
          <label className="label">Site</label>
          <Select.Root value={tenantId || '__none'} onValueChange={(v) => setTenantId(v === '__none' ? '' : v)}>
            <Select.Trigger className="w-full md:w-80 flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10">
              <Select.Value placeholder="Select site" />
              <Select.Icon className="ml-auto"><ChevronDown className="w-4 h-4 text-gray-400" /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50" position="popper" sideOffset={4}>
                <Select.Viewport className="p-1">
                  {tenants.map((t) => (
                    <Select.Item key={t._id} value={t._id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 outline-none data-[highlighted]:bg-gray-50">
                      <Select.ItemText>{t.name}</Select.ItemText>
                      <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-[#006FFF]" /></Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Site Identity & Timezone</h2>
          <p className="text-sm text-gray-500 mt-1">Branding and timezone for this specific site.</p>
        </div>

        <div>
          <label className="label">Controller Timezone</label>
          <TimezoneSelect value={timezone} onChange={setTimezone} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Portal Name</label>
            <input
              className="input"
              value={portalName}
              onChange={(e) => setPortalName(e.target.value)}
              placeholder="Example Access"
              disabled={loading || saving}
            />
          </div>
          <div>
            <label className="label">Accent Color (Hex)</label>
            <div className="relative" ref={accentPickerRef}>
              <button
                type="button"
                className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10"
                onClick={() => setAccentPickerOpen((v) => !v)}
                disabled={loading || saving}
              >
                <span className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: accentDisplay }} />
                <span>{accentDisplay}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
              </button>

              {accentPickerOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-3">
                  <div>
                    <label className="text-xs text-gray-500">Color Picker</label>
                    <div className="mt-1 rounded-lg border border-gray-200 p-2 bg-gray-50">
                      <HexColorPicker color={accentDisplay} onChange={(c) => setAccentColor(normalizeHex(c))} style={{ width: '100%' }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Pick any custom color, then fine-tune with hex if needed.</p>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {ACCENT_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="h-8 rounded-lg border border-gray-200 hover:scale-[1.02] transition-transform"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setAccentColor(color)
                          setAccentPickerOpen(false)
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Custom Hex</label>
                    <input
                      className="input mt-1"
                      value={accentColor}
                      onChange={(e) => setAccentColor(normalizeHex(e.target.value))}
                      placeholder="#006FFF"
                      disabled={loading || saving}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Logo URL</label>
            <input
              className="input"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              disabled={loading || saving}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Login Hostnames</label>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006FFF]/20 focus:border-[#006FFF] transition-colors min-h-10"
                  disabled={loading || saving}
                >
                  <span className="truncate text-left">
                    {loginHosts.length === 0
                      ? 'Select login hostnames...'
                      : loginHosts.length === 1
                      ? loginHosts[0]
                      : `${loginHosts.length} hostnames selected`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  sideOffset={4}
                  align="start"
                  className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[320px] bg-white border border-gray-200 rounded-xl shadow-lg p-1"
                >
                  {loginHostOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      No portal URLs configured in Admin Preferences.
                    </div>
                  ) : (
                    loginHostOptions.map((host) => (
                      <DropdownMenu.CheckboxItem
                        key={host}
                        checked={loginHosts.includes(host)}
                        onCheckedChange={(checked) => {
                          setLoginHosts((prev) =>
                            checked
                              ? Array.from(new Set([...prev, host]))
                              : prev.filter((h) => h !== host)
                          )
                        }}
                        className="group flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 outline-none"
                      >
                        <DropdownMenu.ItemIndicator>
                          <Check className="w-3.5 h-3.5 text-[#006FFF]" />
                        </DropdownMenu.ItemIndicator>
                        <span className="truncate">{host}</span>
                      </DropdownMenu.CheckboxItem>
                    ))
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <p className="text-xs text-gray-400 mt-1">
              Select from Admin Preferences portal URLs. Hostnames can be assigned to multiple sites.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Analytics Display</h2>
          <p className="text-sm text-gray-500 mt-1">Control which analytics sections are visible for this site.</p>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={hideUnlockedTime}
            onChange={(e) => setHideUnlockedTime(e.target.checked)}
            disabled={loading || saving}
          />
          <span className="text-sm text-gray-700">Hide &quot;Estimated Time Unlocked&quot; sections</span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={hideUnauthorizedOpenTime}
            onChange={(e) => setHideUnauthorizedOpenTime(e.target.checked)}
            disabled={loading || saving}
          />
          <span className="text-sm text-gray-700">Hide &quot;Unauthorized Open Time&quot; sections</span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            onClick={onSave}
            disabled={!tenantId || loading || saving}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  )
}
