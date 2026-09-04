import { expect, test } from "@playwright/test";

test.describe("ActualAnalysis public experience", () => {
  test("renders Compare without duplicate React keys", async ({ page }) => {
    const duplicateKeyErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("same key")) {
        duplicateKeyErrors.push(message.text());
      }
    });

    await page.goto("/compare");
    await expect(page.getByRole("heading", { name: "Benchmark ranking" })).toBeVisible();
    expect(duplicateKeyErrors).toEqual([]);
  });

  test("switches between all three capability indexes", async ({ page, request }) => {
    const expectedLeader = new Map<string, string>();
    for (const kind of ["mixed", "agentic", "chat"] as const) {
      const response = await request.get(`/api/v1/index/${kind}`);
      expect(response.ok()).toBeTruthy();
      const payload = await response.json() as { data: { rows: Array<{ modelName: string }> } };
      expect(payload.data.rows.length).toBeGreaterThan(0);
      expectedLeader.set(kind, payload.data.rows[0]!.modelName);
    }

    await page.goto("/");

    const mixed = page.getByRole("button", { name: "Mixed" });
    const agentic = page.getByRole("button", { name: "Agentic" });
    const chat = page.getByRole("button", { name: "Chat" });
    const firstModel = page.locator("#leaderboard-table tbody tr").first().getByRole("link");

    await expect(mixed).toHaveAttribute("aria-pressed", "true");
    await expect(firstModel).toHaveText(expectedLeader.get("mixed")!);

    await agentic.click();
    await expect(agentic).toHaveAttribute("aria-pressed", "true");
    await expect(mixed).toHaveAttribute("aria-pressed", "false");
    await expect(firstModel).toHaveText(expectedLeader.get("agentic")!);
    await expect(page.getByText("Agentic index", { exact: true })).toBeVisible();

    await chat.click();
    await expect(chat).toHaveAttribute("aria-pressed", "true");
    await expect(agentic).toHaveAttribute("aria-pressed", "false");
    await expect(firstModel).toHaveText(expectedLeader.get("chat")!);
    await expect(page.getByText("Chat index", { exact: true })).toBeVisible();
  });

  test("opens a model evidence page from the leaderboard", async ({ page, request }) => {
    const [resultsResponse, modelsResponse, mixedResponse] = await Promise.all([
      request.get("/api/v1/results"),
      request.get("/api/v1/models"),
      request.get("/api/v1/index/mixed"),
    ]);
    const resultsPayload = await resultsResponse.json() as { data: Array<{ modelSlug: string }> };
    const modelsPayload = await modelsResponse.json() as { data: Array<{ slug: string; name: string }> };
    const mixedPayload = await mixedResponse.json() as { data: { rows: Array<{ modelSlug: string; provisional: boolean }> } };
    const evidencedModels = new Set(resultsPayload.data.map((result) => result.modelSlug));
    const rankedModels = new Set(mixedPayload.data.rows.filter((row) => !row.provisional).map((row) => row.modelSlug));
    const expectedModel = modelsPayload.data.find(
      (model) => rankedModels.has(model.slug) && evidencedModels.has(model.slug),
    );
    expect(expectedModel).toBeTruthy();

    await page.goto("/");
    const modelLink = page.locator(`#leaderboard-table a[href="/models/${expectedModel!.slug}"]`);
    await expect(modelLink).toBeVisible();
    const modelHref = await modelLink.getAttribute("href");
    expect(modelHref).toMatch(/^\/models\//u);
    await modelLink.click();

    await page.waitForURL((url) => url.pathname === modelHref);
    await expect(page.getByRole("heading", { level: 1, name: expectedModel!.name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Benchmark evidence" })).toBeVisible();
    await expect(page.getByRole("table").first().locator("tbody tr").first()).toBeVisible();
  });

  test("renders a benchmark audit page and links back to a model", async ({ page, request }) => {
    const [resultsResponse, benchmarksResponse, mixedResponse] = await Promise.all([
      request.get("/api/v1/results"),
      request.get("/api/v1/benchmarks"),
      request.get("/api/v1/index/mixed"),
    ]);
    expect(resultsResponse.ok()).toBeTruthy();
    expect(benchmarksResponse.ok()).toBeTruthy();
    const resultsPayload = await resultsResponse.json() as {
      data: Array<{ benchmarkSlug: string; modelSlug: string }>;
    };
    const benchmarksPayload = await benchmarksResponse.json() as {
      data: Array<{ slug: string; name: string }>;
    };
    const mixedPayload = await mixedResponse.json() as { data: { rows: Array<{ modelSlug: string }> } };
    const rankedModels = new Set(mixedPayload.data.rows.map((row) => row.modelSlug));
    const result = resultsPayload.data.find((item) => rankedModels.has(item.modelSlug));
    expect(result).toBeTruthy();
    const benchmark = benchmarksPayload.data.find((item) => item.slug === result!.benchmarkSlug);
    expect(benchmark).toBeTruthy();

    await page.goto(`/benchmarks/${benchmark!.slug}`);

    await expect(page.getByRole("heading", { level: 1, name: benchmark!.name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Weight construction" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Model results" })).toBeVisible();

    const modelLink = page.locator(`#main-content table a[href="/models/${result!.modelSlug}"]`).first();
    await expect(modelLink).toBeVisible();
    const modelHref = await modelLink.getAttribute("href");
    expect(modelHref).toBe(`/models/${result!.modelSlug}`);
    await modelLink.click();
    await page.waitForURL((url) => url.pathname === modelHref);
  });

  test("navigates through the command palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+K");

    const dialog = page.getByRole("dialog", { name: "Command palette" });
    const search = dialog.getByRole("combobox", { name: "Search commands" });
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();

    await search.fill("methodology");
    await expect(dialog.getByRole("option", { name: /Methodology/ })).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/methodology$/);
    await expect(page.getByRole("heading", { level: 1, name: "ActualAnalysis Capability Index methodology" })).toBeVisible();
    await expect(page.getByText("This document is normative.", { exact: false })).toBeVisible();
  });

  test("persists explicit light and dark theme choices", async ({ page }) => {
    await page.goto("/");

    const root = page.locator("html");
    async function clickVisibleThemeToggle(name: string) {
      let toggle = page.getByRole("button", { name }).filter({ visible: true });
      if ((await toggle.count()) === 0) {
        await page.getByLabel("Open navigation menu").click();
        toggle = page.getByRole("button", { name }).filter({ visible: true });
      }
      await toggle.click();
    }

    await expect(root).toHaveAttribute("data-theme", "light");
    await clickVisibleThemeToggle("Switch to dark theme");
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("actualanalysis-theme"))).toBe("dark");

    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "dark");
    await clickVisibleThemeToggle("Switch to light theme");
    await expect(root).toHaveAttribute("data-theme", "light");
  });
});

test.describe("ActualAnalysis API v1", () => {
  test("serves a versioned, redistributable index contract", async ({ request }) => {
    const rootResponse = await request.get("/api/v1");
    expect(rootResponse.ok()).toBeTruthy();
    expect(rootResponse.headers()["access-control-allow-origin"]).toBe("*");
    expect(rootResponse.headers()["x-ratelimit-limit"]).toBe("120");

    const root = await rootResponse.json();
    expect(root.meta).toMatchObject({ published: expect.any(Boolean), status: expect.stringMatching(/^(fixture|snapshot)$/u) });
    expect(root.meta.disclaimer).toEqual(expect.any(String));
    expect(root.data).toMatchObject({ name: "ActualAnalysis API", version: "v1" });
    expect(root.data.resources).toContain("/api/v1/index/mixed");

    for (const kind of ["mixed", "agentic", "chat"] as const) {
      const response = await request.get(`/api/v1/index/${kind}`);
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      expect(payload.data.kind).toBe(kind);
      expect(payload.data.rows.length).toBeGreaterThan(0);
      expect(payload.data.rows[0]).toEqual(
        expect.objectContaining({
          modelId: expect.any(String),
          score: expect.any(Number),
          coverage: expect.any(Number),
        }),
      );
    }

    const modelsResponse = await request.get("/api/v1/models");
    expect(modelsResponse.ok()).toBeTruthy();
    const models = await modelsResponse.json();
    expect(models.data.length).toBeGreaterThan(0);
    expect(models.data[0]).not.toHaveProperty("speed");

    const invalidResponse = await request.get("/api/v1/index/not-an-index");
    expect(invalidResponse.status()).toBe(404);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      data: { error: "Unknown index kind.", allowed: ["mixed", "agentic", "chat"] },
    });

    const preflight = await request.fetch("/api/v1/models", { method: "OPTIONS" });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()["access-control-allow-methods"]).toContain("GET");
  });
});
