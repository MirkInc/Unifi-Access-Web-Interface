import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import PasswordResetToken from '@/models/PasswordResetToken'
import { generateToken } from '@/lib/utils'
import { sendEmailChangeNotification, sendEmailConfirmation } from '@/lib/mail'

type Params = { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const user = await User.findById(params.id).select('-passwordHash').lean()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PUT(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, role, password, tenantAccess } = body

  await connectDB()

  const user = await User.findById(params.id)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (name) update.name = name.trim()
  if (role) update.role = role
  if (tenantAccess !== undefined) update.tenantAccess = tenantAccess
  if (password) update.passwordHash = await bcrypt.hash(password, 10)

  // Email change — store as pending and send confirmation emails
  if (email && email.toLowerCase().trim() !== user.email) {
    const newEmail = email.toLowerCase().trim()
    const existing = await User.findOne({ email: newEmail })
    if (existing && existing._id.toString() !== params.id) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    update.pendingEmail = newEmail

    // Create email confirmation token
    const token = generateToken(48)
    await PasswordResetToken.create({
      userId: user._id,
      token,
      type: 'email_confirm',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    // Send notifications (fire and forget — don't fail the update if email fails)
    const userName = (name?.trim()) || user.name
    Promise.all([
      sendEmailChangeNotification(user.email, userName, newEmail),
      sendEmailConfirmation(newEmail, userName, token),
    ]).catch(console.error)
  }

  const updated = await User.findByIdAndUpdate(params.id, update, { new: true }).select('-passwordHash')
  revalidatePath('/admin/users')
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  await User.findByIdAndDelete(params.id)
  return NextResponse.json({ success: true })
}
