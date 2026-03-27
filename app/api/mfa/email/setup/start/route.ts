import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { generateNumericCode, hashMfaCode } from '@/lib/mfa'
import { sendMfaCodeEmail } from '@/lib/mail'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const code = generateNumericCode(6)
  user.mfaEmailSetupCodeHash = hashMfaCode(code)
  user.mfaEmailSetupCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await user.save()

  await sendMfaCodeEmail(user.email, user.name, code)
  return NextResponse.json({ success: true })
}

