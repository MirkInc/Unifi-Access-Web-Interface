import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import QRCode from 'qrcode'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { createTotpSecret, getTotpOtpauthUri } from '@/lib/mfa'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id).select('email mfaTotpSetupSecret')
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const secret = createTotpSecret()
  const otpauth = getTotpOtpauthUri(user.email, secret)
  const qrDataUrl = await QRCode.toDataURL(otpauth)

  user.mfaTotpSetupSecret = secret
  await user.save()

  return NextResponse.json({ secret, otpauth, qrDataUrl })
}

