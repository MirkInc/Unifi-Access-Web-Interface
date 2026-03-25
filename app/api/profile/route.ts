import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id).lean()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    name: user.name,
    email: user.email,
    role: user.role,
  })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, email, currentPassword, newPassword } = await req.json()

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check if email is taken by someone else
  const emailLower = email.toLowerCase().trim()
  if (emailLower !== user.email) {
    const existing = await User.findOne({ email: emailLower })
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  // Handle password change
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password required to set a new password' }, { status: 400 })
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12)
  }

  user.name = name.trim()
  user.email = emailLower
  await user.save()

  return NextResponse.json({ name: user.name, email: user.email, role: user.role })
}
