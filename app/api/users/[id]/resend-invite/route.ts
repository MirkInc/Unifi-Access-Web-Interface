import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import PasswordResetToken from '@/models/PasswordResetToken'
import { resolvePortalUrl, sendInvitationReminderEmail } from '@/lib/mail'
import { generateToken } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const user = await User.findById(id).select('name email isActive preferredPortalUrl').lean()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.isActive) return NextResponse.json({ error: 'User is already active' }, { status: 400 })

  await PasswordResetToken.deleteMany({ userId: user._id, type: 'invite' })
  const token = generateToken(48)
  await PasswordResetToken.create({
    userId: user._id,
    token,
    type: 'invite',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  try {
    await sendInvitationReminderEmail(
      user.email,
      user.name,
      token,
      resolvePortalUrl({ preferredPortalUrl: user.preferredPortalUrl, request: req })
    )
  } catch (err) {
    console.error('Failed to resend invitation email:', err)
    return NextResponse.json({ error: 'Failed to send invitation email' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
