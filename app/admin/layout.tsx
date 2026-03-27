import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { TenantSwitcher } from '@/components/TenantSwitcher'
import { MfaPolicyBanner } from '@/components/MfaPolicyBanner'
import { AdminNav } from './AdminNav'
import { AdminUserMenu } from './AdminUserMenu'

export const metadata: Metadata = {
  title: 'Admin',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if ((session.user as { role?: string }).role !== 'admin') redirect('/dashboard')

  await connectDB()
  const tenants = await Tenant.find().select('name').sort({ name: 1 }).lean()
  const tenantList = tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))
  const cookieStore = await cookies()
  const cookieTenantId = cookieStore.get('selectedTenant')?.value
  const currentTenantId =
    tenantList.find((t) => t._id === cookieTenantId)?._id ??
    tenantList[0]?._id ??
    ''

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <MfaPolicyBanner />
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#006FFF] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>

            <TenantSwitcher
              tenants={tenantList}
              currentTenantId={currentTenantId}
              showAdminLink
              labelOverride="Admin"
              activeItem="management-portal"
            />

            <AdminNav />
          </div>

          <AdminUserMenu userName={(session.user as { name?: string }).name ?? ''} />
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  )
}
