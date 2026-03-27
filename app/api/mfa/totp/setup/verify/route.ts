import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { isValidSixDigitCode, verifyTotpCode } from '@/lib/mfa'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  if (!isValidSixDigitCode(String(code ?? ''))) {
    return NextResponse.json({ error: 'Enter a valid 6-digit code' }, { status: 400 })
  }

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id).select('mfaTotpSetupSecret mfaTotpEnabled mfaTotpSecret')
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.mfaTotpSetupSecret) return NextResponse.json({ error: 'No authenticator setup is in progress' }, { status: 400 })

  if (!(await verifyTotpCode(String(code), user.mfaTotpSetupSecret))) {
    return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 401 })
  }

  user.mfaTotpSecret = user.mfaTotpSetupSecret
  user.mfaTotpSetupSecret = null
  user.mfaTotpEnabled = true
  await user.save()

  return NextResponse.json({ success: true })
}
