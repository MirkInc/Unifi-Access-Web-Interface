import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import { writeAudit } from '@/lib/audit'
import mongoose from 'mongoose'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as { id?: string; name?: string; email?: string; role?: string }
  const body = await req.json().catch(() => ({}))
  const path = typeof body.path === 'string' ? body.path : ''
  const query = typeof body.query === 'string' ? body.query : ''

  if (!path || !path.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  await connectDB()

  let tenantId: string | null = null
  let doorId: string | null = null
  const isObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value)

  const params = new URLSearchParams(query)
  const queryTenantId = params.get('tenantId')
  if (queryTenantId && isObjectId(queryTenantId)) tenantId = queryTenantId

  const segments = path.split('/').filter(Boolean)

  if (segments[0] === 'door' && segments[1]) {
    if (!isObjectId(segments[1])) {
      return NextResponse.json({ ok: true })
    }
    doorId = segments[1]
    const door = await Door.findById(doorId).select('tenantId').lean()
    if (door?.tenantId) tenantId = door.tenantId.toString()
  } else if (segments[0]) {
    // New canonical paths:
    // /{tenantId}
    // /{tenantId}/{doorId}
    const candidateTenantId = segments[0]
    if (!isObjectId(candidateTenantId)) {
      // Non-tenant route (e.g. /admin, /profile, /)
      await writeAudit({
        req,
        tenantId,
        doorId,
        actorUserId: sessionUser.id,
        actorName: sessionUser.name ?? 'Portal User',
        actorEmail: sessionUser.email,
        actorRole: sessionUser.role,
        action: 'screen.view',
        entityType: 'screen',
        entityId: path,
        outcome: 'success',
        message: `Viewed ${path}`,
        metadata: { path, query },
      })
      return NextResponse.json({ ok: true })
    }
    const tenant = await Tenant.findById(candidateTenantId).select('_id').lean()
    if (tenant) {
      tenantId = tenant._id.toString()
      if (segments[1]) {
        const candidateDoorId = segments[1]
        if (isObjectId(candidateDoorId)) {
          const door = await Door.findOne({ _id: candidateDoorId, tenantId: tenant._id }).select('_id').lean()
          if (door) doorId = door._id.toString()
        }
      }
    }
  }

  await writeAudit({
    req,
    tenantId,
    doorId,
    actorUserId: sessionUser.id,
    actorName: sessionUser.name ?? 'Portal User',
    actorEmail: sessionUser.email,
    actorRole: sessionUser.role,
    action: 'screen.view',
    entityType: 'screen',
    entityId: path,
    outcome: 'success',
    message: `Viewed ${path}`,
    metadata: {
      path,
      query,
    },
  })

  return NextResponse.json({ ok: true })
}
