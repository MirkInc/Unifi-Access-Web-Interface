import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import PasswordResetToken from '@/models/PasswordResetToken'
import { sendPasswordResetEmail } from '@/lib/mail'
import { generateToken } from '@/lib/utils'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const users = await User.find()
    .select('-passwordHash')
    .sort({ name: 1 })
    .lean()
  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { email, name, role = 'user', password, sendInvite = false } = body

  if (!email || !name) {
    return NextResponse.json({ error: 'email and name are required' }, { status: 400 })
  }

  if (!sendInvite && !password) {
    return NextResponse.json(
      { error: 'Either provide a password or enable sendInvite' },
      { status: 400 }
    )
  }

  await connectDB()

  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  // If sending invite, set a random unusable password until they reset it
  const passwordHash = sendInvite
    ? await bcrypt.hash(generateToken(24), 10)
    : await bcrypt.hash(password, 10)

  const user = await User.create({ email, name, role, passwordHash, isActive: sendInvite ? false : true })

  if (sendInvite) {
    const token = generateToken(48)
    await PasswordResetToken.create({
      userId: user._id,
      token,
      type: 'invite',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    })
    await sendPasswordResetEmail(email, name, token)
  }

  const { passwordHash: _ph, ...userObj } = user.toObject()
  return NextResponse.json(userObj, { status: 201 })
}
