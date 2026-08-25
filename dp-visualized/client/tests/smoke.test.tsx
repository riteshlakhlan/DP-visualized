import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRoutes } from "../src/App";

function fakeFetch(url: string): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (url.includes("/api/patterns"))
    return Promise.resolve(
      json([
        { slug: "1d-dp", name: "1D DP", order: 2, description: "one state dimension", problemCount: 3, implementedCount: 1 },
        { slug: "dp-grids", name: "DP on Grids", order: 3, description: "lattice paths", problemCount: 4, implementedCount: 2 },
      ]),
    );
  if (url.includes("/api/problems?") || url.endsWith("/api/problems"))
    return Promise.resolve(json([{ slug: "climbing-stairs", title: "Climbing Stairs", patternSlug: "1d-dp", difficulty: "Easy", dimensions: 1, implemented: true }]));
  if (url.startsWith("/api/problems/"))
    return Promise.resolve(json({ error: "not needed in this smoke test" }),);
  return Promise.resolve(json({}));
}

describe("app smoke (jsdom, no WebGL)", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => fakeFetch(String(input))));
  });

  function mount(route: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // R3F canvas pages are excluded from smoke; About/Patterns are pure DOM.
    // R3F canvas pages are excluded from smoke; About/Patterns are pure DOM.
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders the about page", async () => {
    mount("/about");
    await waitFor(() => expect(screen.getByRole("heading", { name: /about dp·visualized/i })).toBeTruthy());
    expect(screen.getByText(/fan-made/i)).toBeTruthy();
  }, 15000);

  it("lists patterns with live counts", async () => {
    mount("/patterns");
    await waitFor(() => expect(screen.getByText("1D DP")).toBeTruthy());
    expect(screen.getAllByText(/live/).length).toBeGreaterThan(0);
  }, 15000);
});
