import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { SitePreferencesClient } from '@/app/admin/preferences/SitePreferencesClient'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function SitePreferencesPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).select('name').lean()
  if (!tenant) notFound()

  const tenantList = [{ _id: tenant._id.toString(), name: tenant.name }]

  return <SitePreferencesClient tenants={tenantList} initialTenantId={tenant._id.toString()} />
}
