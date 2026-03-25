import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as XLSX from 'xlsx'
import { connectDB } from '@/lib/mongodb'
import Tenant from '@/models/Tenant'
import Door from '@/models/Door'
import User from '@/models/User'
import { clientForTenant } from '@/lib/unifi'
import { formatDateTime } from '@/lib/utils'
import type { UnifiLogEntry } from '@/types'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  const doorId = searchParams.get('doorId')
  const since = searchParams.get('since')
  const until = searchParams.get('until')

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  await connectDB()
  const sessionUser = session.user as { id: string; role: string }

  if (sessionUser.role !== 'admin') {
    const user = await User.findById(sessionUser.id)
    const access = user?.tenantAccess.find((ta) => ta.tenantId.toString() === tenantId)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenant = await Tenant.findById(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  try {
    const client = clientForTenant(tenant)

    // Resolve UniFi door ID if filtering by door
    let unifiDoorId: string | undefined
    if (doorId) {
      const door = await Door.findById(doorId)
      unifiDoorId = door?.unifiDoorId
    }

    const allLogs = await client.getLogs({
      topic: 'door_openings',
      since: since ? Number(since) : Math.floor(Date.now() / 1000) - 30 * 24 * 3600,
      until: until ? Number(until) : Math.floor(Date.now() / 1000),
      pageSize: 500,
    })

    const logs = unifiDoorId
      ? allLogs.filter((l) => l.event?.object_id === unifiDoorId)
      : allLogs

    function unlockMethod(log: UnifiLogEntry): string {
      const key = log.event?.log_key ?? ''
      const msg = log.event?.display_message ?? ''
      if (key.includes('remote') || msg.toLowerCase().includes('remote')) return 'Remote'
      if (key.includes('pin')) return 'PIN'
      if (key.includes('nfc') || key.includes('card')) return 'Card / NFC'
      if (key.includes('mobile')) return 'Mobile'
      if (key.includes('button') || key.includes('rex')) return 'Button / REX'
      if (key.includes('fingerprint') || key.includes('biometric')) return 'Biometric'
      return msg || 'Unknown'
    }

    const rows = logs.map((log) => ({
      Time: formatDateTime(log.event?.timestamp),
      User: (log.actor?.display_name && log.actor.display_name !== 'N/A') ? log.actor.display_name : 'System',
      Door: log.event?.object_name ?? '',
      Method: unlockMethod(log),
      Result: log.event?.display_message ?? log.event?.type ?? '',
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Access Logs')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="access-logs-${tenant.name}.xlsx"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Export error: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
