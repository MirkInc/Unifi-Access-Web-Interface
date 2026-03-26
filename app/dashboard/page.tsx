import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Tenant from '@/models/Tenant'

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>
}

export default async function LegacyDashboardPage({ searchParams }: PageProps) {
  const { tenantId } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const sessionUser = session.user as { id: string; role: string }
  await connectDB()

  let accessibleTenantIds: string[] = []
  if (sessionUser.role === 'admin') {
    const all = await Tenant.find().select('_id').lean()
    accessibleTenantIds = all.map((t) => t._id.toString())
  } else {
    const user = await User.findById(sessionUser.id).lean()
    if (!user) redirect('/login')
    accessibleTenantIds = user.tenantAccess.map((ta) => ta.tenantId.toString())
  }

  if (accessibleTenantIds.length === 0) redirect('/')

  const cookieStore = await cookies()
  const cookieTenantId = cookieStore.get('selectedTenant')?.value
  const selected =
    (tenantId && accessibleTenantIds.includes(tenantId) ? tenantId : null) ??
    (cookieTenantId && accessibleTenantIds.includes(cookieTenantId) ? cookieTenantId : null) ??
    accessibleTenantIds[0]

  redirect(`/${selected}`)
}

