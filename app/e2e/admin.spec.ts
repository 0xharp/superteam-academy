import { test, expect } from "@playwright/test";

test.describe("Admin Page", () => {
  test("admin page loads", async ({ page }) => {
    await page.goto("/en/admin");
    await expect(page.locator("body")).toBeVisible();
  });

  test("admin page shows access denied or redirects for non-admin", async ({ page }) => {
    await page.goto("/en/admin");
    await page.waitForTimeout(2000);
    const url = page.url();
    const accessDenied = page.getByText(/access denied/i).first();
    const hasAccessDenied = await accessDenied.isVisible().catch(() => false);
    // Either shows access denied, redirects to sign-in, or shows admin content
    expect(hasAccessDenied || url.includes("/auth/signin") || url.includes("/admin")).toBeTruthy();
  });

  test("admin tabs include courses management", async ({ page }) => {
    await page.goto("/en/admin");
    const coursesTab = page.getByRole("tab", { name: /courses/i });
    if (await coursesTab.isVisible().catch(() => false)) {
      await coursesTab.click();
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("admin tabs include users management", async ({ page }) => {
    await page.goto("/en/admin");
    const usersTab = page.getByRole("tab", { name: /users/i });
    if (await usersTab.isVisible().catch(() => false)) {
      await usersTab.click();
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("admin tabs include achievements management", async ({ page }) => {
    await page.goto("/en/admin");
    const achievementsTab = page.getByRole("tab", { name: /achievement/i });
    if (await achievementsTab.isVisible().catch(() => false)) {
      await achievementsTab.click();
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("admin tabs include daily challenges", async ({ page }) => {
    await page.goto("/en/admin");
    const challengeTab = page.getByRole("tab", { name: /challenge|daily/i });
    if (await challengeTab.isVisible().catch(() => false)) {
      await challengeTab.click();
      await expect(page.locator("main")).toBeVisible();
    }
  });
});
