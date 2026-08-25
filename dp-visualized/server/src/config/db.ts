import mongoose from "mongoose";
import { env } from "./env";

let connected = false;

/**
 * Connect to MongoDB Atlas / local instance. When MONGODB_URI is empty the API
 * runs in DB-less demo mode: the catalog is served from code and traces are
 * always computed live. Controllers never know which mode they're in.
 */
export async function connectDB(): Promise<boolean> {
  if (!env.mongoUri) {
    console.log("[db] MONGODB_URI not set → running in DB-less demo mode");
    return false;
  }
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
    connected = true;
    console.log("[db] connected");
    return true;
  } catch (err) {
    console.error("[db] connection failed — falling back to DB-less demo mode:", (err as Error).message);
    return false;
  }
}

export function isDbConnected(): boolean {
  return connected && mongoose.connection.readyState === 1;
}
