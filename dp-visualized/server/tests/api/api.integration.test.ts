import { describe, it, expect, afterAll } from "vitest";
import type { Server } from "http";
import { createApp } from "../../src/app";
import { listImplementedSlugs, getService } from "../../src/services/registry";
import type { DPMode } from "../../src/services/types";

/**
 * Boots the real Express app on an ephemeral port and asserts that bad input
 * produces clean JSON errors — regression guard for the async-handler fix
 * (a thrown ZodError inside an async controller used to kill the process).
 */

let server: Server | null = null;
let baseUrl = "";

async function start() {
  if (server) return;
  const app = await createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      baseUrl = `http://127.0.0.1:${(addr as any).port}`;
      resolve();
    });
  });
}

afterAll(() => {
  server?.close();
});

describe("trace API error handling", () => {
  it("invalid per-problem input -> 422 JSON, server survives", async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/problems/grid-unique-paths-ii/trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { grid: [[0]] }, mode: "tabulation" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();

    const stillAlive = await fetch(`${baseUrl}/api/health`);
    expect(stillAlive.status).toBe(200);
  });

  it("unknown problem slug -> 404", async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/problems/does-not-exist/trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: {}, mode: "memo" }),
    });
    expect(res.status).toBe(404);
  });

  it("malformed body -> 400", async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/problems/frog-jump-k/trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { heights: [1] }, mode: "not-a-mode" }),
    });
    expect(res.status).toBe(400);
  });

  it("brute-force size cap -> 422 with guidance message", async () => {
    await start();
    const res = await fetch(`${baseUrl}/api/problems/climbing-stairs/trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { n: 45 }, mode: "bruteforce" }),
    });
    expect([400, 422]).toContain(res.status);
    const body = (await res.json()) as { error?: string };
    expect(body.error?.length ?? 0).toBeGreaterThan(10);
  });

  it("happy path returns a trace for every implemented problem", async () => {
    await start();
    const problems = (await (await fetch(`${baseUrl}/api/problems`)).json()) as { slug: string; implemented: boolean }[];
    for (const p of problems.filter((x) => x.implemented)) {
      const det = (await (await fetch(`${baseUrl}/api/problems/${p.slug}`)).json()) as {
        defaultInput: unknown;
        inputDescriptor: unknown;
      };
      expect(det.defaultInput, `${p.slug} exposes a defaultInput`).toBeTruthy();
      const res = await fetch(`${baseUrl}/api/problems/${p.slug}/trace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: det.defaultInput, mode: "tabulation" }),
      });
      expect(res.status, `${p.slug} tabulation trace`).toBe(200);
      const tr = (await res.json()) as { steps: unknown[]; meta: { answer: unknown } };
      expect(tr.steps.length).toBeGreaterThan(0);
      expect(tr.meta.answer !== undefined, `${p.slug} has an answer`).toBe(true);
    }
  });

  it("every defaultInput satisfies its own schema and memo/tab limits", () => {
    for (const slug of listImplementedSlugs()) {
      const svc = getService(slug)!;
      const parsed = svc.schema.safeParse(svc.defaultInput);
      expect(parsed.success, `${slug} defaultInput must pass its zod schema: ${JSON.stringify(svc.defaultInput)}`).toBe(true);
      for (const mode of ["memo", "tabulation", "spaceOptimized"] as DPMode[]) {
        // a service may deliberately omit a variant entirely (e.g. print-lcs has
        // no spaceOptimized because printing needs the full table) — skip those
        const variant = { memo: "memoization", tabulation: "tabulation", spaceOptimized: "spaceOptimized" }[mode] as string;
        if (!(svc.codes as Record<string, unknown>)[variant]) continue;
        const lim = svc.limitsPerMode[mode](mode, parsed.data!);
        expect(lim, `${slug}/${mode} must allow its defaultInput; got: ${lim}`).toBeNull();
      }
    }
  });
});
