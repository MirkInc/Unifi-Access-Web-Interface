import { cookies } from 'next/headers'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { SitePreferencesClient } from './SitePreferencesClient'

export default async function AdminPreferencesPage() {
  await connectDB()
  const tenants = await Tenant.find().select('name').sort({ name: 1 }).lean()
  const tenantList = tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))

  const cookieStore = await cookies()
  const cookieTenantId = cookieStore.get('selectedTenant')?.value
  const initialTenantId =
    tenantList.find((t) => t._id === cookieTenantId)?._id ??
    tenantList[0]?._id ??
    ''

  return <SitePreferencesClient tenants={tenantList} initialTenantId={initialTenantId} />
}

