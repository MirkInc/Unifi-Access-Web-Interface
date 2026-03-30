export type TenantBranding = {
  portalName?: string
  logoUrl?: string
  accentColor?: string
  loginHosts?: string[]
}

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim()
  if (!trimmed) return ''
  const full = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return full.toUpperCase()
}

function expandHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  return hex
}

function darkenHex(hex: string, amount = 0.18): string {
  const h = expandHex(hex)
  const r = Number.parseInt(h.slice(1, 3), 16)
  const g = Number.parseInt(h.slice(3, 5), 16)
  const b = Number.parseInt(h.slice(5, 7), 16)
  const dr = Math.max(0, Math.round(r * (1 - amount)))
  const dg = Math.max(0, Math.round(g * (1 - amount)))
  const db = Math.max(0, Math.round(b * (1 - amount)))
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(dr)}${toHex(dg)}${toHex(db)}`.toUpperCase()
}

export function sanitizeBranding(input: unknown): Required<TenantBranding> {
  const src = (input ?? {}) as Record<string, unknown>
  const portalName = typeof src.portalName === 'string' ? src.portalName.trim() : ''
  const logoUrl = typeof src.logoUrl === 'string' ? src.logoUrl.trim() : ''
  const accentRaw = typeof src.accentColor === 'string' ? normalizeHex(src.accentColor) : ''
  const accentColor = HEX_COLOR_RE.test(accentRaw) ? accentRaw : ''
  const loginHostsSource = Array.isArray(src.loginHosts)
    ? src.loginHosts
    : typeof src.loginHosts === 'string'
    ? src.loginHosts.split(',')
    : []
  const loginHosts = loginHostsSource
    .map((v) => (typeof v === 'string' ? normalizeHost(v) : ''))
    .filter(Boolean)

  return {
    portalName,
    logoUrl,
    accentColor,
    loginHosts: Array.from(new Set(loginHosts)),
  }
}

export function accentVars(accentColor?: string | null): { brand: string; brandDark: string } {
  const normalized = accentColor ? normalizeHex(accentColor) : ''
  if (!HEX_COLOR_RE.test(normalized)) {
    return { brand: '#006FFF', brandDark: '#0052CC' }
  }
  return {
    brand: normalized,
    brandDark: darkenHex(normalized),
  }
}

export function accentTint(accentColor?: string | null, alpha = 0.12): string {
  const { brand } = accentVars(accentColor)
  const h = expandHex(brand)
  const r = Number.parseInt(h.slice(1, 3), 16)
  const g = Number.parseInt(h.slice(3, 5), 16)
  const b = Number.parseInt(h.slice(5, 7), 16)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
