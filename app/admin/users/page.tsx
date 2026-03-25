export const dynamic = 'force-dynamic'

import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  await connectDB()
  const [users, tenants] = await Promise.all([
    User.find().select('-passwordHash').sort({ name: 1 }).lean(),
    Tenant.find().sort({ name: 1 }).lean(),
  ])

  return (
    <UsersClient
      users={users.map((u) => ({
        _id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive ?? true,
        pendingEmail: u.pendingEmail ?? null,
        tenantCount: u.tenantAccess.length,
      }))}
      tenants={tenants.map((t) => ({ _id: t._id.toString(), name: t.name }))}
    />
  )
}
