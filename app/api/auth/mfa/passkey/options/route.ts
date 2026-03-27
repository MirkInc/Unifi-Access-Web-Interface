import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { connectDB } from '@/lib/mongodb'
import MfaLoginChallenge from '@/models/MfaLoginChallenge'
import User from '@/models/User'
import { getRequestRpId } from '@/lib/webauthn'

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
  if (!challenge.methods.includes('passkey')) return NextResponse.json({ error: 'Passkey is not available for this login' }, { status: 400 })

  const user = await User.findById(challenge.userId).select('mfaPasskeys').lean()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const rpID = getRequestRpId(req)
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: (user.mfaPasskeys ?? []).map((p) => ({
      id: p.id,
    })),
    userVerification: 'preferred',
  })

  challenge.passkeyChallenge = options.challenge
  await challenge.save()

  return NextResponse.json(options)
}
