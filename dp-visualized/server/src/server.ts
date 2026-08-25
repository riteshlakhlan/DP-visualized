import { createApp } from "./app";
import { env } from "./config/env";

async function main() {
  const app = await createApp();
  app.listen(env.port, () => {
    console.log(`[api] DP Visualized backend listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
