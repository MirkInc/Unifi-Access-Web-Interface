import { connectDB } from '@/lib/mongodb'
import WebhookDeliveryMetric from '@/models/WebhookDeliveryMetric'

type MetricOutcome = 'success' | 'signature_fail' | 'parse_fail'

function floorToHour(d: Date): Date {
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    0,
    0,
    0
  ))
}

function floorToDay(d: Date): Date {
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    0,
    0,
    0,
    0
  ))
}

export async function recordWebhookDeliveryMetric(
  tenantId: string,
  outcome: MetricOutcome,
  at = new Date()
): Promise<void> {
  try {
    await connectDB()
    const hourWindow = floorToHour(at)
    const dayWindow = floorToDay(at)
    const updates = [
      { granularity: 'hour' as const, windowStart: hourWindow },
      { granularity: 'day' as const, windowStart: dayWindow },
    ]

    const inc: Record<string, number> = {}
    const set: Record<string, Date> = {}
    if (outcome === 'success') {
      inc.receivedSuccessCount = 1
      set.lastSuccessAt = at
    } else if (outcome === 'signature_fail') {
      inc.signatureFailCount = 1
      set.lastFailureAt = at
    } else if (outcome === 'parse_fail') {
      inc.parseFailCount = 1
      set.lastFailureAt = at
    }

    await Promise.all(
      updates.map((u) =>
        WebhookDeliveryMetric.findOneAndUpdate(
          { tenantId, granularity: u.granularity, windowStart: u.windowStart },
          { $inc: inc, $max: set },
          { upsert: true }
        )
      )
    )
  } catch (err) {
    console.error('[webhook-health] metric write failed:', (err as Error).message)
  }
}

