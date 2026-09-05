import { test, expect } from "@playwright/test";

test("shows paired uncertainty for the selected preliminary Chat comparison", async ({ page }) => {
  await page.goto("compare/?index=chat&highlight=gpt-5.6-sol&highlight=gpt-5.5");
  await expect(page.getByRole("combobox", { name: "First model", exact: true })).toContainText("GPT-5.6 Sol");
  await expect(page.getByRole("combobox", { name: "Second model", exact: true })).toHaveText("GPT-5.5");
  await expect(page.locator(".comparison-verdict")).toContainText(/probability.*\d+%|\d+%.*probability/);
  await expect(page.locator(".comparison-verdict")).not.toContainText("unavailable");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("loads the branded static site, assets and snapshot resources", async ({
  page,
  request,
  baseURL,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(baseURL!))
      failures.push(response.url());
  });
  await page.goto("./");
  await expect(page.locator(".brand-logo").first()).toBeVisible();
  await expect(page.locator("#leaderboard-table tbody tr")).toHaveCount(126);
  for (const kind of ["Agentic", "Chat", "Mixed"]) {
    await page.getByRole("button", { name: kind, exact: true }).click();
    await expect(page.locator("#leaderboard-table tbody tr")).toHaveCount(126);
  }
  const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  const favicon = await request.get(
    new URL((await icon.getAttribute("href"))!, baseURL!).href,
  );
  expect(favicon.ok()).toBe(true);
  expect(await favicon.text()).toContain("twin A monogram");
  const ogUrl = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(ogUrl).toMatch(/\/actualanalysis\/brand\/social-card\.png$/);
  const og = await request.get(new URL("brand/social-card.png", baseURL!).href);
  expect(og.headers()["content-type"]).toContain("image/png");
  const json = await request.get("api/v1/models.json");
  expect(json.ok()).toBe(true);
  const raw = await json.text();
  expect(JSON.parse(raw).data).toHaveLength(126);
  expect(raw).not.toMatch(/usdPerTask|tokensPerSecond/);
  await page
    .getByRole("link", { name: "Compare", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/actualanalysis\/compare\//);
  await page
    .getByRole("button", { name: "Price & speed", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Runtime metric" }),
  ).toContainText("AA cost per task");
  await expect(
    page.getByRole("img", { name: "Mixed vs AA cost per task", exact: true }),
  ).toBeVisible();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.goto("benchmarks/critpt/");
  await expect(
    page.getByRole("heading", { name: "CritPt", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "Artificial Analysis", exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("models/muse-spark-1.3/");
  await expect(
    page.getByRole("heading", { name: "Muse Spark 1.3", exact: true }),
  ).toBeVisible();
  await page.goto("download/");
  const download = page.getByRole("link", { name: "Index CSV", exact: true });
  const response = await request.get(
    new URL((await download.getAttribute("href"))!, baseURL!).href,
  );
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("modelId");
  expect(failures).toEqual([]);
});
