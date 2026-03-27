import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import AppSetting from '@/models/AppSetting'

function isAdmin(session: unknown): boolean {
  const user = (session as { user?: { role?: string } } | null)?.user
  return user?.role === 'admin'
}

function normalizeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withProtocol)
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await connectDB()
  const doc = await AppSetting.findOne({ key: 'global' }).select('portalUrls').lean()
  return NextResponse.json({ portalUrls: doc?.portalUrls ?? [] })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { portalUrls?: string[] } | null
  const urls = Array.isArray(body?.portalUrls) ? body!.portalUrls : []
  const normalized = Array.from(new Set(urls.map((u) => normalizeUrl(u)).filter((u): u is string => !!u)))

  await connectDB()
  const updated = await AppSetting.findOneAndUpdate(
    { key: 'global' },
    { $set: { portalUrls: normalized } },
    { upsert: true, new: true }
  ).select('portalUrls').lean()

  return NextResponse.json({ portalUrls: updated?.portalUrls ?? [] })
}

