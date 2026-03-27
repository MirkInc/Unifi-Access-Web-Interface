import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface ISystemAudit extends Document {
  timestamp: Date
  tenantId?: Types.ObjectId | null
  doorId?: Types.ObjectId | null
  actorUserId?: Types.ObjectId | null
  actorName: string
  actorEmail?: string
  actorRole?: string
  action: string
  entityType: string
  entityId?: string
  outcome: 'success' | 'failure'
  message?: string
  ip?: string
  userAgent?: string
  metadata: Record<string, unknown>
}

const SystemAuditSchema = new Schema<ISystemAudit>({
  timestamp: { type: Date, default: Date.now, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  doorId: { type: Schema.Types.ObjectId, ref: 'Door', default: null, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorName: { type: String, required: true },
  actorEmail: { type: String, default: '' },
  actorRole: { type: String, default: '' },
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String, default: '' },
  outcome: { type: String, enum: ['success', 'failure'], required: true, index: true },
  message: { type: String, default: '' },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed, default: {} },
})

SystemAuditSchema.index({ tenantId: 1, timestamp: -1 })
SystemAuditSchema.index({ actorUserId: 1, timestamp: -1 })
SystemAuditSchema.index({ action: 1, timestamp: -1 })

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).SystemAudit
}

const SystemAudit: Model<ISystemAudit> =
  mongoose.models.SystemAudit ?? mongoose.model<ISystemAudit>('SystemAudit', SystemAuditSchema)

export default SystemAudit

