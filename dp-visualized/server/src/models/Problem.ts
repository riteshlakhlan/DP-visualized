import mongoose, { Schema } from "mongoose";

const CodeSnippetsSchema = new Schema({}, { strict: false, _id: false });

const ProblemSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    patternSlug: { type: String, required: true, index: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    striverLink: { type: String, default: "" },
    statement: { type: String, required: true },
    constraints: { type: [String], default: [] },
    examples: [{ input: String, output: String, explanation: String }],
    dimensions: { type: Number, enum: [1, 2, 3], default: 2 },
    recurrence: { type: String, default: "" },
    baseCase: { type: String, default: "" },
    timeComplexity: { type: String, default: null },
    spaceComplexity: { type: String, default: null },
    keyInsight: { type: String, default: null },
    implemented: { type: Boolean, default: false },
    code: {
      bruteforce: CodeSnippetsSchema,
      memoization: CodeSnippetsSchema,
      tabulation: CodeSnippetsSchema,
      spaceOptimized: CodeSnippetsSchema,
    },
  },
  { timestamps: true },
);

export const Problem = mongoose.model("Problem", ProblemSchema);
