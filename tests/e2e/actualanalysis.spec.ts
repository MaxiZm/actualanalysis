import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("ActualAnalysis public experience", () => {
  test("shows the expanded catalog, AA task economics and physics evidence", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    for (const slug of [
      "muse-spark-1.2",
      "muse-spark-1.3",
      "glm-5.3-flash",
      "deepseek-v4-pro-0813",
    ]) {
      await expect(
        page.locator(`#leaderboard-table a[href="/models/${slug}"]`),
      ).toHaveCount(1);
    }
    await expect(
      page.getByRole("columnheader", { name: "AA 4.2 $/task", exact: true }),
    ).toBeVisible();
    await page.goto("/compare");
    await page
      .getByRole("group", { name: "Comparison view" })
      .getByRole("button", { name: "Price & speed", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Runtime metric" }),
    ).toHaveText("AA 4.2 cost per task · USD");
    if (existsSync(path.resolve("data/manual/cost-aa.yaml"))) {
      await expect(
        page.getByRole("img", {
          name: "Mixed vs AA 4.2 cost per task",
          exact: true,
        }),
      ).toBeVisible();
      const costCell = page
        .getByRole("table", { name: "Model pricing and runtime" })
        .locator("tbody tr")
        .filter({ hasText: "Claude Fable 5.1" });
      await expect(
        costCell.locator('a[href*="artificialanalysis.ai/models/"]').first(),
      ).toHaveText(/^\$/);
      await page.goto("/benchmarks/critpt");
      await expect(
        page.getByRole("heading", { name: "CritPt", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Artificial Analysis", { exact: true }).first(),
      ).toBeVisible();
    }
    const publicModels = await (await request.get("/api/v1/models")).text();
    expect(publicModels).not.toContain("usdPerTask");
    expect(publicModels).not.toContain("tokensPerSecond");
  });

  test("renders Compare without duplicate React keys", async ({ page }) => {
    const duplicateKeyErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("same key")) {
        duplicateKeyErrors.push(message.text());
      }
    });

    await page.goto("/compare");
    await expect(
      page.getByRole("heading", { name: "Compare two models" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Benchmark results", exact: true }),
    ).toBeVisible();
    await expect(page.locator("select,datalist")).toHaveCount(0);
    await page
      .getByRole("group", { name: "Comparison view" })
      .getByRole("button", { name: "Benchmarks", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Benchmark results", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("group", { name: "Comparison view" })
      .getByRole("button", { name: "Capability", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Capability area" }),
    ).toBeVisible();
    expect(duplicateKeyErrors).toEqual([]);
  });

  test("keeps the chosen pair and every model when changing profiles", async ({
    page,
  }) => {
    await page.goto("/compare");
    const first = page.getByRole("combobox", {
      name: "First model",
      exact: true,
    });
    const second = page.getByRole("combobox", {
      name: "Second model",
      exact: true,
    });
    await expect(first).not.toBeEmpty();
    const names = [await first.textContent(), await second.textContent()];
    const views = page.getByRole("group", { name: "Comparison view" });
    const profiles = page.getByRole("group", { name: "Capability index" });
    for (const kind of ["Agentic", "Chat", "Mixed"]) {
      await profiles.getByRole("button", { name: kind, exact: true }).click();
      await expect(first).toHaveText(names[0]!);
      await expect(second).toHaveText(names[1]!);
    }
    await views
      .getByRole("button", { name: "Capability", exact: true })
      .click();
    const scores = page.getByRole("table", { name: "Model capability scores" });
    const count = await scores.locator("tbody tr").count();
    expect(count).toBeGreaterThan(20);
    for (const kind of ["Agentic", "Chat", "Mixed"]) {
      await profiles.getByRole("button", { name: kind, exact: true }).click();
      await expect(scores.locator("tbody tr")).toHaveCount(count);
      await expect(
        scores.getByRole("link", { name: "Claude Fable 5.1", exact: true }),
      ).toHaveCount(1);
      await expect(
        scores.getByRole("link", { name: "GPT-6 Astra", exact: true }),
      ).toHaveCount(1);
    }
    await views
      .getByRole("button", { name: "Price & speed", exact: true })
      .click();
    await expect(
      page
        .getByRole("table", { name: "Model pricing and runtime" })
        .locator("tbody tr"),
    ).toHaveCount(count);
    await page.getByRole("button", { name: "tok/s", exact: true }).click();
    await expect(
      page.getByRole("columnheader", { name: "tok/s ↓", exact: true }),
    ).toHaveAttribute("aria-sort", "descending");
    await views
      .getByRole("button", { name: "Benchmarks", exact: true })
      .click();
    await expect(profiles).toHaveCount(0);
    await expect(
      page
        .getByRole("table", { name: "Reported benchmark results" })
        .locator("tbody tr"),
    ).toHaveCount(count);
    await page
      .getByRole("searchbox", { name: "Search compared models" })
      .fill("Fable 5.1");
    await expect(
      page
        .getByRole("table", { name: "Reported benchmark results" })
        .locator("tbody tr"),
    ).toHaveCount(1);
  });

  test("excludes retired benchmarks while preserving MathArena", async ({
    request,
  }) => {
    const response = await request.get("/api/v1/benchmarks");
    expect(response.ok()).toBeTruthy();
    const payload = await response.text();
    for (const id of [
      "swe-bench-pro-public",
      "livecodebench-v6-pro",
      "gsm8k",
      "aime-2025",
    ])
      expect(payload).not.toContain(`"${id}"`);
    expect(payload).toContain("matharena-composite");
  });

  test("selects models with custom controls and exposes chart details", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/compare");
    await page
      .getByRole("combobox", { name: "First model", exact: true })
      .click();
    await page.getByPlaceholder("Search first model…").fill("Gemini 3.8");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("combobox", { name: "First model", exact: true }),
    ).toContainText("Gemini 3.8 Flash");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.max(
              document.body.scrollWidth,
              document.documentElement.scrollWidth,
            ) <=
            document.documentElement.clientWidth + 1,
        ),
      )
      .toBe(true);
    await page
      .getByRole("group", { name: "Comparison view" })
      .getByRole("button", { name: "Capability", exact: true })
      .click();
    const point = page
      .getByRole("img", { name: "Reasoning & Mixed", exact: true })
      .getByRole("button", { name: "GPT-6 Astra", exact: true });
    await point.scrollIntoViewIfNeeded();
    // Flush the scroll event before focus: Radix dismisses hints during scrolling.
    await point.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    if (!isMobile) await point.hover();
    else await point.focus();
    await expect(page.getByRole("tooltip")).toContainText("GPT-6 Astra");
    await point.press("Enter");
    await expect(page).toHaveURL(/highlight=gpt-6-astra/);
    await page.goto("/");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.max(
              document.body.scrollWidth,
              document.documentElement.scrollWidth,
            ) <=
            document.documentElement.clientWidth + 1,
        ),
      )
      .toBe(true);
  });

  test("switches between all three capability indexes", async ({
    page,
    request,
  }) => {
    // Every profile uses one median order and the same model population.
    const expectedLeader = new Map<string, string>();
    for (const kind of ["mixed", "agentic", "chat"] as const) {
      const response = await request.get(`/api/v1/index/${kind}`);
      expect(response.ok()).toBeTruthy();
      const payload = (await response.json()) as {
        data: {
          rows: Array<{
            modelName: string;
            provisional: boolean;
            score: number | null;
            tier: string | null;
          }>;
        };
      };
      expect(payload.data.rows.length).toBeGreaterThan(0);
      for (const row of payload.data.rows) {
        expect(
          row.provisional ? row.score === null : typeof row.score === "number",
        ).toBeTruthy();
        expect(["verified", "ranked", "provisional", null]).toContain(row.tier);
      }
      expectedLeader.set(kind, payload.data.rows[0]!.modelName);
    }

    await page.goto("/");

    const mixed = page.getByRole("button", { name: "Mixed" });
    const agentic = page.getByRole("button", { name: "Agentic" });
    const chat = page.getByRole("button", { name: "Chat" });
    await expect(
      page.getByRole("checkbox", { name: "Ranked only" }),
    ).toHaveCount(0);
    const initialCount = await page
      .locator("#leaderboard-table tbody tr")
      .count();
    const firstModel = page
      .locator("#leaderboard-table tbody tr")
      .first()
      .locator(".model-link");
    const expectLeader = async (kind: "mixed" | "agentic" | "chat") => {
      const expected = expectedLeader.get(kind)!;
      await expect(firstModel).toHaveText(expected);
      await expect(page.locator("#leaderboard-table tbody tr")).toHaveCount(
        initialCount,
      );
      await expect(
        page.locator('#leaderboard-table a[href="/models/gemini-3.8-flash"]'),
      ).toBeVisible();
      for (const slug of ["claude-fable-5.1", "gpt-6-astra"]) {
        await expect(
          page.locator(`#leaderboard-table a[href="/models/${slug}"]`),
        ).toHaveCount(1);
      }
    };

    await expect(mixed).toHaveAttribute("aria-pressed", "true");
    await expectLeader("mixed");

    await agentic.click();
    await expect(agentic).toHaveAttribute("aria-pressed", "true");
    await expect(mixed).toHaveAttribute("aria-pressed", "false");
    await expectLeader("agentic");
    await expect(
      page.getByText("Agentic index", { exact: true }),
    ).toBeVisible();

    await chat.click();
    await expect(chat).toHaveAttribute("aria-pressed", "true");
    await expect(agentic).toHaveAttribute("aria-pressed", "false");
    await expectLeader("chat");
    await expect(page.getByText("Chat index", { exact: true })).toBeVisible();
  });

  test("shows fitted-cell coverage as covered / fitted benchmarks", async ({
    page,
    request,
  }) => {
    const response = await request.get("/api/v1/index/mixed");
    const payload = (await response.json()) as {
      data: {
        rows: Array<{
          modelSlug: string;
          provisional: boolean;
          coverageCount: number | null;
          coverageTotal: number | null;
        }>;
      };
    };
    const row = payload.data.rows.find(
      (candidate) => !candidate.provisional && candidate.coverageTotal !== null,
    );
    test.skip(
      !row,
      "snapshot publishes no ranked row with fitted-cell coverage",
    );
    expect(row!.coverageCount).toBeLessThanOrEqual(row!.coverageTotal!);

    await page.goto("/");
    const tableRow = page.locator("#leaderboard-table tbody tr", {
      has: page.locator(`a[href="/models/${row!.modelSlug}"]`),
    });
    await expect(tableRow.locator(".coverage-dots")).toHaveText(
      `${row!.coverageCount}/${row!.coverageTotal}`,
    );
  });

  test("opens a model evidence page from the leaderboard", async ({
    page,
    request,
  }) => {
    const [resultsResponse, modelsResponse, mixedResponse] = await Promise.all([
      request.get("/api/v1/results"),
      request.get("/api/v1/models"),
      request.get("/api/v1/index/mixed"),
    ]);
    const resultsPayload = (await resultsResponse.json()) as {
      data: Array<{ modelSlug: string }>;
    };
    const modelsPayload = (await modelsResponse.json()) as {
      data: Array<{ slug: string; name: string }>;
    };
    const mixedPayload = (await mixedResponse.json()) as {
      data: { rows: Array<{ modelSlug: string; provisional: boolean }> };
    };
    const evidencedModels = new Set(
      resultsPayload.data.map((result) => result.modelSlug),
    );
    const rankedModels = new Set(
      mixedPayload.data.rows
        .filter((row) => !row.provisional)
        .map((row) => row.modelSlug),
    );
    const expectedModel = modelsPayload.data.find(
      (model) =>
        rankedModels.has(model.slug) && evidencedModels.has(model.slug),
    );
    expect(expectedModel).toBeTruthy();

    await page.goto("/");
    const modelLink = page.locator(
      `#leaderboard-table a[href="/models/${expectedModel!.slug}"]`,
    );
    await expect(modelLink).toBeVisible();
    const modelHref = await modelLink.getAttribute("href");
    expect(modelHref).toMatch(/^\/models\//u);
    await modelLink.click();

    await page.waitForURL((url) => url.pathname === modelHref);
    await expect(
      page.getByRole("heading", { level: 1, name: expectedModel!.name }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Evidence tier" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Benchmark evidence" }),
    ).toBeVisible();
    await expect(
      page.locator(".evidence-table tbody tr").first(),
    ).toBeVisible();
  });

  test("renders a benchmark audit page and links back to a model", async ({
    page,
    request,
  }) => {
    const [resultsResponse, benchmarksResponse, mixedResponse] =
      await Promise.all([
        request.get("/api/v1/results"),
        request.get("/api/v1/benchmarks"),
        request.get("/api/v1/index/mixed"),
      ]);
    expect(resultsResponse.ok()).toBeTruthy();
    expect(benchmarksResponse.ok()).toBeTruthy();
    const resultsPayload = (await resultsResponse.json()) as {
      data: Array<{ benchmarkSlug: string; modelSlug: string }>;
    };
    const benchmarksPayload = (await benchmarksResponse.json()) as {
      data: Array<{ slug: string; name: string }>;
    };
    const mixedPayload = (await mixedResponse.json()) as {
      data: { rows: Array<{ modelSlug: string }> };
    };
    const rankedModels = new Set(
      mixedPayload.data.rows.map((row) => row.modelSlug),
    );
    const result = resultsPayload.data.find((item) =>
      rankedModels.has(item.modelSlug),
    );
    expect(result).toBeTruthy();
    const benchmark = benchmarksPayload.data.find(
      (item) => item.slug === result!.benchmarkSlug,
    );
    expect(benchmark).toBeTruthy();

    await page.goto(`/benchmarks/${benchmark!.slug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: benchmark!.name }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "How this benchmark is modelled" })
      .click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Benchmark parameters" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Model results" }),
    ).toBeVisible();

    const modelLink = page
      .locator(`#main-content table a[href="/models/${result!.modelSlug}"]`)
      .first();
    await expect(modelLink).toBeVisible();
    const modelHref = await modelLink.getAttribute("href");
    expect(modelHref).toBe(`/models/${result!.modelSlug}`);
    await modelLink.click();
    await page.waitForURL((url) => url.pathname === modelHref);
  });

  test("navigates through the command palette", async ({ page }) => {
    await page.goto("/");
    // A click waits for hydration; then verify the global keyboard shortcut.
    await page
      .getByRole("button", { name: "Search data", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Search data" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+K");

    const dialog = page.getByRole("dialog", { name: "Search data" });
    const search = dialog.getByPlaceholder("Search models, benchmarks, pages…");
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();

    await search.fill("methodology");
    await expect(
      dialog.getByRole("option", { name: /Methodology/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/methodology$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "How the index works" }),
    ).toBeVisible();
    await expect(
      page.getByText("ActualAnalysis Capability Index · version 1.4.1", {
        exact: false,
      }),
    ).toBeVisible();
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
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("actualanalysis-theme")),
      )
      .toBe("dark");

    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "dark");
    await clickVisibleThemeToggle("Switch to light theme");
    await expect(root).toHaveAttribute("data-theme", "light");
  });
});

test.describe("ActualAnalysis API v1", () => {
  test("serves a versioned, redistributable index contract", async ({
    request,
  }) => {
    const rootResponse = await request.get("/api/v1");
    expect(rootResponse.ok()).toBeTruthy();
    expect(rootResponse.headers()["access-control-allow-origin"]).toBe("*");
    expect(rootResponse.headers()["x-ratelimit-limit"]).toBe("120");

    const root = await rootResponse.json();
    expect(root.meta).toMatchObject({
      published: expect.any(Boolean),
      status: expect.stringMatching(/^(fixture|snapshot)$/u),
    });
    expect(root.meta.disclaimer).toEqual(expect.any(String));
    expect(root.data).toMatchObject({
      name: "ActualAnalysis API",
      version: "v1",
    });
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
          coverage: expect.any(Number),
          provisional: expect.any(Boolean),
        }),
      );
      const first = payload.data.rows[0] as {
        score: number | null;
        ciLow: number | null;
        ciHigh: number | null;
      };
      expect(
        first.score === null || typeof first.score === "number",
      ).toBeTruthy();
      expect(typeof first.ciLow).toBe("number");
      expect(typeof first.ciHigh).toBe("number");
    }

    const modelsResponse = await request.get("/api/v1/models");
    expect(modelsResponse.ok()).toBeTruthy();
    const models = await modelsResponse.json();
    expect(models.data.length).toBeGreaterThan(0);
    expect(models.data[0]).not.toHaveProperty("speed");

    const invalidResponse = await request.get("/api/v1/index/not-an-index");
    expect(invalidResponse.status()).toBe(404);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      data: {
        error: "Unknown index kind.",
        allowed: ["mixed", "agentic", "chat"],
      },
    });

    const preflight = await request.fetch("/api/v1/models", {
      method: "OPTIONS",
    });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()["access-control-allow-methods"]).toContain(
      "GET",
    );
  });
});
