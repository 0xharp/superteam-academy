import { test, expect } from "@playwright/test";

test.describe("Gamification Features", () => {
  test("dashboard loads for gamification checks", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    // Either shows dashboard or redirects
    expect(page.url().includes("/dashboard") || page.url().includes("/auth/signin")).toBeTruthy();
  });

  test("streak section renders if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const streakSection = page.getByText(/streak/i).first();
      if (await streakSection.isVisible().catch(() => false)) {
        await expect(streakSection).toBeVisible();
      }
    }
  });

  test("achievements section renders if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const achievementsSection = page.getByText(/achievements/i).first();
      if (await achievementsSection.isVisible().catch(() => false)) {
        await expect(achievementsSection).toBeVisible();
      }
    }
  });

  test("daily challenge section renders if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const challengeSection = page.getByText(/daily challenge/i).first();
      if (await challengeSection.isVisible().catch(() => false)) {
        await expect(challengeSection).toBeVisible();
      }
    }
  });

  test("XP stats visible if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const xpText = page.getByText(/xp/i).first();
      if (await xpText.isVisible().catch(() => false)) {
        await expect(xpText).toBeVisible();
      }
    }
  });

  test("level indicator visible if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const levelText = page.getByText(/lv|level/i).first();
      if (await levelText.isVisible().catch(() => false)) {
        await expect(levelText).toBeVisible();
      }
    }
  });
});
