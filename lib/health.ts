import Door from '@/models/Door'
import Tenant from '@/models/Tenant'
import WebhookDeliveryMetric from '@/models/WebhookDeliveryMetric'
import WebhookEvent from '@/models/WebhookEvent'
import { clientForTenant } from '@/lib/unifi'
import { localTodayMidnight } from '@/lib/logCache'

export type HealthSeverity = 'good' | 'warn' | 'critical'

export interface ControllerHealthSnapshot {
  severity: HealthSeverity
  reachable: boolean
  checkedAt: string
  message: string
}

export interface WebhookHealthSnapshot {
  severity: HealthSeverity
  configured: boolean
  successCount: number
  failureCount: number
  signatureFailCount: number
  parseFailCount: number
  successRatio: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastSuccessAgeSeconds: number | null
}

export interface BackfillDoorLagRow {
  doorId: string
  doorName: string
  logsCachedThrough: string | null
  lagSeconds: number | null
  stale: boolean
}

export interface BackfillHealthSnapshot {
  severity: HealthSeverity
  lastDoorSyncAt: string | null
  syncAgeSeconds: number | null
  staleDoorCount: number
  activeDoorCount: number
  stalePercent: number
  doors: BackfillDoorLagRow[]
}

export interface TenantHealthRow {
  tenantId: string
  tenantName: string
  timezone: string
  overallSeverity: HealthSeverity
  controller: ControllerHealthSnapshot
  webhook: WebhookHealthSnapshot
  backfill: BackfillHealthSnapshot
}

export interface HealthOverviewResponse {
  generatedAt: string
  summary: { good: number; warn: number; critical: number; total: number }
  rows: TenantHealthRow[]
}

// Webhook activity can be sparse for some sites (overnights/weekends), so
// use longer recency thresholds to avoid noisy warning states.
const WEBHOOK_WARN_SECONDS = 6 * 60 * 60
const WEBHOOK_CRITICAL_SECONDS = 24 * 60 * 60
const SYNC_WARN_SECONDS = 24 * 3600
const SYNC_CRITICAL_SECONDS = 72 * 3600

function maxSeverity(a: HealthSeverity, b: HealthSeverity): HealthSeverity {
  const rank: Record<HealthSeverity, number> = { good: 0, warn: 1, critical: 2 }
  return rank[a] >= rank[b] ? a : b
}

function asIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function ageSeconds(d: Date | null | undefined, nowMs: number): number | null {
  if (!d) return null
  return Math.max(0, Math.floor((nowMs - d.getTime()) / 1000))
}

async function buildTenantHealthRow(
  tenant: {
    _id: unknown
    name: string
    timezone?: string
    unifiHost: string
    unifiApiKey: string
    webhookId?: string | null
    webhookConfigs?: Array<{ id?: string }>
    lastDoorSync?: Date | null
  },
  now: Date,
  includeDoors: boolean,
  windowHours: number
): Promise<TenantHealthRow> {
  const tenantId = String(tenant._id)
  const tz = tenant.timezone || 'UTC'
  const nowMs = now.getTime()

  let controller: ControllerHealthSnapshot
  try {
    const client = clientForTenant({ unifiHost: tenant.unifiHost, unifiApiKey: tenant.unifiApiKey })
    const reachable = await client.testConnection()
    controller = {
      severity: reachable ? 'good' : 'critical',
      reachable,
      checkedAt: now.toISOString(),
      message: reachable ? 'Controller reachable' : 'Controller unreachable',
    }
  } catch (err) {
    controller = {
      severity: 'critical',
      reachable: false,
      checkedAt: now.toISOString(),
      message: (err as Error).message || 'Controller check failed',
    }
  }

  const windowStart = new Date(nowMs - windowHours * 3600 * 1000)
  const metricRows = await WebhookDeliveryMetric.find({
    tenantId,
    granularity: 'hour',
    windowStart: { $gte: windowStart },
  })
    .select('receivedSuccessCount signatureFailCount parseFailCount lastSuccessAt lastFailureAt')
    .lean()

  let successCount = 0
  let signatureFailCount = 0
  let parseFailCount = 0
  let lastSuccessAt: Date | null = null
  let lastFailureAt: Date | null = null
  for (const r of metricRows) {
    successCount += Number(r.receivedSuccessCount ?? 0)
    signatureFailCount += Number(r.signatureFailCount ?? 0)
    parseFailCount += Number(r.parseFailCount ?? 0)
    if (r.lastSuccessAt && (!lastSuccessAt || r.lastSuccessAt > lastSuccessAt)) lastSuccessAt = r.lastSuccessAt
    if (r.lastFailureAt && (!lastFailureAt || r.lastFailureAt > lastFailureAt)) lastFailureAt = r.lastFailureAt
  }

  // Canonical success signal comes from persisted webhook events in the same window.
  // This keeps health accurate even if delivery counters were not available historically.
  const [eventSuccessCount, lastSuccessEvent] = await Promise.all([
    WebhookEvent.countDocuments({
      tenantId,
      timestamp: { $gte: windowStart },
      event: /^access\./,
    }),
    WebhookEvent.findOne({
      tenantId,
      timestamp: { $gte: windowStart },
      event: /^access\./,
    })
      .select('timestamp')
      .sort({ timestamp: -1 })
      .lean(),
  ])

  successCount = eventSuccessCount
  if (lastSuccessEvent?.timestamp && (!lastSuccessAt || lastSuccessEvent.timestamp > lastSuccessAt)) {
    lastSuccessAt = lastSuccessEvent.timestamp
  }

  const failureCount = signatureFailCount + parseFailCount
  const totalWebhookEvents = successCount + failureCount
  const successRatio = totalWebhookEvents > 0 ? successCount / totalWebhookEvents : 0
  const lastSuccessAge = ageSeconds(lastSuccessAt, nowMs)

  let webhookSeverity: HealthSeverity = 'good'
  const hasWebhookConfig = !!tenant.webhookId || ((tenant.webhookConfigs?.length ?? 0) > 0)
  if (!hasWebhookConfig) webhookSeverity = 'critical'
  else if (lastSuccessAge === null || lastSuccessAge > WEBHOOK_CRITICAL_SECONDS) webhookSeverity = 'critical'
  else if (lastSuccessAge > WEBHOOK_WARN_SECONDS) webhookSeverity = 'warn'

  const webhook: WebhookHealthSnapshot = {
    severity: webhookSeverity,
    configured: hasWebhookConfig,
    successCount,
    failureCount,
    signatureFailCount,
    parseFailCount,
    successRatio,
    lastSuccessAt: asIso(lastSuccessAt),
    lastFailureAt: asIso(lastFailureAt),
    lastSuccessAgeSeconds: lastSuccessAge,
  }

  const todayMidnight = localTodayMidnight(tz)
  const doors = await Door.find({ tenantId, isActive: true })
    .select('name logsCachedThrough')
    .sort({ name: 1 })
    .lean()

  const doorRows: BackfillDoorLagRow[] = doors.map((d) => {
    const cached = d.logsCachedThrough ?? null
    const stale = !cached || cached < todayMidnight
    return {
      doorId: String(d._id),
      doorName: d.name,
      logsCachedThrough: asIso(cached),
      lagSeconds: cached ? Math.max(0, Math.floor((nowMs - cached.getTime()) / 1000)) : null,
      stale,
    }
  })

  const staleDoorCount = doorRows.filter((d) => d.stale).length
  const activeDoorCount = doorRows.length
  const stalePercent = activeDoorCount > 0 ? staleDoorCount / activeDoorCount : 0
  const syncAge = ageSeconds(tenant.lastDoorSync ?? null, nowMs)

  let backfillSeverity: HealthSeverity = 'good'
  if (syncAge === null || syncAge > SYNC_CRITICAL_SECONDS) backfillSeverity = 'critical'
  else if (syncAge > SYNC_WARN_SECONDS) backfillSeverity = 'warn'
  if (staleDoorCount > 0) backfillSeverity = maxSeverity(backfillSeverity, 'warn')
  if (activeDoorCount > 0 && stalePercent > 0.25) backfillSeverity = 'critical'

  const backfill: BackfillHealthSnapshot = {
    severity: backfillSeverity,
    lastDoorSyncAt: asIso(tenant.lastDoorSync ?? null),
    syncAgeSeconds: syncAge,
    staleDoorCount,
    activeDoorCount,
    stalePercent,
    doors: includeDoors ? doorRows : [],
  }

  const overallSeverity = [controller.severity, webhook.severity, backfill.severity].reduce(maxSeverity, 'good' as HealthSeverity)

  return {
    tenantId,
    tenantName: tenant.name,
    timezone: tz,
    overallSeverity,
    controller,
    webhook,
    backfill,
  }
}

export async function getHealthOverview(opts: {
  tenantId?: string
  includeDoors?: boolean
  windowHours?: number
}): Promise<HealthOverviewResponse> {
  const includeDoors = opts.includeDoors === true
  const windowHours = Math.max(1, Math.min(168, Number(opts.windowHours ?? 24)))
  const now = new Date()
  const query = opts.tenantId ? { _id: opts.tenantId } : {}

  const tenants = await Tenant.find(query)
    .select('name timezone unifiHost unifiApiKey webhookId webhookConfigs lastDoorSync')
    .sort({ name: 1 })
    .lean()

  const rows = await Promise.all(
    tenants.map((t) => buildTenantHealthRow(t, now, includeDoors, windowHours))
  )

  const summary = {
    good: rows.filter((r) => r.overallSeverity === 'good').length,
    warn: rows.filter((r) => r.overallSeverity === 'warn').length,
    critical: rows.filter((r) => r.overallSeverity === 'critical').length,
    total: rows.length,
  }

  return {
    generatedAt: now.toISOString(),
    summary,
    rows,
  }
}
