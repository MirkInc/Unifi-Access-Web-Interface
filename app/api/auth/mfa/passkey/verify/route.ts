import { NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { connectDB } from '@/lib/mongodb'
import MfaLoginChallenge from '@/models/MfaLoginChallenge'
import MfaLoginToken from '@/models/MfaLoginToken'
import User from '@/models/User'
import { generateToken } from '@/lib/utils'
import { getRequestOrigin, getRequestRpId } from '@/lib/webauthn'

const MAX_MFA_ATTEMPTS = 5

export async function POST(req: Request) {
  const { challengeToken, credential } = await req.json()
  if (!challengeToken || !credential) return NextResponse.json({ error: 'Challenge token and credential are required' }, { status: 400 })

  await connectDB()
  const challenge = await MfaLoginChallenge.findOne({
    token: String(challengeToken),
    used: false,
    expiresAt: { $gt: new Date() },
  })
  if (!challenge) return NextResponse.json({ error: 'MFA challenge expired or invalid' }, { status: 400 })
  if (!challenge.methods.includes('passkey')) return NextResponse.json({ error: 'Passkey is not available for this login' }, { status: 400 })
  if (!challenge.passkeyChallenge) return NextResponse.json({ error: 'Passkey challenge missing' }, { status: 400 })

  if ((challenge.attempts ?? 0) >= MAX_MFA_ATTEMPTS) {
    challenge.used = true
    await challenge.save()
    return NextResponse.json({ error: 'Too many invalid attempts. Start sign-in again.' }, { status: 429 })
  }

  const user = await User.findById(challenge.userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const credentialId = String(credential.id ?? '')
  const stored = (user.mfaPasskeys ?? []).find((p) => p.id === credentialId)
  if (!stored) return NextResponse.json({ error: 'Passkey not recognized' }, { status: 400 })

  const verification = await verifyAuthenticationResponse({
    response: credential as AuthenticationResponseJSON,
    expectedChallenge: challenge.passkeyChallenge,
    expectedOrigin: getRequestOrigin(req),
    expectedRPID: getRequestRpId(req),
    credential: {
      id: stored.id,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter,
    },
  })

  if (!verification.verified) {
    challenge.attempts = (challenge.attempts ?? 0) + 1
    if (challenge.attempts >= MAX_MFA_ATTEMPTS) {
      challenge.used = true
      await challenge.save()
      return NextResponse.json({ error: 'Too many invalid attempts. Start sign-in again.' }, { status: 429 })
    }
    await challenge.save()
    return NextResponse.json({ error: 'Passkey verification failed' }, { status: 401 })
  }

  stored.counter = verification.authenticationInfo.newCounter
  await user.save()

  challenge.used = true
  await challenge.save()

  const loginToken = generateToken(48)
  await MfaLoginToken.create({
    userId: user._id,
    token: loginToken,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })

  return NextResponse.json({ loginToken })
}
