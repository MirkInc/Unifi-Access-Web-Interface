import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isValidObjectId } from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import { getHealthOverview } from '@/lib/health'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = (searchParams.get('tenantId') ?? '').trim() || undefined
  if (tenantId && !isValidObjectId(tenantId)) {
    return NextResponse.json({ error: 'invalid tenantId' }, { status: 400 })
  }
  const includeDoors = searchParams.get('includeDoors') === 'true'
  const windowHours = Number(searchParams.get('windowHours') ?? 24)

  await connectDB()
  const data = await getHealthOverview({ tenantId, includeDoors, windowHours })
  return NextResponse.json(data)
}
