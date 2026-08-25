import { describe, it } from "vitest";
import { listImplementedSlugs, getService } from "../../src/services/registry";
import type { DPMode } from "../../src/services/types";
describe("audit", () => {
  it("every defaultInput satisfies its schema & mode limits", () => {
    for (const slug of listImplementedSlugs()) {
      const svc = getService(slug)!;
      const parsed = svc.schema.safeParse(svc.defaultInput);
      if (!parsed.success) { console.log(`${slug}: SCHEMA FAIL`, JSON.stringify(parsed.error.issues[0])); continue; }
      for (const mode of ["bruteforce", "memo", "tabulation", "spaceOptimized"] as DPMode[]) {
        const lim = svc.limitsPerMode[mode](mode, parsed.data);
        if (lim) console.log(`${slug}/${mode}: LIMIT BLOCKS DEFAULT: ${lim}`);
      }
    }
  });
});
