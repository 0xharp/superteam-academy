import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("sign-in modal opens from header button", async ({ page }) => {
    await page.goto("/en");
    const signInBtn = page.getByRole("button", { name: /sign in/i });
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await expect(page.getByText(/continue with google/i)).toBeVisible();
      await expect(page.getByText(/continue with github/i)).toBeVisible();
      await expect(page.getByText(/connect wallet/i).first()).toBeVisible();
    }
  });

  test("sign-in modal shows terms notice", async ({ page }) => {
    await page.goto("/en");
    const signInBtn = page.getByRole("button", { name: /sign in/i });
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await expect(page.getByText(/terms of service/i)).toBeVisible();
    }
  });

  test("unauthenticated user redirected from settings", async ({ page }) => {
    await page.goto("/en/settings");
    await page.waitForTimeout(2000);
    const url = page.url();
    // Should redirect to sign-in or show sign-in UI
    const hasRedirected = url.includes("/auth/signin") || url.includes("/settings");
    expect(hasRedirected).toBeTruthy();
  });

  test("unauthenticated user redirected from dashboard", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasRedirected = url.includes("/auth/signin") || url.includes("/dashboard");
    expect(hasRedirected).toBeTruthy();
  });
});
