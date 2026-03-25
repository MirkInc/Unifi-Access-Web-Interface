import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { AdminLogsClient } from './AdminLogsClient'

export default async function AdminLogsPage() {
  await connectDB()
  const tenants = await Tenant.find().sort({ name: 1 }).lean()
  return (
    <AdminLogsClient
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
    />
  )
}
