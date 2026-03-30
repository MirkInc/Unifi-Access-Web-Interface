import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import AppSetting from '@/models/AppSetting'

function isAdmin(session: unknown): boolean {
  const user = (session as { user?: { role?: string } } | null)?.user
  return user?.role === 'admin'
}

type PermissionRole = {
  id?: string
  name: string
  canUnlock: boolean
  canEndLockSchedule: boolean
  canTempLock: boolean
  canEndTempLock: boolean
  canViewLogs: boolean
  canViewAnalytics: boolean
}

function normalizeRoles(input: PermissionRole[]): PermissionRole[] {
  const seen = new Set<string>()
  const out: PermissionRole[] = []
  for (const item of input) {
    const name = String(item?.name ?? '').trim()
    if (!name) continue
    const id = (item.id && String(item.id).trim()) || randomUUID()
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      canUnlock: Boolean(item.canUnlock),
      canEndLockSchedule: Boolean(item.canEndLockSchedule),
      canTempLock: Boolean(item.canTempLock),
      canEndTempLock: Boolean(item.canEndTempLock),
      canViewLogs: Boolean(item.canViewLogs),
      canViewAnalytics: Boolean(item.canViewAnalytics),
    })
  }
  return out
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await connectDB()
  const doc = await AppSetting.findOne({ key: 'global' }).select('permissionRoles').lean()
  return NextResponse.json({ permissionRoles: doc?.permissionRoles ?? [] })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { permissionRoles?: PermissionRole[] } | null
  const roles = Array.isArray(body?.permissionRoles) ? normalizeRoles(body!.permissionRoles) : []

  await connectDB()
  const updated = await AppSetting.findOneAndUpdate(
    { key: 'global' },
    { $set: { permissionRoles: roles } },
    { upsert: true, new: true }
  ).select('permissionRoles').lean()

  return NextResponse.json({ permissionRoles: updated?.permissionRoles ?? [] })
}

