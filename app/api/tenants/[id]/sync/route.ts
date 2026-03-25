import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import { clientForTenant } from '@/lib/unifi'
import { localTodayMidnight, backfillDoorLogs } from '@/lib/logCache'

type Params = { params: { id: string } }

export async function POST(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await connectDB()
  const tenant = await Tenant.findById(params.id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch live doors from UniFi controller
  let unifiDoors
  try {
    const client = clientForTenant(tenant)
    unifiDoors = await client.getDoors()
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to connect to UniFi controller: ${(err as Error).message}` },
      { status: 502 }
    )
  }

  const now = new Date()
  const unifiIds = new Set(unifiDoors.map((d) => d.id))

  // Upsert each door from UniFi
  for (const ud of unifiDoors) {
    await Door.findOneAndUpdate(
      { tenantId: params.id, unifiDoorId: ud.id },
      {
        name: ud.name,
        fullName: ud.full_name ?? ud.name,
        floorId: ud.floor_id ?? '',
        type: ud.type ?? '',
        isActive: true,
        lastSeen: now,
      },
      { upsert: true, new: true }
    )
  }

  // Mark doors that are no longer in UniFi as inactive
  await Door.updateMany(
    {
      tenantId: params.id,
      unifiDoorId: { $nin: Array.from(unifiIds) },
    },
    { isActive: false }
  )

  // Update last sync time on tenant
  await Tenant.findByIdAndUpdate(params.id, { lastDoorSync: now })

  const doors = await Door.find({ tenantId: params.id }).sort({ name: 1 }).lean()

  // Trigger background log cache backfill for any active door that is uncached or stale.
  // "Stale" means logsCachedThrough is before today's midnight in the tenant's timezone.
  const tz = tenant.timezone || 'UTC'
  const todayMidnight = localTodayMidnight(tz)
  const tenantRef = {
    _id: tenant._id,
    unifiHost: tenant.unifiHost,
    unifiApiKey: tenant.unifiApiKey,
    timezone: tz,
  }
  for (const d of doors) {
    if (!d.isActive) continue
    const cachedThrough = d.logsCachedThrough as Date | null
    if (cachedThrough && cachedThrough >= todayMidnight) continue // already current
    const sinceTs = cachedThrough ? Math.floor(cachedThrough.getTime() / 1000) : undefined
    backfillDoorLogs({ _id: d._id, unifiDoorId: d.unifiDoorId }, tenantRef, 'door_openings', sinceTs)
      .catch(console.error)
  }

  return NextResponse.json({ synced: unifiDoors.length, doors })
}
