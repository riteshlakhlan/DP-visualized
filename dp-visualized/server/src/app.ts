import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { api } from "./routes";
import { errorHandler, notFound } from "./middleware/error";

export async function createApp() {
  await connectDB();

  const app = express();
  app.use(cors({ origin: env.clientOrigins }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
