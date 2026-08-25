import mongoose, { Schema } from "mongoose";

const TraceCacheSchema = new Schema(
  {
    slug: { type: String, required: true, index: true },
    /** sha256(input+mode) — traces are pure functions of these. */
    hash: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: "7d" },
  },
  { timestamps: false },
);
TraceCacheSchema.index({ slug: 1, hash: 1 }, { unique: true });

export const TraceCache = mongoose.model("TraceCache", TraceCacheSchema);
