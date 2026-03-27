export const dynamic = 'force-dynamic'

import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import { DoorsClient } from './DoorsClient'

export default async function AdminDoorsPage() {
  await connectDB()

  const [doors, tenants] = await Promise.all([
    Door.find({ isActive: true })
      .sort({ name: 1 })
      .select('_id name fullName tenantId scheduleName firstPersonInRequired')
      .lean(),
    Tenant.find().sort({ name: 1 }).select('_id name').lean(),
  ])

  const tenantNameById = new Map(tenants.map((t) => [t._id.toString(), t.name]))

  const rows = doors.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    fullName: d.fullName,
    tenantId: d.tenantId.toString(),
    tenantName: tenantNameById.get(d.tenantId.toString()) ?? 'Unknown Site',
    scheduleName: d.scheduleName ?? null,
    firstPersonInRequired: d.firstPersonInRequired === true,
  }))

  const tenantList = tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))

  return <DoorsClient doors={rows} tenants={tenantList} />
}
