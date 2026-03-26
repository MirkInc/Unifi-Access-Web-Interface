import SystemAudit from '@/models/SystemAudit'

interface WriteAuditInput {
  req?: Request
  tenantId?: string | null
  doorId?: string | null
  actorUserId?: string | null
  actorName?: string | null
  actorEmail?: string | null
  actorRole?: string | null
  action: string
  entityType: string
  entityId?: string | null
  outcome?: 'success' | 'failure'
  message?: string
  metadata?: Record<string, unknown>
}

function clientIp(req?: Request): string {
  if (!req) return ''
  const fromForward = req.headers.get('x-forwarded-for')
  if (fromForward) return fromForward.split(',')[0]?.trim() ?? ''
  return req.headers.get('x-real-ip') ?? ''
}

export async function writeAudit(input: WriteAuditInput) {
  const {
    req,
    tenantId,
    doorId,
    actorUserId,
    actorName,
    actorEmail,
    actorRole,
    action,
    entityType,
    entityId,
    outcome = 'success',
    message = '',
    metadata = {},
  } = input

  await SystemAudit.create({

    tenantId: tenantId || null,
    doorId: doorId || null,
    actorUserId: actorUserId || null,
    actorName: actorName || 'Unknown User',
    actorEmail: actorEmail || '',
    actorRole: actorRole || '',
    action,
    entityType,
    entityId: entityId || '',
    outcome,
    message,
    ip: clientIp(req),
    userAgent: req?.headers.get('user-agent') ?? '',
    metadata,
  })
}

