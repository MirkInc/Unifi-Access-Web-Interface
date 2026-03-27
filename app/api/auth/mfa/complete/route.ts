import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import MfaLoginChallenge from '@/models/MfaLoginChallenge'
import MfaLoginToken from '@/models/MfaLoginToken'
import User from '@/models/User'
import { generateToken } from '@/lib/utils'
import { isMfaCodeValid, isValidSixDigitCode, verifyTotpCode } from '@/lib/mfa'

const MAX_MFA_ATTEMPTS = 5

export async function POST(req: Request) {
  const { challengeToken, method, code } = await req.json()
  if (!challengeToken || !method) {
    return NextResponse.json({ error: 'Challenge and method are required' }, { status: 400 })
  }

  await connectDB()
  const challenge = await MfaLoginChallenge.findOne({
    token: String(challengeToken),
    used: false,
    expiresAt: { $gt: new Date() },
  })
  if (!challenge) return NextResponse.json({ error: 'MFA challenge expired or invalid' }, { status: 400 })
  if (!challenge.methods.includes(method)) {
    return NextResponse.json({ error: 'MFA method not allowed for this login' }, { status: 400 })
  }

  if ((challenge.attempts ?? 0) >= MAX_MFA_ATTEMPTS) {
    challenge.used = true
    await challenge.save()
    return NextResponse.json({ error: 'Too many invalid attempts. Start sign-in again.' }, { status: 429 })
  }

  const user = await User.findById(challenge.userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const failAttempt = async (error: string) => {
    const nextAttempts = (challenge.attempts ?? 0) + 1
    challenge.attempts = nextAttempts
    if (nextAttempts >= MAX_MFA_ATTEMPTS) {
      challenge.used = true
      await challenge.save()
      return NextResponse.json({ error: 'Too many invalid attempts. Start sign-in again.' }, { status: 429 })
    }
    await challenge.save()
    return NextResponse.json({ error }, { status: 401 })
  }

  if (method === 'email') {
    if (!isValidSixDigitCode(String(code ?? ''))) {
      return NextResponse.json({ error: 'Enter a valid 6-digit code' }, { status: 400 })
    }
    if (!challenge.emailCodeExpiresAt || challenge.emailCodeExpiresAt <= new Date()) {
      return NextResponse.json({ error: 'Email code expired' }, { status: 400 })
    }
    if (!isMfaCodeValid(String(code), challenge.emailCodeHash)) {
      return await failAttempt('Invalid code')
    }
  } else if (method === 'totp') {
    if (!user.mfaTotpEnabled || !user.mfaTotpSecret) {
      return NextResponse.json({ error: 'Authenticator app is not configured' }, { status: 400 })
    }
    if (!isValidSixDigitCode(String(code ?? '')) || !(await verifyTotpCode(String(code), user.mfaTotpSecret))) {
      return await failAttempt('Invalid authenticator code')
    }
  } else {
    return NextResponse.json({ error: 'Use passkey verification endpoint for passkeys' }, { status: 400 })
  }

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
