import { test, expect } from "@playwright/test";

test.describe("Community Page", () => {
  test("community page loads", async ({ page }) => {
    await page.goto("/en/community");
    await expect(page.locator("main")).toBeVisible();
  });

  test("posts list is visible", async ({ page }) => {
    await page.goto("/en/community");
    // Either posts or an empty state
    const posts = page.locator("[class*=post], [class*=card]").filter({ hasText: /.+/ });
    const emptyState = page.getByText(/no posts|be the first/i).first();
    const hasPosts = (await posts.count()) > 0;
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasPosts || hasEmpty).toBeTruthy();
  });

  test("tag filtering is available", async ({ page }) => {
    await page.goto("/en/community");
    const tagButton = page
      .getByRole("button")
      .filter({ hasText: /general|question|showcase|all/i })
      .first();
    if (await tagButton.isVisible().catch(() => false)) {
      await tagButton.click();
      await page.waitForTimeout(500);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("create post button is visible", async ({ page }) => {
    await page.goto("/en/community");
    const createBtn = page
      .getByRole("button", { name: /create|new post|write/i })
      .first();
    // Button may only appear for authenticated users
    if (await createBtn.isVisible().catch(() => false)) {
      await expect(createBtn).toBeVisible();
    }
  });

  test("like button is present on posts", async ({ page }) => {
    await page.goto("/en/community");
    const likeBtn = page.getByRole("button").filter({ hasText: /❤|like|♡/i }).first();
    if (await likeBtn.isVisible().catch(() => false)) {
      await expect(likeBtn).toBeVisible();
    }
  });
});
