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
  mfaEnforced: boolean
  mfaRequiredFrom: Date | null
  mfaEmailEnabled: boolean
  mfaEmailVerified: boolean
  mfaEmailSetupCodeHash: string | null
  mfaEmailSetupCodeExpiresAt: Date | null
  mfaTotpEnabled: boolean
  mfaTotpSecret: string | null
  mfaTotpSetupSecret: string | null
  mfaPasskeyRegistrationChallenge: string | null
  mfaPasskeyRegistrationExpiresAt: Date | null
  mfaPasskeys: {
    id: string
    publicKey: string
    counter: number
    deviceType: 'singleDevice' | 'multiDevice'
    backedUp: boolean
    transports: string[]
    name: string
    createdAt: Date
  }[]
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
    mfaEnforced: { type: Boolean, default: false },
    mfaRequiredFrom: { type: Date, default: null },
    mfaEmailEnabled: { type: Boolean, default: false },
    mfaEmailVerified: { type: Boolean, default: false },
    mfaEmailSetupCodeHash: { type: String, default: null },
    mfaEmailSetupCodeExpiresAt: { type: Date, default: null },
    mfaTotpEnabled: { type: Boolean, default: false },
    mfaTotpSecret: { type: String, default: null },
    mfaTotpSetupSecret: { type: String, default: null },
    mfaPasskeyRegistrationChallenge: { type: String, default: null },
    mfaPasskeyRegistrationExpiresAt: { type: Date, default: null },
    mfaPasskeys: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            publicKey: { type: String, required: true },
            counter: { type: Number, default: 0 },
            deviceType: { type: String, enum: ['singleDevice', 'multiDevice'], default: 'singleDevice' },
            backedUp: { type: Boolean, default: false },
            transports: { type: [String], default: [] },
            name: { type: String, default: 'Passkey' },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
)

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).User
}

const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>('User', UserSchema)

export default User
