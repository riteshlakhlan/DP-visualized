import mongoose, { Schema } from "mongoose";

const PatternSchema = new Schema({
  slug: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  order: { type: Number, required: true },
  description: { type: String, default: "" },
});

export const Pattern = mongoose.model("Pattern", PatternSchema);
