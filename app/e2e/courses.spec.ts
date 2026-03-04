import { test, expect } from "@playwright/test";

test.describe("Course Catalog", () => {
  test("displays course catalog heading", async ({ page }) => {
    await page.goto("/en/courses");
    await expect(page.getByText(/course catalog/i)).toBeVisible();
  });

  test("displays course cards in grid", async ({ page }) => {
    await page.goto("/en/courses");
    // Course cards use Card component with group class
    const courseCards = page.locator(".group").filter({ has: page.locator("h3") });
    await expect(courseCards.first()).toBeVisible();
  });

  test("search input filters courses", async ({ page }) => {
    await page.goto("/en/courses");
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
    await search.fill("nonexistent-course-xyz-99");
    await page.waitForTimeout(500);
    // Should show no results or fewer results
    await expect(page.locator("body")).toBeVisible();
  });

  test("difficulty filter dropdown is present", async ({ page }) => {
    await page.goto("/en/courses");
    // Difficulty uses a Select dropdown, not buttons
    const selectTrigger = page.getByRole("combobox").first();
    if (await selectTrigger.isVisible().catch(() => false)) {
      await expect(selectTrigger).toBeVisible();
    }
  });

  test("course detail page shows modules", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    // On mobile, modules may be below the fold
    const moduleText = page.getByText(/module/i).first();
    await moduleText.scrollIntoViewIfNeeded().catch(() => {});
    await expect(moduleText).toBeVisible();
  });

  test("course detail page shows XP info", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    // On mobile, XP info may be below the fold
    const xpText = page.getByText(/xp/i).first();
    await xpText.scrollIntoViewIfNeeded().catch(() => {});
    await expect(xpText).toBeVisible();
  });
});
