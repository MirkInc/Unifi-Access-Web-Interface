import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import PasswordResetToken from '@/models/PasswordResetToken'
import { resolvePortalUrl, sendForgotPasswordEmail } from '@/lib/mail'

export async function POST(req: Request) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  await connectDB()

  const user = await User.findOne({ email: email.toLowerCase().trim() })

  // Always return success to avoid user enumeration
  if (!user) return NextResponse.json({ ok: true })

  // Invalidate any existing reset tokens for this user
  await PasswordResetToken.deleteMany({ userId: user._id, type: 'reset' })

  const token = crypto.randomBytes(32).toString('hex')
  await PasswordResetToken.create({
    userId: user._id,
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    type: 'reset',
  })

  try {
    await sendForgotPasswordEmail(
      user.email,
      user.name,
      token,
      resolvePortalUrl({ preferredPortalUrl: user.preferredPortalUrl, request: req })
    )
  } catch (err) {
    console.error('Failed to send forgot password email:', err)
  }

  return NextResponse.json({ ok: true })
}
