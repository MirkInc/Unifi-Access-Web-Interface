import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IPasswordResetToken extends Document {
  userId: Types.ObjectId
  token: string
  expiresAt: Date
  used: boolean
  type: 'invite' | 'reset' | 'email_confirm'
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  type: { type: String, enum: ['invite', 'reset', 'email_confirm'], default: 'reset' },
})

// Auto-expire tokens from DB after they expire
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).PasswordResetToken
}

const PasswordResetToken: Model<IPasswordResetToken> =
  mongoose.models.PasswordResetToken ??
  mongoose.model<IPasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema)

export default PasswordResetToken
