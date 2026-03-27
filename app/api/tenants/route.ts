import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { writeAudit } from '@/lib/audit'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const tenants = await Tenant.find().sort({ name: 1 }).lean()
  return NextResponse.json(tenants)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sessionUser = session.user as { id?: string; name?: string; email?: string; role?: string }

  const body = await req.json()
  const { name, description, unifiHost, unifiApiKey, timezone } = body

  if (!name || !unifiHost || !unifiApiKey) {
    return NextResponse.json({ error: 'name, unifiHost, and unifiApiKey are required' }, { status: 400 })
  }

  await connectDB()
  const tenant = await Tenant.create({
    name,
    description,
    unifiHost,
    unifiApiKey,
    timezone: timezone ?? '',
  })
  await writeAudit({
    req,
    tenantId: tenant._id.toString(),
    actorUserId: sessionUser.id,
    actorName: sessionUser.name ?? 'Admin',
    actorEmail: sessionUser.email,
    actorRole: sessionUser.role,
    action: 'tenant.create',
    entityType: 'tenant',
    entityId: tenant._id.toString(),
    outcome: 'success',
    message: `Created site ${tenant.name}`,
    metadata: { tenantName: tenant.name, unifiHost },
  })
  return NextResponse.json(tenant, { status: 201 })
}
