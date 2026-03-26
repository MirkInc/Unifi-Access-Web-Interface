import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ITenant extends Document {
  name: string
  description: string
  unifiHost: string    // e.g. "192.168.1.1:12445"
  unifiApiKey: string
  timezone: string     // IANA timezone, e.g. "America/Chicago"
  lastDoorSync: Date | null
  webhookId: string | null
  webhookSecret: string | null
  webhookBaseUrl: string | null
  analyticsPrefs?: {
    hideUnlockedTime: boolean
    hideUnauthorizedOpenTime: boolean
  }
  createdAt: Date
  updatedAt: Date
}

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    unifiHost: { type: String, required: true, trim: true },
    unifiApiKey: { type: String, required: true },
    timezone: { type: String, default: '' },
    lastDoorSync: { type: Date, default: null },
    webhookId: { type: String, default: null },
    webhookSecret: { type: String, default: null },
    webhookBaseUrl: { type: String, default: null },
    analyticsPrefs: {
      hideUnlockedTime: { type: Boolean, default: true },
      hideUnauthorizedOpenTime: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
)

// In development, delete the cached model so schema changes are picked up on hot reload
if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).Tenant
}

const Tenant: Model<ITenant> =
  mongoose.models.Tenant ?? mongoose.model<ITenant>('Tenant', TenantSchema)

export default Tenant
