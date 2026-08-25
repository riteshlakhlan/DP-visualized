import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  port: Number(req("PORT", "4000")),
  mongoUri: process.env.MONGODB_URI?.trim() || "",
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()),
};

export const usingDb = (): boolean => env.mongoUri.length > 0;
