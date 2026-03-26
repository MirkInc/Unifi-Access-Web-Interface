import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/mongodb'
import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import WebhookEvent from '@/models/WebhookEvent'
import { clientForTenant } from '@/lib/unifi'

type Params = { params: Promise<{ doorId: string }> }

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickStringList(value: unknown): string[] {
  return asArray(value).map((v) => {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      return String(obj.name ?? obj.id ?? JSON.stringify(obj))
    }
    return String(v)
  })
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function readerRefs(...values: unknown[]): string[] {
  return uniq(values.flatMap((v) => pickStringList(v)))
}

function pickDevices(detail: Record<string, unknown> | null, latestPayload: Record<string, unknown> | null) {
  const doorLevelReaders = readerRefs(
    detail?.connected_reader_ids,
    detail?.reader_ids,
    detail?.connected_readers,
    detail?.readers
  )

  const fromDetail = asArray(detail?.devices).map((d) => {
    const obj = (d ?? {}) as Record<string, unknown>
    const connectedReaders = readerRefs(
      obj.connected_reader_ids,
      obj.reader_ids,
      obj.connected_readers,
      obj.readers,
      doorLevelReaders
    )
    return {
      name: String(obj.name ?? 'Device'),
      id: String(obj.id ?? obj.device_id ?? ''),
      type: String(obj.device_type ?? obj.type ?? ''),
      ip: String(obj.ip ?? ''),
      mac: String(obj.mac ?? ''),
      connectedReaders,
    }
  })
  if (fromDetail.length > 0) return fromDetail.filter((d) => Boolean(d.id || d.name))

  const pData = (latestPayload?.data ?? {}) as Record<string, unknown>
  const location = (pData.location ?? {}) as Record<string, unknown>
  const device = (pData.device ?? {}) as Record<string, unknown>
  if (Object.keys(device).length === 0) return []
  const payloadReaders = readerRefs(
    location.device_ids,
    device.connected_reader_ids,
    device.reader_ids,
    device.readers
  )
  return [{
    name: String(device.name ?? 'Device'),
    id: String(device.id ?? ''),
    type: String(device.device_type ?? ''),
    ip: String(device.ip ?? ''),
    mac: String(device.mac ?? ''),
    connectedReaders: payloadReaders,
  }]
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { doorId } = await params
  await connectDB()

  const door = await Door.findById(doorId).lean()
  if (!door) return NextResponse.json({ error: 'Door not found' }, { status: 404 })

  const tenant = await Tenant.findById(door.tenantId).lean()
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const [detail, schedules, latestEvent] = await Promise.all([
    clientForTenant(tenant).getDoor(door.unifiDoorId),
    clientForTenant(tenant).getSchedules(),
    WebhookEvent.findOne({ tenantId: door.tenantId, unifiDoorId: door.unifiDoorId }).sort({ timestamp: -1 }).lean(),
  ])

  const latestPayload = (latestEvent?.payload ?? null) as Record<string, unknown> | null
  const detailObj = (detail ?? {}) as Record<string, unknown>

  const devices = pickDevices(detailObj, latestPayload)

  return NextResponse.json({
    door: {
      id: door._id.toString(),
      name: door.name,
      fullName: door.fullName,
      tenantId: tenant._id.toString(),
      tenantName: tenant.name,
      scheduleId: door.scheduleId ?? null,
      scheduleName: door.scheduleName ?? null,
      firstPersonInRequired: door.firstPersonInRequired === true,
    },
    schedules: schedules.map((s) => ({
      id: s.id,
      name: s.name,
      isDefault: s.is_default === true,
    })),
    devices,
  })
}

export async function PUT(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { doorId } = await params
  const body = await req.json()

  await connectDB()
  const door = await Door.findById(doorId)
  if (!door) return NextResponse.json({ error: 'Door not found' }, { status: 404 })

  if ('scheduleId' in body) door.scheduleId = body.scheduleId ?? null
  if ('scheduleName' in body) door.scheduleName = body.scheduleName ?? null
  if ('firstPersonInRequired' in body) door.firstPersonInRequired = body.firstPersonInRequired === true

  await door.save()

  return NextResponse.json({
    scheduleId: door.scheduleId,
    scheduleName: door.scheduleName,
    firstPersonInRequired: door.firstPersonInRequired,
  })
}
