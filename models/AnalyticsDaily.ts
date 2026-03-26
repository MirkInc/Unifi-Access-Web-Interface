import mongoose, { Document, Model, Schema, Types } from 'mongoose'

export interface IAnalyticsDaily extends Document {
  tenantId: Types.ObjectId
  doorId: Types.ObjectId
  unifiDoorId: string
  date: string
  totalEvents: number
  grantedCount: number
  deniedCount: number
  methodCounts: Record<string, number>
  hourlyGranted: number[]
  hourlyDenied: number[]
  lastComputedAt: Date
}

const AnalyticsDailySchema = new Schema<IAnalyticsDaily>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  doorId: { type: Schema.Types.ObjectId, ref: 'Door', required: true, index: true },
  unifiDoorId: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD in tenant local TZ
  totalEvents: { type: Number, default: 0 },
  grantedCount: { type: Number, default: 0 },
  deniedCount: { type: Number, default: 0 },
  methodCounts: { type: Schema.Types.Mixed, default: {} },
  hourlyGranted: { type: [Number], default: Array(24).fill(0) },
  hourlyDenied: { type: [Number], default: Array(24).fill(0) },
  lastComputedAt: { type: Date, default: Date.now, index: true },
})

AnalyticsDailySchema.index({ tenantId: 1, doorId: 1, date: 1 }, { unique: true })
AnalyticsDailySchema.index({ tenantId: 1, date: 1 })

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).AnalyticsDaily
}

const AnalyticsDaily: Model<IAnalyticsDaily> =
  mongoose.models.AnalyticsDaily ?? mongoose.model<IAnalyticsDaily>('AnalyticsDaily', AnalyticsDailySchema)

export default AnalyticsDaily

