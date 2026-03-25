import mongoose, { Schema } from 'mongoose'

const LogCacheSchema = new Schema({
  tenantId: { type: String, required: true },
  unifiDoorId: { type: String, required: true },
  date: { type: String, required: true },   // "2026-03-24"
  topic: { type: String, required: true },
  events: { type: Schema.Types.Mixed, required: true },  // UnifiLogEntry[]
  cachedAt: { type: Date, default: Date.now },
})
LogCacheSchema.index({ tenantId: 1, unifiDoorId: 1, date: 1, topic: 1 }, { unique: true })
export default mongoose.models.LogCache || mongoose.model('LogCache', LogCacheSchema)
