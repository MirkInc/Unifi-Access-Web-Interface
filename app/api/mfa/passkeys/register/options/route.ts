import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { getRequestRpId } from '@/lib/webauthn'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const rpID = getRequestRpId(req)
  const options = await generateRegistrationOptions({
    rpName: 'Access Portal',
    rpID,
    userID: Buffer.from(user._id.toString()),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: (user.mfaPasskeys ?? []).map((p) => ({
      id: p.id,
    })),
  })

  user.mfaPasskeyRegistrationChallenge = options.challenge
  user.mfaPasskeyRegistrationExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await user.save()

  return NextResponse.json(options)
}
