import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  await connectDB()
  const user = await User.findById((session.user as { id: string }).id).lean()
  if (!user) redirect('/login')

  return (
    <ProfileClient
      initialName={user.name}
      initialEmail={user.email}
      role={user.role}
    />
  )
}
