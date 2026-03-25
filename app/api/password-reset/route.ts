import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import PasswordResetToken from '@/models/PasswordResetToken'
import User from '@/models/User'

// GET: validate a token
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  await connectDB()
  const record = await PasswordResetToken.findOne({ token, used: false })
  if (!record) return NextResponse.json({ valid: false })
  if (record.expiresAt < new Date()) return NextResponse.json({ valid: false })

  const user = await User.findById(record.userId).select('name email')
  return NextResponse.json({ valid: true, name: user?.name, email: user?.email })
}

// POST: set a new password using the token
export async function POST(req: Request) {
  const body = await req.json()
  const { token, password } = body

  if (!token || !password) {
    return NextResponse.json({ error: 'token and password required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  await connectDB()
  const record = await PasswordResetToken.findOne({ token, used: false })
  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 10)
  await User.findByIdAndUpdate(record.userId, { passwordHash: hash, isActive: true })
  await PasswordResetToken.findByIdAndUpdate(record._id, { used: true })

  return NextResponse.json({ success: true })
}
