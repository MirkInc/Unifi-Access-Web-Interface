import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { AdminAnalyticsClient } from './AdminAnalyticsClient'

export default async function AdminAnalyticsPage() {
  await connectDB()
  const [tenants, doors] = await Promise.all([
    Tenant.find().sort({ name: 1 }).lean(),
    Door.find({ isActive: true }).select('name tenantId').sort({ name: 1 }).lean(),
  ])

  return (
    <AdminAnalyticsClient
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
      doors={doors.map((d) => ({ _id: d._id.toString(), name: d.name, tenantId: d.tenantId.toString() }))}
    />
  )
}

