import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import MfaLoginChallenge from '@/models/MfaLoginChallenge'
import User from '@/models/User'
import { generateNumericCode, hashMfaCode } from '@/lib/mfa'
import { sendMfaCodeEmail } from '@/lib/mail'

export async function POST(req: Request) {
  const { challengeToken } = await req.json()
  if (!challengeToken) return NextResponse.json({ error: 'Challenge token required' }, { status: 400 })

  await connectDB()
  const challenge = await MfaLoginChallenge.findOne({
    token: String(challengeToken),
    used: false,
    expiresAt: { $gt: new Date() },
  })
  if (!challenge) return NextResponse.json({ error: 'MFA challenge expired or invalid' }, { status: 400 })
  if (!challenge.methods.includes('email')) return NextResponse.json({ error: 'Email MFA is not available for this login' }, { status: 400 })

  const user = await User.findById(challenge.userId).select('name email').lean()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const code = generateNumericCode(6)
  challenge.emailCodeHash = hashMfaCode(code)
  challenge.emailCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await challenge.save()

  await sendMfaCodeEmail(user.email, user.name, code)
  return NextResponse.json({ success: true })
}

