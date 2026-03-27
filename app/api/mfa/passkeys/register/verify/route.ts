import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { getRequestOrigin, getRequestRpId } from '@/lib/webauthn'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { credential, name } = await req.json()
  if (!credential) return NextResponse.json({ error: 'Credential is required' }, { status: 400 })

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.mfaPasskeyRegistrationChallenge || !user.mfaPasskeyRegistrationExpiresAt || user.mfaPasskeyRegistrationExpiresAt <= new Date()) {
    return NextResponse.json({ error: 'Passkey registration challenge expired' }, { status: 400 })
  }

  const verification = await verifyRegistrationResponse({
    response: credential as RegistrationResponseJSON,
    expectedChallenge: user.mfaPasskeyRegistrationChallenge,
    expectedOrigin: getRequestOrigin(req),
    expectedRPID: getRequestRpId(req),
    requireUserVerification: true,
  })

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Passkey registration failed' }, { status: 400 })
  }

  const { credential: regCredential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const id = regCredential.id
  const exists = (user.mfaPasskeys ?? []).some((p) => p.id === id)
  if (!exists) {
    user.mfaPasskeys.push({
      id,
      publicKey: Buffer.from(regCredential.publicKey).toString('base64url'),
      counter: regCredential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: regCredential.transports ?? [],
      name: String(name ?? '').trim() || 'Passkey',
      createdAt: new Date(),
    })
  }

  user.mfaPasskeyRegistrationChallenge = null
  user.mfaPasskeyRegistrationExpiresAt = null
  await user.save()

  return NextResponse.json({ success: true })
}
