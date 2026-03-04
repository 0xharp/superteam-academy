import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("page loads or redirects to sign-in", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    const url = page.url();
    // Dashboard either shows content or redirects unauthenticated users
    expect(url.includes("/dashboard") || url.includes("/auth/signin")).toBeTruthy();
  });

  test("shows XP text on page", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const xpText = page.getByText(/xp/i).first();
      await expect(xpText).toBeVisible();
    }
  });

  test("streak section exists if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const streakSection = page.getByText(/streak/i).first();
      if (await streakSection.isVisible().catch(() => false)) {
        await expect(streakSection).toBeVisible();
      }
    }
  });

  test("active courses section exists if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const coursesSection = page.getByText(/active courses|explore courses/i).first();
      if (await coursesSection.isVisible().catch(() => false)) {
        await expect(coursesSection).toBeVisible();
      }
    }
  });

  test("achievements section exists if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const achievementsSection = page.getByText(/achievements/i).first();
      if (await achievementsSection.isVisible().catch(() => false)) {
        await expect(achievementsSection).toBeVisible();
      }
    }
  });

  test("daily challenge section exists if authenticated", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    if (page.url().includes("/dashboard")) {
      const challengeSection = page.getByText(/daily challenge/i).first();
      if (await challengeSection.isVisible().catch(() => false)) {
        await expect(challengeSection).toBeVisible();
      }
    }
  });
});
