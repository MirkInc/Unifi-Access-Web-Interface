import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import PasswordResetToken from '@/models/PasswordResetToken'
import { generateToken } from '@/lib/utils'
import { resolvePortalUrl, sendEmailChangeNotification, sendEmailConfirmation, sendMfaPolicyEmail } from '@/lib/mail'
import { writeAudit } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const user = await User.findById(id).select('-passwordHash').lean()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sessionUser = session.user as { id?: string; name?: string; email?: string; role?: string }

  const body = await req.json()
  const { name, email, role, password, tenantAccess, preferredPortalUrl, mfaEnforced, mfaEnforceDelayDays } = body

  await connectDB()

  const user = await User.findById(id)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const beforeName = user.name
  const beforeEmail = user.email
  const beforeRole = user.role
  const beforeMfaEnforced = Boolean(user.mfaEnforced)
  const beforeMfaRequiredFrom = user.mfaRequiredFrom ? new Date(user.mfaRequiredFrom) : null
  const beforeAccess = JSON.stringify(user.tenantAccess ?? [])

  const update: Record<string, unknown> = {}
  if (name) update.name = name.trim()
  if (role) update.role = role
  if (tenantAccess !== undefined) update.tenantAccess = tenantAccess
  if (preferredPortalUrl !== undefined) update.preferredPortalUrl = preferredPortalUrl?.trim() || null
  if (mfaEnforced !== undefined) {
    const nextEnforced = Boolean(mfaEnforced)
    update.mfaEnforced = nextEnforced
    if (nextEnforced) {
      const delayRaw = Number(mfaEnforceDelayDays ?? 0)
      const delayDays = Number.isFinite(delayRaw) ? Math.max(0, Math.min(365, Math.floor(delayRaw))) : 0
      update.mfaRequiredFrom = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000)
    } else {
      update.mfaRequiredFrom = null
    }
  }
  if (password) update.passwordHash = await bcrypt.hash(password, 10)

  if (mfaEnforced !== undefined && Boolean(mfaEnforced) && !beforeMfaEnforced) {
    const delayRaw = Number(mfaEnforceDelayDays ?? 0)
    const delayDays = Number.isFinite(delayRaw) ? Math.max(0, Math.min(365, Math.floor(delayRaw))) : 0
    const requiredFrom = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000)
    Promise.resolve(sendMfaPolicyEmail(user.email, name?.trim() || user.name, requiredFrom)).catch(console.error)
  }

  // Email change — store as pending and send confirmation emails
  if (email && email.toLowerCase().trim() !== user.email) {
    const newEmail = email.toLowerCase().trim()
    const existing = await User.findOne({ email: newEmail })
    if (existing && existing._id.toString() !== id) {
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
    const preferredUrlForEmail = preferredPortalUrl?.trim() || user.preferredPortalUrl || null
    Promise.all([
      sendEmailChangeNotification(user.email, userName, newEmail),
      sendEmailConfirmation(newEmail, userName, token, resolvePortalUrl({ preferredPortalUrl: preferredUrlForEmail, request: req })),
    ]).catch(console.error)
  }

  const updated = await User.findByIdAndUpdate(id, update, { new: true }).select('-passwordHash')
  const changedName = typeof name === 'string' && name.trim() !== beforeName
  const changedEmail = typeof email === 'string' && email.toLowerCase().trim() !== beforeEmail
  const changedRole = typeof role === 'string' && role !== beforeRole
  const changedPassword = Boolean(password)
  const changedAccess = tenantAccess !== undefined && JSON.stringify(tenantAccess) !== beforeAccess
  const changedMfaEnforced = mfaEnforced !== undefined && Boolean(mfaEnforced) !== beforeMfaEnforced
  const changedFields = [
    changedName ? 'name' : null,
    changedEmail ? 'email' : null,
    changedRole ? 'role' : null,
    changedPassword ? 'password' : null,
    changedAccess ? 'door access' : null,
    changedMfaEnforced ? 'mfa policy' : null,
  ].filter(Boolean) as string[]

  await writeAudit({
    req,
    actorUserId: sessionUser.id,
    actorName: sessionUser.name ?? 'Admin',
    actorEmail: sessionUser.email,
    actorRole: sessionUser.role,
    action: 'user.update',
    entityType: 'user',
    entityId: id,
    outcome: 'success',
    message: changedFields.length > 0
      ? `Updated user ${updated?.email ?? id} (changed: ${changedFields.join(', ')})`
      : `Updated user ${updated?.email ?? id} (no field changes)`,
    metadata: {
      changedFields,
      changedName,
      changedEmail,
      changedRole,
      changedPassword,
      changedAccess,
      changedMfaEnforced,
      before: {
        name: beforeName,
        email: beforeEmail,
        role: beforeRole,
        mfaEnforced: beforeMfaEnforced,
        mfaRequiredFrom: beforeMfaRequiredFrom?.toISOString() ?? null,
      },
      after: {
        name: updated?.name ?? '',
        email: updated?.email ?? '',
        role: updated?.role ?? '',
        mfaEnforced: Boolean(updated?.mfaEnforced),
        mfaRequiredFrom: updated?.mfaRequiredFrom ? new Date(updated.mfaRequiredFrom).toISOString() : null,
      },
    },
  })
  revalidatePath('/admin/users')
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sessionUser = session.user as { id?: string; name?: string; email?: string; role?: string }

  await connectDB()
  const user = await User.findById(id).select('email').lean()
  await User.findByIdAndDelete(id)
  await writeAudit({
    req,
    actorUserId: sessionUser.id,
    actorName: sessionUser.name ?? 'Admin',
    actorEmail: sessionUser.email,
    actorRole: sessionUser.role,
    action: 'user.delete',
    entityType: 'user',
    entityId: id,
    outcome: 'success',
    message: `Deleted user ${user?.email ?? id}`,
    metadata: { email: user?.email ?? '' },
  })
  return NextResponse.json({ success: true })
}
