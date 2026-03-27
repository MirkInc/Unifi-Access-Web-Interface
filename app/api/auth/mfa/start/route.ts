import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import MfaLoginChallenge from '@/models/MfaLoginChallenge'
import { generateToken } from '@/lib/utils'
import { getLoginMfaMethods, shouldRequireMfa } from '@/lib/mfa'

export async function POST(req: Request) {
  const { email, password } = await req.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  await connectDB()
  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  const valid = await bcrypt.compare(String(password), user.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  const requiredFrom = user.mfaRequiredFrom ? new Date(user.mfaRequiredFrom) : null
  const enforcementPending = Boolean(user.mfaEnforced) && !!requiredFrom && requiredFrom > new Date()

  if (!shouldRequireMfa(user)) {
    return NextResponse.json({
      requiresMfa: false,
      policyNotice: enforcementPending
        ? `An administrator has required MFA for your account starting ${requiredFrom?.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`
        : undefined,
      enforceAt: enforcementPending ? requiredFrom?.toISOString() : undefined,
    })
  }

  const methods = getLoginMfaMethods(user)
  if (methods.length === 0) {
    return NextResponse.json({ error: 'MFA is required but no login method is configured' }, { status: 403 })
  }

  const token = generateToken(48)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await MfaLoginChallenge.create({
    userId: user._id,
    token,
    expiresAt,
    used: false,
    methods,
    emailCodeHash: null,
    emailCodeExpiresAt: null,
  })

  return NextResponse.json({
    requiresMfa: true,
    challengeToken: token,
    methods,
    defaultMethod: methods[0],
    emailSent: methods.includes('email'),
  })
}
