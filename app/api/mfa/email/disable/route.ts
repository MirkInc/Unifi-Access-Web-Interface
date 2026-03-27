import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  user.mfaEmailEnabled = false
  user.mfaEmailVerified = false
  user.mfaEmailSetupCodeHash = null
  user.mfaEmailSetupCodeExpiresAt = null
  await user.save()

  return NextResponse.json({ success: true })
}

