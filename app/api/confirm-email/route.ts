import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import PasswordResetToken from '@/models/PasswordResetToken'
import User from '@/models/User'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  await connectDB()
  const record = await PasswordResetToken.findOne({ token, used: false, type: 'email_confirm' })
  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json({ valid: false })
  }

  const user = await User.findById(record.userId)
  if (!user || !user.pendingEmail) {
    return NextResponse.json({ valid: false })
  }

  // Commit the email change
  user.email = user.pendingEmail
  user.pendingEmail = null
  await user.save()
  await PasswordResetToken.findByIdAndUpdate(record._id, { used: true })

  return NextResponse.json({ valid: true, name: user.name })
}
