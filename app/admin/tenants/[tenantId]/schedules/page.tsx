export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { SchedulesClient } from '@/app/admin/schedules/SchedulesClient'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function SiteSchedulesPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).select('name timezone').lean()
  if (!tenant) notFound()

  const doors = await Door.find({ tenantId, isActive: true })
    .sort({ name: 1 })
    .select('_id name fullName tenantId scheduleId scheduleName')
    .lean()

  const tenantList = [{ _id: tenant._id.toString(), name: tenant.name, timezone: (tenant as any).timezone as string | undefined }]

  const doorList = doors.map((d) => ({
    _id: d._id.toString(),
    name: d.name,
    fullName: d.fullName,
    tenantId: d.tenantId.toString(),
    scheduleId: d.scheduleId ?? null,
    scheduleName: d.scheduleName ?? null,
  }))

  return <SchedulesClient tenants={tenantList} doors={doorList} />
}
