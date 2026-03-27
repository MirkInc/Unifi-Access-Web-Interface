import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'

interface PageProps {
  params: Promise<{ doorId: string }>
}

export default async function LegacyDoorAnalyticsPage({ params }: PageProps) {
  const { doorId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  await connectDB()
  const door = await Door.findById(doorId).select('tenantId').lean()
  if (!door) notFound()

  redirect(`/${door.tenantId.toString()}/${doorId}/analytics`)
}

