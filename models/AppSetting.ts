import mongoose, { Document, Model, Schema } from 'mongoose'

export interface IAppSetting extends Document {
  key: string
  portalUrls: string[]
  permissionRoles: {
    id: string
    name: string
    canUnlock: boolean
    canEndLockSchedule: boolean
    canTempLock: boolean
    canEndTempLock: boolean
    canViewLogs: boolean
    canViewAnalytics: boolean
  }[]
  globalLogoutAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const AppSettingSchema = new Schema<IAppSetting>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    portalUrls: { type: [String], default: [] },
    permissionRoles: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true },
            name: { type: String, required: true, trim: true },
            canUnlock: { type: Boolean, default: false },
            canEndLockSchedule: { type: Boolean, default: false },
            canTempLock: { type: Boolean, default: false },
            canEndTempLock: { type: Boolean, default: false },
            canViewLogs: { type: Boolean, default: false },
            canViewAnalytics: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    globalLogoutAt: { type: Date, default: null },
  },
  { timestamps: true }
)

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).AppSetting
}

const AppSetting: Model<IAppSetting> =
  mongoose.models.AppSetting ?? mongoose.model<IAppSetting>('AppSetting', AppSettingSchema)

export default AppSetting

