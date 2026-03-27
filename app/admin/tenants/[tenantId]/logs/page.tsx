import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { AdminLogsClient } from '@/app/admin/logs/AdminLogsClient'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function SiteLogsPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).select('name').lean()
  if (!tenant) notFound()

  return (
    <AdminLogsClient
      tenants={[{ _id: tenant._id.toString(), name: tenant.name }]}
    />
  )
}
