export const dynamic = 'force-dynamic'

import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { SchedulesClient } from './SchedulesClient'

export default async function SchedulesPage() {
  await connectDB()

  const tenants = await Tenant.find().sort({ name: 1 }).select('name timezone').lean()

  const allDoors = await Door.find({ isActive: true })
    .sort({ name: 1 })
    .select('_id name fullName tenantId scheduleId scheduleName')
    .lean()

  const tenantList = tenants.map((t) => ({ _id: t._id.toString(), name: t.name, timezone: (t as any).timezone as string | undefined }))

  const doorList = allDoors.map((d) => ({
    _id: d._id.toString(),
    name: d.name,
    fullName: d.fullName,
    tenantId: d.tenantId.toString(),
    scheduleId: d.scheduleId ?? null,
    scheduleName: d.scheduleName ?? null,
  }))

  return <SchedulesClient tenants={tenantList} doors={doorList} />
}
