import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Door from '@/models/Door'
import { AdminAuditClient } from './AdminAuditClient'

export default async function AdminAuditPage() {
  await connectDB()
  const [tenants, users, doors] = await Promise.all([
    Tenant.find().sort({ name: 1 }).lean(),
    User.find().select('name email').sort({ name: 1 }).lean(),
    Door.find().select('name tenantId').lean(),
  ])

  return (
    <AdminAuditClient
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
      users={users.map((u) => ({ _id: u._id.toString(), name: u.name, email: u.email }))}
      doors={doors.map((d) => ({ _id: d._id.toString(), name: d.name, tenantId: d.tenantId.toString() }))}
    />
  )
}
