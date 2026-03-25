import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IActorCache extends Document {
  tenantId: Types.ObjectId
  actorId: string
  actorName: string
  lastSeenAt: Date
  createdAt: Date
  updatedAt: Date
}

const ActorCacheSchema = new Schema<IActorCache>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    actorId: { type: String, required: true, trim: true },
    actorName: { type: String, required: true, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

ActorCacheSchema.index({ tenantId: 1, actorId: 1 }, { unique: true })

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).ActorCache
}

const ActorCache: Model<IActorCache> =
  mongoose.models.ActorCache ?? mongoose.model<IActorCache>('ActorCache', ActorCacheSchema)

export default ActorCache
