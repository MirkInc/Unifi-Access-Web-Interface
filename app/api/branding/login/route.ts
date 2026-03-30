import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { sanitizeBranding } from '@/lib/branding'

function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().split(':')[0]
}

export async function GET(req: Request) {
  await connectDB()

  const forwardedHost = req.headers.get('x-forwarded-host') ?? ''
  const hostHeader = req.headers.get('host') ?? ''
  const host = normalizeHost(forwardedHost || hostHeader)
  if (!host) return NextResponse.json({ branding: null })

  const tenants = await Tenant.find({ 'branding.loginHosts': host })
    .select('name branding')
    .limit(2)
    .lean()

  if (tenants.length !== 1) {
    return NextResponse.json({ branding: null })
  }

  const tenant = tenants[0]
  const branding = sanitizeBranding(tenant.branding)
  return NextResponse.json({
    branding: {
      portalName: branding.portalName || tenant.name,
      logoUrl: branding.logoUrl || '',
      accentColor: branding.accentColor || '',
      tenantName: tenant.name,
    },
  })
}

