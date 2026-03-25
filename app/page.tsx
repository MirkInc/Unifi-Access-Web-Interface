import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if ((session.user as { role?: string }).role === 'admin') redirect('/admin')
  redirect('/dashboard')
}
