import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import SystemAudit from '@/models/SystemAudit'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const userId = searchParams.get('userId')
  const action = searchParams.get('action')
  const actionParams = searchParams.getAll('action')
  const entityType = searchParams.get('entityType')
  const outcome = searchParams.get('outcome')
  const q = (searchParams.get('q') ?? '').trim()
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const fallbackLimit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? '200')))
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(500, Math.max(1, Number(searchParams.get('pageSize') ?? String(fallbackLimit))))

  await connectDB()

  const query: Record<string, unknown> = {}
  if (tenantId) query.tenantId = tenantId
  if (userId) query.actorUserId = userId
  const actions = [
    ...actionParams.flatMap((v) => v.split(',').map((x) => x.trim()).filter(Boolean)),
    ...(action && actionParams.length === 0 ? action.split(',').map((x) => x.trim()).filter(Boolean) : []),
  ]
  if (actions.length === 1) query.action = actions[0]
  if (actions.length > 1) query.action = { $in: Array.from(new Set(actions)) }
  if (entityType) query.entityType = entityType
  if (outcome === 'success' || outcome === 'failure') query.outcome = outcome

  if (since || until) {
    const t: Record<string, Date> = {}
    if (since) t.$gte = new Date(Number(since) * 1000)
    if (until) t.$lte = new Date(Number(until) * 1000)
    query.timestamp = t
  }

  if (q) {
    query.$or = [
      { actorName: { $regex: q, $options: 'i' } },
      { actorEmail: { $regex: q, $options: 'i' } },
      { action: { $regex: q, $options: 'i' } },
      { entityType: { $regex: q, $options: 'i' } },
      { entityId: { $regex: q, $options: 'i' } },
      { message: { $regex: q, $options: 'i' } },
    ]
  }

  const total = await SystemAudit.countDocuments(query)
  const rows = await SystemAudit.find(query)
    .sort({ timestamp: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      _id: r._id.toString(),
      tenantId: r.tenantId ? r.tenantId.toString() : null,
      doorId: r.doorId ? r.doorId.toString() : null,
      actorUserId: r.actorUserId ? r.actorUserId.toString() : null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
