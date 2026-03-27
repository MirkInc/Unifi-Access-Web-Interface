import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IDoorPermission {
  doorId: Types.ObjectId
  canUnlock: boolean
  canEndLockSchedule: boolean
  canTempLock: boolean
  canEndTempLock: boolean
  canViewLogs: boolean
  canViewAnalytics: boolean
}

export interface ITenantAccess {
  tenantId: Types.ObjectId
  doorPermissions: IDoorPermission[]
}

export interface IUser extends Document {
  email: string
  name: string
  passwordHash: string
  role: 'admin' | 'user'
  tenantAccess: ITenantAccess[]
  isActive: boolean
  pendingEmail: string | null
  preferredPortalUrl: string | null
  createdAt: Date
  updatedAt: Date
}

const DoorPermissionSchema = new Schema<IDoorPermission>(
  {
    doorId: { type: Schema.Types.ObjectId, ref: 'Door', required: true },
    canUnlock: { type: Boolean, default: false },
    canEndLockSchedule: { type: Boolean, default: false },
    canTempLock: { type: Boolean, default: false },
    canEndTempLock: { type: Boolean, default: false },
    canViewLogs: { type: Boolean, default: false },
    canViewAnalytics: { type: Boolean, default: false },
  },
  { _id: false }
)

const TenantAccessSchema = new Schema<ITenantAccess>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    doorPermissions: { type: [DoorPermissionSchema], default: [] },
  },
  { _id: false }
)

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    tenantAccess: { type: [TenantAccessSchema], default: [] },
    isActive: { type: Boolean, default: true },
    pendingEmail: { type: String, default: null },
    preferredPortalUrl: { type: String, default: null, trim: true },
  },
  { timestamps: true }
)

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).User
}

const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>('User', UserSchema)

export default User
