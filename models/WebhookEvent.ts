import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IWebhookEvent extends Document {
  tenantId: Types.ObjectId
  unifiDoorId: string
  event: string
  timestamp: Date
  payload: Record<string, unknown>
}

const WebhookEventSchema = new Schema<IWebhookEvent>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  unifiDoorId: { type: String, required: true },
  event: { type: String, required: true },
  timestamp: { type: Date, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
})

WebhookEventSchema.index({ tenantId: 1, unifiDoorId: 1, timestamp: 1 })

// In development, delete the cached model so schema changes are picked up on hot reload
if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).WebhookEvent
}

const WebhookEvent: Model<IWebhookEvent> =
  mongoose.models.WebhookEvent ?? mongoose.model<IWebhookEvent>('WebhookEvent', WebhookEventSchema)

export default WebhookEvent
