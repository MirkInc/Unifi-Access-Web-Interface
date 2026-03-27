import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { AdminAnalyticsClient } from '@/app/admin/analytics/AdminAnalyticsClient'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function SiteAnalyticsPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).select('name').lean()
  if (!tenant) notFound()

  const doors = await Door.find({ tenantId, isActive: true })
    .select('name tenantId')
    .sort({ name: 1 })
    .lean()

  return (
    <AdminAnalyticsClient
      tenants={[{ _id: tenant._id.toString(), name: tenant.name }]}
      doors={doors.map((d) => ({ _id: d._id.toString(), name: d.name, tenantId: d.tenantId.toString() }))}
    />
  )
}
