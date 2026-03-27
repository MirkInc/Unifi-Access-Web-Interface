import { notFound } from 'next/navigation'
import Link from 'next/link'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import { SiteAdminNav } from './SiteAdminNav'

interface Props {
  children: React.ReactNode
  params: Promise<{ tenantId: string }>
}

export default async function SiteAdminLayout({ children, params }: Props) {
  const { tenantId } = await params
  await connectDB()
  const tenant = await Tenant.findById(tenantId).select('name').lean()
  if (!tenant) notFound()

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/tenants" className="text-xs text-[#006FFF] hover:underline">
          Back to Sites
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{tenant.name}</h1>
      </div>
      <div className="mb-6">
        <SiteAdminNav tenantId={tenantId} />
      </div>
      {children}
    </div>
  )
}
