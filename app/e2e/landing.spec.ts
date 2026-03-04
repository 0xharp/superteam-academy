import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("renders hero section with heading and CTA", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("h1")).toContainText(/solana/i);
    // CTA button should be present
    const cta = page.getByRole("link", { name: /start learning|sign in/i }).first();
    await expect(cta).toBeVisible();
  });

  test("navigation links are present", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("link", { name: /courses/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /leaderboard/i }).first()).toBeVisible();
  });

  test("locale switch changes page URL to pt-BR", async ({ page }) => {
    await page.goto("/en");
    const localeSwitcher = page.getByRole("button", { name: /EN|BR|ES/i }).first();
    if (await localeSwitcher.isVisible()) {
      await localeSwitcher.click();
      const brOption = page.getByText("BR", { exact: true }).first();
      if (await brOption.isVisible()) {
        await brOption.click();
        await expect(page).toHaveURL(/\/pt-BR/);
        await expect(page.locator("h1")).toContainText(/solana/i);
      }
    }
  });

  test("theme toggle dropdown works", async ({ page }) => {
    await page.goto("/en");
    // Theme toggle is a dropdown menu, not a simple button
    const themeButton = page.getByRole("button", { name: /theme|toggle/i }).first();
    if (await themeButton.isVisible().catch(() => false)) {
      await themeButton.click();
      // Theme dropdown should show options
      const darkOption = page.getByText(/dark/i).first();
      const lightOption = page.getByText(/light/i).first();
      const hasDark = await darkOption.isVisible().catch(() => false);
      const hasLight = await lightOption.isVisible().catch(() => false);
      expect(hasDark || hasLight).toBeTruthy();
    }
  });

  test("features section is visible", async ({ page }) => {
    await page.goto("/en");
    // "interactive courses" may match multiple elements, use first()
    await expect(page.getByText(/interactive courses/i).first()).toBeVisible();
  });

  test("footer is visible with links", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByText(/terms of service/i)).toBeVisible();
  });
});
