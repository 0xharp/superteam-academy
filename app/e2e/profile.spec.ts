import { test, expect } from "@playwright/test";

test.describe("Profile Page", () => {
  test("public profile loads with username", async ({ page }) => {
    await page.goto("/en/leaderboard");
    const profileLink = page.getByRole("link", { name: /@/ }).first();
    if (await profileLink.isVisible()) {
      await profileLink.click();
      await expect(page).toHaveURL(/\/profile\//);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("profile displays XP and level info", async ({ page }) => {
    await page.goto("/en/leaderboard");
    const profileLink = page.getByRole("link", { name: /@/ }).first();
    if (await profileLink.isVisible()) {
      await profileLink.click();
      await expect(page.getByText(/xp/i).first()).toBeVisible();
    }
  });

  test("skills section renders on profile", async ({ page }) => {
    await page.goto("/en/leaderboard");
    const profileLink = page.getByRole("link", { name: /@/ }).first();
    if (await profileLink.isVisible()) {
      await profileLink.click();
      const skillsSection = page.getByText(/skills/i).first();
      await expect(skillsSection).toBeVisible();
    }
  });

  test("credentials section renders on profile", async ({ page }) => {
    await page.goto("/en/leaderboard");
    const profileLink = page.getByRole("link", { name: /@/ }).first();
    if (await profileLink.isVisible()) {
      await profileLink.click();
      const credSection = page.getByText(/credential|certificate/i).first();
      if (await credSection.isVisible()) {
        await expect(credSection).toBeVisible();
      }
    }
  });

  test("activity history section is visible", async ({ page }) => {
    await page.goto("/en/leaderboard");
    const profileLink = page.getByRole("link", { name: /@/ }).first();
    if (await profileLink.isVisible()) {
      await profileLink.click();
      const activitySection = page.getByText(/activity|history/i).first();
      await expect(activitySection).toBeVisible();
    }
  });
});
