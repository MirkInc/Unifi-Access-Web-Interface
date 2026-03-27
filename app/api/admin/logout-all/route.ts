import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import AppSetting from '@/models/AppSetting'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  await AppSetting.findOneAndUpdate(
    { key: 'global' },
    { $set: { globalLogoutAt: new Date() } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true })
}
