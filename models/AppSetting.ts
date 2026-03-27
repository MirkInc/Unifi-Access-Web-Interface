import mongoose, { Document, Model, Schema } from 'mongoose'

export interface IAppSetting extends Document {
  key: string
  portalUrls: string[]
  globalLogoutAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const AppSettingSchema = new Schema<IAppSetting>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    portalUrls: { type: [String], default: [] },
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

