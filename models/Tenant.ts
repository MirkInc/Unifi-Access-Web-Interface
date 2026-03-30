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
  webhookConfigs?: Array<{
    id: string
    secret: string
    baseUrl: string
    endpoint: string
    createdAt: Date
  }>
  analyticsPrefs?: {
    hideUnlockedTime: boolean
    hideUnauthorizedOpenTime: boolean
  }
  branding?: {
    portalName?: string
    logoUrl?: string
    accentColor?: string
    loginHosts?: string[]
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
    webhookConfigs: {
      type: [
        {
          id: { type: String, required: true },
          secret: { type: String, required: true },
          baseUrl: { type: String, required: true },
          endpoint: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    analyticsPrefs: {
      hideUnlockedTime: { type: Boolean, default: false },
      hideUnauthorizedOpenTime: { type: Boolean, default: false },
    },
    branding: {
      portalName: { type: String, default: '' },
      logoUrl: { type: String, default: '' },
      accentColor: { type: String, default: '' },
      loginHosts: { type: [String], default: [] },
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
