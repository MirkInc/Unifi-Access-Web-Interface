import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { clientForTenant } from '@/lib/unifi'
import LogCache from '@/models/LogCache'
import { localDateKey, localTodayMidnight, localPastDaysInRange, backfillDoorLogs } from '@/lib/logCache'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const doorId = searchParams.get('doorId')     // our MongoDB door ID
  const since = searchParams.get('since')       // unix timestamp
  const until = searchParams.get('until')       // unix timestamp
  const pageSize = Number(searchParams.get('pageSize') ?? '50')
  const topic = searchParams.get('topic') ?? 'door_openings'

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  await connectDB()

  const sessionUser = session.user as { id: string; role: string }

  // Verify access
  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const access = user.tenantAccess.find(
      (ta) => ta.tenantId.toString() === tenantId
    )
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (doorId) {
      const doorPerm = access.doorPermissions.find(
        (dp) => dp.doorId.toString() === doorId
      )
      if (!doorPerm?.canViewLogs) {
        return NextResponse.json({ error: 'No log permission for this door' }, { status: 403 })
      }
    }
  }

  const tenant = await Tenant.findById(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const tz = tenant.timezone || 'UTC'
  const todayMidnight = localTodayMidnight(tz)
  const todayMidnightTs = Math.floor(todayMidnight.getTime() / 1000)

  // Resolve the door document (needed for logsCachedThrough and unifiDoorId)
  let door: Awaited<ReturnType<typeof Door.findById>> = null
  let unifiActorId: string | undefined
  if (doorId) {
    door = await Door.findById(doorId)
    if (!door) return NextResponse.json({ error: 'Door not found' }, { status: 404 })
    unifiActorId = door.unifiDoorId
  }

  const isThisDoor = (l: { event?: { object_id?: string }; actor?: { id?: string } }) =>
    l.event?.object_id === unifiActorId || l.actor?.id === unifiActorId

  // --- Cache logic (door-specific requests with a time range only) ---
  if (unifiActorId && door && since && until) {
    const sinceNum = Number(since)
    const untilNum = Number(until)
    const pastDays = localPastDaysInRange(sinceNum, untilNum, tz, todayMidnight)

    // ✅ FAST PATH: cache is fully up-to-date — only hit UniFi for today
    if (door.logsCachedThrough && door.logsCachedThrough >= todayMidnight) {
      const client = clientForTenant(tenant)
      const todayLogs = await client.getLogs({ topic, since: todayMidnightTs, until: untilNum, pageSize })
      const todayFiltered = todayLogs.filter(isThisDoor)

      const cached = await LogCache.find({
        tenantId,
        unifiDoorId: unifiActorId,
        date: { $in: pastDays },
        topic,
      }).lean()
      const pastEvents = cached.flatMap((c: any) => c.events as any[])

      return NextResponse.json(
        [...todayFiltered, ...pastEvents]
          .sort((a, b) => (b.event?.timestamp ?? 0) - (a.event?.timestamp ?? 0))
          .slice(0, pageSize)
      )
    }

    // 🔄 STALE or NULL: backfill missing complete past days before serving, so
    // first load after midnight can immediately use DB for prior days.
    const doorRef = { _id: door._id, unifiDoorId: unifiActorId }
    const tenantRef = { _id: tenant._id, unifiHost: tenant.unifiHost, unifiApiKey: tenant.unifiApiKey, timezone: tz }
    if (door.logsCachedThrough && door.logsCachedThrough < todayMidnight) {
      // Stale — fetch the full gap since last cache through end of yesterday.
      const gapSince = Math.floor(door.logsCachedThrough.getTime() / 1000)
      try {
        await backfillDoorLogs(doorRef, tenantRef, topic, gapSince)
      } catch (err) {
        console.error('[/api/logs] backfill error (stale):', (err as Error).message)
      }
    } else if (!door.logsCachedThrough) {
      // Never cached — fetch all available history through end of yesterday.
      try {
        await backfillDoorLogs(doorRef, tenantRef, topic)
      } catch (err) {
        console.error('[/api/logs] backfill error (uncached):', (err as Error).message)
      }
    }

    // Check if the requested range is already covered by existing per-day cache entries
    // (could be from a previous wider fetch or from the sync backfill still in progress)
    if (pastDays.length > 0) {
      const cached = await LogCache.find({
        tenantId,
        unifiDoorId: unifiActorId,
        date: { $in: pastDays },
        topic,
      }).lean()
      const cachedDates = new Set(cached.map((c: any) => c.date as string))

      if (pastDays.every(d => cachedDates.has(d))) {
        // Requested range is already in cache — serve it with today-only UniFi fetch
        const client = clientForTenant(tenant)
        const todayLogs = await client.getLogs({ topic, since: todayMidnightTs, until: untilNum, pageSize })
        const todayFiltered = todayLogs.filter(isThisDoor)
        const pastEvents = cached.flatMap((c: any) => c.events as any[])
        return NextResponse.json(
          [...todayFiltered, ...pastEvents]
            .sort((a, b) => (b.event?.timestamp ?? 0) - (a.event?.timestamp ?? 0))
            .slice(0, pageSize)
        )
      }
    }
  }
  // --- End cache logic ---

  try {
    const client = clientForTenant(tenant)
    const logs = await client.getLogs({
      topic,
      since: since ? Number(since) : undefined,
      until: until ? Number(until) : undefined,
      pageSize,
    })

    const filtered = unifiActorId ? logs.filter(isThisDoor) : logs

    // Write past days to cache (non-blocking), keyed by local date in tenant timezone
    if (unifiActorId) {
      const byDay: Record<string, any[]> = {}
      for (const log of filtered) {
        const ts = log.event?.timestamp
        if (!ts) continue
        if (new Date(ts * 1000) < todayMidnight) {
          const ds = localDateKey(ts, tz)
          byDay[ds] = byDay[ds] ?? []
          byDay[ds].push(log)
        }
      }
      if (Object.keys(byDay).length > 0) {
        Promise.all(
          Object.entries(byDay).map(([date, events]) =>
            LogCache.findOneAndUpdate(
              { tenantId, unifiDoorId: unifiActorId, date, topic },
              { $set: { events, cachedAt: new Date() } },
              { upsert: true }
            )
          )
        ).catch(console.error)
      }
    }

    return NextResponse.json(filtered)
  } catch (err) {
    console.error('[/api/logs] UniFi error:', (err as Error).message)
    return NextResponse.json(
      { error: `Controller error: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
