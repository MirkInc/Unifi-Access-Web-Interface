import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IWebhookDeliveryMetric extends Document {
  tenantId: Types.ObjectId
  granularity: 'hour' | 'day'
  windowStart: Date
  receivedSuccessCount: number
  signatureFailCount: number
  parseFailCount: number
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const WebhookDeliveryMetricSchema = new Schema<IWebhookDeliveryMetric>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    granularity: { type: String, enum: ['hour', 'day'], required: true },
    windowStart: { type: Date, required: true },
    receivedSuccessCount: { type: Number, default: 0 },
    signatureFailCount: { type: Number, default: 0 },
    parseFailCount: { type: Number, default: 0 },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
  },
  { timestamps: true }
)

WebhookDeliveryMetricSchema.index(
  { tenantId: 1, granularity: 1, windowStart: 1 },
  { unique: true }
)

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).WebhookDeliveryMetric
}

const WebhookDeliveryMetric: Model<IWebhookDeliveryMetric> =
  mongoose.models.WebhookDeliveryMetric ??
  mongoose.model<IWebhookDeliveryMetric>('WebhookDeliveryMetric', WebhookDeliveryMetricSchema)

export default WebhookDeliveryMetric

