import { test, expect } from "@playwright/test";
test.beforeAll(async ({ request }) => {
  const response = await request.get("/api/session");
  const session = await response.json();
  expect(session.aiMode, "Browser tests require the explicit deterministic fallback").toBe(
    "DETERMINISTIC",
  );
  expect(session.mode, "Browser tests require an explicitly SIMULATED server").toBe("SIMULATED");
});
test("human intent to simulated captured decision receipt", async ({ page }) => {
  const name = `E2E workstation ${Date.now()}`;
  await page.goto("/mandates/new");
  await expect(page.getByText("DETERMINISTIC FALLBACK", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Mandate name", { exact: true }).fill(name);
  await page
    .getByLabel("What should your agent be allowed to buy?", { exact: true })
    .fill("Buy 3 new 27-inch 1440p monitors under $700. Automatically purchase up to $600.");
  await page.getByRole("button", { name: "Generate Policy", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed this policy and explicitly authorize its spending limits and constraints.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Activate mandate", exact: true }).click();
  await page.getByRole("link", { name: "Open shopping agent", exact: true }).click();
  await page
    .getByLabel("Active spending mandate", { exact: true })
    .selectOption({ label: `${name} · v1` });
  await page.getByRole("button", { name: "Evaluate Purchase", exact: true }).click();
  await page.waitForURL(/\/transactions\/[a-f0-9-]+/);
  await expect(page.getByText("ALLOW", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$537.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Simulate checkout", exact: true }).click();
  await expect(page.getByText("SIMULATED CAPTURED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^SIM-CAPTURE-/).first()).toBeVisible();
});
test("prompt injection is independently blocked and PayPal is not executed", async ({ page }) => {
  await page.goto("/attack-lab");
  await page.getByRole("button", { name: "Scenario E: Prompt injection", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed and authorize this isolated lab policy for this scenario.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Run scenario", exact: true }).click();
  await expect(page.getByText("PAYPAL NOT EXECUTED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("MAX_TOTAL_EXCEEDED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("UNAUTHORIZED_ITEM", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("FORBIDDEN_ITEM", { exact: true }).first()).toBeVisible();
});
test("operator can approve a threshold request and capture the simulated payment", async ({
  page,
}) => {
  await page.goto("/attack-lab");
  await page.getByRole("button", { name: "Scenario D: Human approval", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed and authorize this isolated lab policy for this scenario.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Run scenario", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Simulate checkout", exact: true }).click();
  await expect(page.getByText("SIMULATED CAPTURED", { exact: true }).first()).toBeVisible();
});
test("mobile navigation and dashboard stay within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Overview|Operations|Dashboard|control/i }).first(),
  ).toBeVisible();
  const grid = page.locator(".transaction-grid");
  await grid.scrollIntoViewIfNeeded();
  await expect(grid.getByRole("columnheader", { name: "TRANSACTION", exact: true })).toBeVisible();
  const transactionCell = grid.locator('.ag-center-cols-container .ag-row [col-id="id"]').first();
  await expect(transactionCell).toBeVisible();
  await expect(transactionCell).toHaveText(/^TX-[A-F0-9]{8}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
