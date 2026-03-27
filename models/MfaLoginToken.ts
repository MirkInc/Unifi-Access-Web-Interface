import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IMfaLoginToken extends Document {
  userId: Types.ObjectId
  token: string
  expiresAt: Date
  used: boolean
}

const MfaLoginTokenSchema = new Schema<IMfaLoginToken>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
})

MfaLoginTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).MfaLoginToken
}

const MfaLoginToken: Model<IMfaLoginToken> =
  mongoose.models.MfaLoginToken ??
  mongoose.model<IMfaLoginToken>('MfaLoginToken', MfaLoginTokenSchema)

export default MfaLoginToken

