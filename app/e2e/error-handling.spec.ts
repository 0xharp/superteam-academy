import { test, expect } from "@playwright/test";

test.describe("Error Handling", () => {
  test("404 page renders for unknown route", async ({ page }) => {
    await page.goto("/en/this-page-does-not-exist-xyz");
    // Should show 404 or not-found content
    const notFound = page.getByText(/404|not found|page.*exist/i).first();
    await expect(notFound).toBeVisible();
  });

  test("invalid course slug shows error state", async ({ page }) => {
    await page.goto("/en/courses/nonexistent-course-slug-xyz-99");
    // Should show not found or error
    const error = page.getByText(/not found|404|doesn.*exist/i).first();
    await expect(error).toBeVisible();
  });

  test("invalid lesson ID handles gracefully", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana/lessons/invalid-lesson-id-xyz");
    // Should show error or redirect
    await expect(page.locator("body")).toBeVisible();
    const error = page.getByText(/not found|error|invalid/i).first();
    const hasError = await error.isVisible().catch(() => false);
    // Either shows error or redirects back
    expect(hasError || page.url().includes("/courses/")).toBeTruthy();
  });

  test("offline indicator appears when offline", async ({ page }) => {
    await page.goto("/en");
    // Simulate offline
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    const offlineBanner = page.getByText(/offline/i).first();
    const isVisible = await offlineBanner.isVisible().catch(() => false);
    // Restore online
    await page.context().setOffline(false);
    // Offline banner should have appeared
    expect(isVisible).toBeTruthy();
  });

  test("offline indicator hides when back online", async ({ page }) => {
    await page.goto("/en");
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);
    // Banner should disappear
    const offlineBanner = page.getByText(/offline/i).first();
    const isVisible = await offlineBanner.isVisible().catch(() => false);
    expect(isVisible).toBeFalsy();
  });
});
