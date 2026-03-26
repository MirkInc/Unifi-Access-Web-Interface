import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isValidObjectId } from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import { getHealthOverview } from '@/lib/health'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    tenantId?: string
    includeDoors?: boolean
    windowHours?: number
  }
  const tenantId = body.tenantId?.trim() || undefined
  if (tenantId && !isValidObjectId(tenantId)) {
    return NextResponse.json({ error: 'invalid tenantId' }, { status: 400 })
  }

  await connectDB()
  const data = await getHealthOverview({
    tenantId,
    includeDoors: body.includeDoors === true,
    windowHours: Number(body.windowHours ?? 24),
  })

  return NextResponse.json(data)
}
