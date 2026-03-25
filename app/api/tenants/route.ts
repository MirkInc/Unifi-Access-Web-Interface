import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'

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

  const body = await req.json()
  const { name, description, unifiHost, unifiApiKey, timezone } = body

  if (!name || !unifiHost || !unifiApiKey) {
    return NextResponse.json({ error: 'name, unifiHost, and unifiApiKey are required' }, { status: 400 })
  }

  await connectDB()
  const tenant = await Tenant.create({ name, description, unifiHost, unifiApiKey, timezone: timezone ?? '' })
  return NextResponse.json(tenant, { status: 201 })
}
