import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { MfaSetupClient } from './MfaSetupClient'

export default async function MfaSetupPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id).lean()
  if (!user) redirect('/login')

  return (
    <MfaSetupClient
      initialMfa={{
        mfaEnforced: user.mfaEnforced ?? false,
        emailEnabled: user.mfaEmailEnabled ?? false,
        emailVerified: user.mfaEmailVerified ?? false,
        totpEnabled: user.mfaTotpEnabled ?? false,
        passkeys: (user.mfaPasskeys ?? []).map((p: { id: string; name: string; createdAt: Date }) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
        })),
      }}
    />
  )
}
