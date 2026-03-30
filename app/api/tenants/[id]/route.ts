import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import User from '@/models/User'
import { writeAudit } from '@/lib/audit'
import { sanitizeBranding } from '@/lib/branding'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const tenant = await Tenant.findById(id).lean()
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const doors = await Door.find({ tenantId: id }).sort({ name: 1 }).lean()
  return NextResponse.json({ tenant, doors })
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sessionUser = session.user as { id?: string; name?: string; email?: string; role?: string }

  const body = await req.json()
  const { name, description, unifiHost, unifiApiKey, timezone, branding } = body

  await connectDB()

  const update: Record<string, unknown> = {
    name,
    description,
    unifiHost,
  }
  if (typeof timezone === 'string') update.timezone = timezone
  if (branding !== undefined) update.branding = sanitizeBranding(branding)
  if (unifiApiKey?.trim()) update.unifiApiKey = unifiApiKey.trim()

  try {
    const tenant = await Tenant.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await writeAudit({
      req,
      tenantId: tenant._id.toString(),
      actorUserId: sessionUser.id,
      actorName: sessionUser.name ?? 'Admin',
      actorEmail: sessionUser.email,
      actorRole: sessionUser.role,
      action: 'tenant.update',
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      outcome: 'success',
      message: `Updated site ${tenant.name}`,
      metadata: {
        tenantName: tenant.name,
        unifiHost: tenant.unifiHost,
        timezone: tenant.timezone,
      },
    })
    return NextResponse.json(tenant)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sessionUser = session.user as { id?: string; name?: string; email?: string; role?: string }

  await connectDB()
  const tenant = await Tenant.findById(id).lean()
  await Tenant.findByIdAndDelete(id)
  await Door.deleteMany({ tenantId: id })

  // Remove tenant access from all users
  await User.updateMany(
    {},
    { $pull: { tenantAccess: { tenantId: id } } }
  )

  await writeAudit({
    req,
    tenantId: id,
    actorUserId: sessionUser.id,
    actorName: sessionUser.name ?? 'Admin',
    actorEmail: sessionUser.email,
    actorRole: sessionUser.role,
    action: 'tenant.delete',
    entityType: 'tenant',
    entityId: id,
    outcome: 'success',
    message: `Deleted site ${tenant?.name ?? id}`,
    metadata: { tenantName: tenant?.name ?? '' },
  })

  return NextResponse.json({ success: true })
}
