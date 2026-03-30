import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { TenantsClient } from './TenantsClient'

export default async function TenantsPage() {
  await connectDB()
  const tenants = await Tenant.find().sort({ name: 1 }).lean()

  // Get door counts per tenant
  const doorCounts = await Door.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
  ])
  const doorCountMap: Record<string, number> = {}
  for (const d of doorCounts) doorCountMap[d._id.toString()] = d.count

  const data = tenants.map((t) => {
    const key = t.unifiApiKey ?? ''
    const maskedApiKey = key.length > 4
      ? '•'.repeat(Math.min(key.length - 4, 12)) + key.slice(-4)
      : '•'.repeat(key.length)
    return {
      _id: t._id.toString(),
      name: t.name,
      description: t.description,
      unifiHost: t.unifiHost,
      timezone: t.timezone ?? '',
      maskedApiKey,
      lastDoorSync: t.lastDoorSync ? t.lastDoorSync.toISOString() : null,
      doorCount: doorCountMap[t._id.toString()] ?? 0,
      webhookId: t.webhookId ?? null,
      webhookBaseUrl: t.webhookBaseUrl ?? null,
      branding: {
        portalName: t.branding?.portalName ?? '',
        logoUrl: t.branding?.logoUrl ?? '',
        accentColor: t.branding?.accentColor ?? '',
        loginHosts: t.branding?.loginHosts ?? [],
      },
    }
  })

  return <TenantsClient tenants={data} />
}
