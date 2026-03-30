import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { sanitizeBranding } from '@/lib/branding'

function isAdminSession(session: unknown): boolean {
  const user = (session as { user?: { role?: string } } | null)?.user
  return user?.role === 'admin'
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminSession(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('analyticsPrefs timezone branding').lean()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const prefs = (tenant.analyticsPrefs ?? {}) as {
    hideUnlockedTime?: boolean
    hideUnauthorizedOpenTime?: boolean
  }
  return NextResponse.json({
    hideUnlockedTime: prefs.hideUnlockedTime !== false,
    hideUnauthorizedOpenTime: prefs.hideUnauthorizedOpenTime !== false,
    timezone: tenant.timezone ?? '',
    branding: sanitizeBranding(tenant.branding),
  })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminSession(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    tenantId?: string
    hideUnlockedTime?: boolean
    hideUnauthorizedOpenTime?: boolean
    timezone?: string
    branding?: unknown
  } | null
  const tenantId = body?.tenantId?.trim()
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  await connectDB()
  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: {
        analyticsPrefs: {
          hideUnlockedTime: body?.hideUnlockedTime !== false,
          hideUnauthorizedOpenTime: body?.hideUnauthorizedOpenTime !== false,
        },
        timezone: typeof body?.timezone === 'string' ? body.timezone : '',
        branding: sanitizeBranding(body?.branding),
      },
    },
    { new: true }
  ).select('analyticsPrefs timezone branding').lean()

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  return NextResponse.json({
    hideUnlockedTime: tenant.analyticsPrefs?.hideUnlockedTime !== false,
    hideUnauthorizedOpenTime: tenant.analyticsPrefs?.hideUnauthorizedOpenTime !== false,
    timezone: tenant.timezone ?? '',
    branding: sanitizeBranding(tenant.branding),
  })
}
