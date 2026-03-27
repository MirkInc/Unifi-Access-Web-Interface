export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import { DoorsClient } from '@/app/admin/doors/DoorsClient'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function SiteDoorsPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).select('_id name').lean()
  if (!tenant) notFound()

  const doors = await Door.find({ tenantId, isActive: true })
    .sort({ name: 1 })
    .select('_id name fullName tenantId scheduleName firstPersonInRequired')
    .lean()

  const tenantList = [{ _id: tenant._id.toString(), name: tenant.name }]

  const rows = doors.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    fullName: d.fullName,
    tenantId: d.tenantId.toString(),
    tenantName: tenant.name,
    scheduleName: d.scheduleName ?? null,
    firstPersonInRequired: d.firstPersonInRequired === true,
  }))

  return <DoorsClient doors={rows} tenants={tenantList} />
}
