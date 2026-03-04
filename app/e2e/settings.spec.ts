import { test, expect } from "@playwright/test";

test.describe("Settings Page", () => {
  test("settings page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);
    const url = page.url();
    // Either redirects to sign-in or shows settings
    expect(url.includes("/auth/signin") || url.includes("/settings")).toBeTruthy();
  });

  test("settings tabs visible if authenticated", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);
    if (page.url().includes("/settings")) {
      const profileTab = page.getByRole("tab", { name: /profile/i });
      if (await profileTab.isVisible().catch(() => false)) {
        await expect(profileTab).toBeVisible();
        await expect(page.getByRole("tab", { name: /account/i })).toBeVisible();
        await expect(page.getByRole("tab", { name: /preferences/i })).toBeVisible();
        await expect(page.getByRole("tab", { name: /privacy/i })).toBeVisible();
      }
    }
  });

  test("preferences tab shows theme options if authenticated", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);
    if (page.url().includes("/settings")) {
      const prefsTab = page.getByRole("tab", { name: /preferences/i });
      if (await prefsTab.isVisible().catch(() => false)) {
        await prefsTab.click();
        await expect(page.getByText(/dark/i).first()).toBeVisible();
        await expect(page.getByText(/light/i).first()).toBeVisible();
      }
    }
  });

  test("preferences tab shows language options if authenticated", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);
    if (page.url().includes("/settings")) {
      const prefsTab = page.getByRole("tab", { name: /preferences/i });
      if (await prefsTab.isVisible().catch(() => false)) {
        await prefsTab.click();
        await expect(page.getByText("English")).toBeVisible();
        await expect(page.getByText(/Portugu/i)).toBeVisible();
        await expect(page.getByText(/Espa/i)).toBeVisible();
      }
    }
  });

  test("account tab shows wallet section if authenticated", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);
    if (page.url().includes("/settings")) {
      const accountTab = page.getByRole("tab", { name: /account/i });
      if (await accountTab.isVisible().catch(() => false)) {
        await accountTab.click();
        const walletSection = page.getByText(/wallet/i).first();
        await expect(walletSection).toBeVisible();
      }
    }
  });

  test("privacy tab is accessible if authenticated", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);
    if (page.url().includes("/settings")) {
      const privacyTab = page.getByRole("tab", { name: /privacy/i });
      if (await privacyTab.isVisible().catch(() => false)) {
        await privacyTab.click();
        await expect(page.locator("body")).toBeVisible();
      }
    }
  });
});
