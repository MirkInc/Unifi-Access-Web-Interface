import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { AdminHealthClient } from './AdminHealthClient'

export default async function AdminHealthPage() {
  await connectDB()
  const tenants = await Tenant.find().select('name').sort({ name: 1 }).lean()

  return (
    <AdminHealthClient
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
    />
  )
}

