import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export type MfaMethod = 'email' | 'totp' | 'passkey'

export interface IMfaLoginChallenge extends Document {
  userId: Types.ObjectId
  token: string
  expiresAt: Date
  used: boolean
  methods: MfaMethod[]
  emailCodeHash: string | null
  emailCodeExpiresAt: Date | null
  passkeyChallenge: string | null
  attempts: number
}

const MfaLoginChallengeSchema = new Schema<IMfaLoginChallenge>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  methods: { type: [String], enum: ['email', 'totp', 'passkey'], required: true, default: [] },
  emailCodeHash: { type: String, default: null },
  emailCodeExpiresAt: { type: Date, default: null },
  passkeyChallenge: { type: String, default: null },
  attempts: { type: Number, default: 0 },
})

MfaLoginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).MfaLoginChallenge
}

const MfaLoginChallenge: Model<IMfaLoginChallenge> =
  mongoose.models.MfaLoginChallenge ??
  mongoose.model<IMfaLoginChallenge>('MfaLoginChallenge', MfaLoginChallengeSchema)

export default MfaLoginChallenge

