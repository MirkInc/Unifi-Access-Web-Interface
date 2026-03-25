import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import User from '@/models/User'

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

  const body = await req.json()
  const { name, description, unifiHost, unifiApiKey, timezone } = body

  await connectDB()

  const update: Record<string, string> = { name, description, unifiHost, timezone: timezone ?? '' }
  if (unifiApiKey?.trim()) update.unifiApiKey = unifiApiKey.trim()

  try {
    const tenant = await Tenant.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(tenant)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  await Tenant.findByIdAndDelete(id)
  await Door.deleteMany({ tenantId: id })

  // Remove tenant access from all users
  await User.updateMany(
    {},
    { $pull: { tenantAccess: { tenantId: id } } }
  )

  return NextResponse.json({ success: true })
}
