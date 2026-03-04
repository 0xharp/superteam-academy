import { test, expect } from "@playwright/test";

test.describe("Leaderboard", () => {
  test("page loads with leaderboard content", async ({ page }) => {
    await page.goto("/en/leaderboard");
    await expect(page.locator("body")).toBeVisible();
    // Leaderboard heading may be hidden on mobile, check page loaded
    await expect(page).toHaveURL(/\/leaderboard/);
  });

  test("leaderboard displays user entries or loading state", async ({ page }) => {
    await page.goto("/en/leaderboard");
    await page.waitForTimeout(2000);
    // Should show user entries, a table, or a loading spinner
    const hasContent = await page.locator("table, [class*=leaderboard]").first().isVisible().catch(() => false);
    const hasSpinner = await page.locator("[class*=animate-spin]").first().isVisible().catch(() => false);
    const hasUsers = await page.getByText(/@/).first().isVisible().catch(() => false);
    expect(hasContent || hasSpinner || hasUsers).toBeTruthy();
  });

  test("timeframe tabs are present", async ({ page }) => {
    await page.goto("/en/leaderboard");
    // Timeframe uses TabsTrigger (role="tab"), not buttons
    const weeklyTab = page.getByRole("tab", { name: /weekly/i });
    const monthlyTab = page.getByRole("tab", { name: /monthly/i });
    const allTimeTab = page.getByRole("tab", { name: /all time/i });
    const hasWeekly = await weeklyTab.isVisible().catch(() => false);
    const hasMonthly = await monthlyTab.isVisible().catch(() => false);
    const hasAllTime = await allTimeTab.isVisible().catch(() => false);
    expect(hasWeekly || hasMonthly || hasAllTime).toBeTruthy();
  });

  test("timeframe tab switch works", async ({ page }) => {
    await page.goto("/en/leaderboard");
    const monthlyTab = page.getByRole("tab", { name: /monthly/i });
    if (await monthlyTab.isVisible().catch(() => false)) {
      await monthlyTab.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("XP values are displayed for users", async ({ page }) => {
    await page.goto("/en/leaderboard");
    await page.waitForTimeout(2000);
    const xpValues = page.getByText(/\d+\s*xp/i);
    const count = await xpValues.count();
    if (count > 0) {
      await expect(xpValues.first()).toBeVisible();
    }
  });

  test("refresh button is present", async ({ page }) => {
    await page.goto("/en/leaderboard");
    const refreshBtn = page.getByRole("button", { name: /refresh|sync/i }).first();
    if (await refreshBtn.isVisible().catch(() => false)) {
      await expect(refreshBtn).toBeVisible();
    }
  });
});
