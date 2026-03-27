import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { isMfaCodeValid, isValidSixDigitCode } from '@/lib/mfa'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  if (!isValidSixDigitCode(String(code ?? ''))) {
    return NextResponse.json({ error: 'Enter a valid 6-digit code' }, { status: 400 })
  }

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.mfaEmailSetupCodeExpiresAt || user.mfaEmailSetupCodeExpiresAt <= new Date()) {
    return NextResponse.json({ error: 'Code expired' }, { status: 400 })
  }
  if (!isMfaCodeValid(String(code), user.mfaEmailSetupCodeHash)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  }

  user.mfaEmailEnabled = true
  user.mfaEmailVerified = true
  user.mfaEmailSetupCodeHash = null
  user.mfaEmailSetupCodeExpiresAt = null
  await user.save()

  return NextResponse.json({ success: true })
}

