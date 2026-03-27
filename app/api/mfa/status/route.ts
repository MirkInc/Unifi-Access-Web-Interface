import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id)
    .select('mfaEnforced mfaEmailEnabled mfaEmailVerified mfaTotpEnabled mfaPasskeys')
    .lean()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    mfaEnforced: user.mfaEnforced ?? false,
    mfaRequiredFrom: user.mfaRequiredFrom ?? null,
    emailEnabled: user.mfaEmailEnabled ?? false,
    emailVerified: user.mfaEmailVerified ?? false,
    totpEnabled: user.mfaTotpEnabled ?? false,
    passkeys: (user.mfaPasskeys ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      deviceType: p.deviceType,
      backedUp: p.backedUp,
    })),
  })
}
