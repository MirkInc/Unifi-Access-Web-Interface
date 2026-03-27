export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { AppHeader } from '@/components/AppHeader'
import { DoorAnalyticsPanel } from '@/app/door/[doorId]/DoorAnalyticsPanel'

interface PageProps {
  params: Promise<{ tenantId: string; doorId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId, doorId } = await params
  if (!isValidObjectId(tenantId) || !isValidObjectId(doorId)) return { title: 'Door | Analytics' }
  await connectDB()
  const door = await Door.findOne({ _id: doorId, tenantId }).select('name tenantId').lean()
  if (!door) return { title: 'Door | Analytics' }

  const tenant = await Tenant.findById(door.tenantId).select('name').lean()
  if (!tenant) return { title: `${door.name} | Analytics` }
  return { title: `${door.name} | Analytics` }
}

export default async function TenantDoorAnalyticsPage({ params }: PageProps) {
  const { tenantId, doorId } = await params
  if (!isValidObjectId(tenantId) || !isValidObjectId(doorId)) notFound()
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const sessionUser = session.user as { id: string; role: string; name?: string }
  await connectDB()

  const door = await Door.findOne({ _id: doorId, tenantId }).select('name').lean()
  if (!door) notFound()

  let canViewAnalytics = false
  if (sessionUser.role === 'admin') {
    canViewAnalytics = true
  } else {
    const user = await User.findById(sessionUser.id).lean()
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === tenantId)
    const dp = access?.doorPermissions.find((p) => p.doorId.toString() === doorId)
    canViewAnalytics = dp?.canViewAnalytics === true
  }
  if (!canViewAnalytics) redirect(`/${tenantId}/${doorId}`)

  const tenant = await Tenant.findById(tenantId).lean()
  if (!tenant) notFound()

  let headerTenants: { _id: string; name: string }[] = []
  if (sessionUser.role === 'admin') {
    const all = await Tenant.find().sort({ name: 1 }).lean()
    headerTenants = all.map((t) => ({ _id: t._id.toString(), name: t.name }))
  } else {
    const user = await User.findById(sessionUser.id).lean()
    const ids = user?.tenantAccess.map((ta) => ta.tenantId) ?? []
    const accessible = await Tenant.find({ _id: { $in: ids } }).sort({ name: 1 }).lean()
    headerTenants = accessible.map((t) => ({ _id: t._id.toString(), name: t.name }))
  }

  const userName = sessionUser.name ?? ''

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        tenants={headerTenants}
        currentTenantId={tenantId}
        userName={userName}
        isAdmin={sessionUser.role === 'admin'}
      />

      <div className="bg-white border-b border-gray-100 sticky top-14 z-30">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href={`/${tenantId}/${doorId}`} className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-bold text-gray-900 text-base">{door.name} | Analytics</h1>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <DoorAnalyticsPanel doorId={doorId} />
      </main>
    </div>
  )
}
