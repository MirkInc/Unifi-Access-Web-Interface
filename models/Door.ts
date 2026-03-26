import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IDoor extends Document {
  tenantId: Types.ObjectId
  unifiDoorId: string   // ID from UniFi Access API
  name: string
  fullName: string
  floorId: string
  type: string
  isActive: boolean     // false if no longer returned by UniFi API
  lastSeen: Date
  logsCachedThrough: Date | null  // UTC datetime; all past days (in tenant TZ) are cached up to this point
  oldestLogAt: Date | null        // timestamp of the oldest known access event for this door
  scheduleId: string | null       // UniFi schedule UUID assigned to this door
  scheduleName: string | null     // cached name for display
  firstPersonInRequired: boolean  // local admin-configured first-person-in requirement flag
  createdAt: Date
  updatedAt: Date
}

const DoorSchema = new Schema<IDoor>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    unifiDoorId: { type: String, required: true },
    name: { type: String, required: true },
    fullName: { type: String, default: '' },
    floorId: { type: String, default: '' },
    type: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    logsCachedThrough: { type: Date, default: null },
    oldestLogAt: { type: Date, default: null },
    scheduleId: { type: String, default: null },
    scheduleName: { type: String, default: null },
    firstPersonInRequired: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// Compound unique index: one unifiDoorId per tenant
DoorSchema.index({ tenantId: 1, unifiDoorId: 1 }, { unique: true })

// Re-register model on hot reload in development so schema changes are picked up
if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).Door
}

const Door: Model<IDoor> =
  mongoose.models.Door ?? mongoose.model<IDoor>('Door', DoorSchema)

export default Door
