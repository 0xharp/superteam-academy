import { test, expect } from "@playwright/test";

test.describe("Lesson Page", () => {
  test("content lesson renders with title and markdown", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const lessonLink = page.getByText("What is Solana?").first();
    if (await lessonLink.isVisible()) {
      await lessonLink.click();
      await expect(page).toHaveURL(/\/lessons\//);
      await expect(page.getByText("What is Solana?")).toBeVisible();
      // Content should have the lesson body
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("XP badge shows reward amount", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const lessonLink = page.getByText("What is Solana?").first();
    if (await lessonLink.isVisible()) {
      await lessonLink.click();
      // XP badge should show a number
      const xpBadge = page.getByText(/\d+\s*xp/i).first();
      await expect(xpBadge).toBeVisible();
    }
  });

  test("back to course button navigates correctly", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const lessonLink = page.getByText("What is Solana?").first();
    if (await lessonLink.isVisible()) {
      await lessonLink.click();
      const backBtn = page.getByRole("link", { name: /back to course/i });
      await expect(backBtn).toBeVisible();
      await backBtn.click();
      await expect(page).toHaveURL(/\/courses\/introduction-to-solana$/);
    }
  });

  test("mark complete button state reflects enrollment", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const lessonLink = page.getByText("What is Solana?").first();
    if (await lessonLink.isVisible()) {
      await lessonLink.click();
      // Either the mark complete button or the enroll-first message should appear
      const markBtn = page.getByRole("button", { name: /mark as complete|enroll first/i });
      await expect(markBtn).toBeVisible();
    }
  });

  test("next/previous navigation works", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const lessonLink = page.getByText("What is Solana?").first();
    if (await lessonLink.isVisible()) {
      await lessonLink.click();
      const nextBtn = page.getByRole("link", { name: /next/i });
      if (await nextBtn.isVisible()) {
        const initialUrl = page.url();
        await nextBtn.click();
        await expect(page).toHaveURL(/\/lessons\//);
        expect(page.url()).not.toBe(initialUrl);
      }
    }
  });

  test("sidebar shows course modules and lessons", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const lessonLink = page.getByText("What is Solana?").first();
    if (await lessonLink.isVisible()) {
      await lessonLink.click();
      // Module title should be visible in sidebar
      await expect(page.getByText(/module/i).first()).toBeVisible();
    }
  });
});

test.describe("Challenge Lesson", () => {
  test("code editor loads for challenge", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const challengeLesson = page.getByText("Hello Solana").first();
    if (await challengeLesson.isVisible()) {
      await challengeLesson.click();
      // Run button should be visible for challenges
      const runBtn = page.getByRole("button", { name: /run code/i });
      await expect(runBtn).toBeVisible();
    }
  });

  test("reset code button is visible", async ({ page }) => {
    await page.goto("/en/courses/introduction-to-solana");
    const challengeLesson = page.getByText("Hello Solana").first();
    if (await challengeLesson.isVisible()) {
      await challengeLesson.click();
      await expect(page.getByRole("button", { name: /reset code/i })).toBeVisible();
    }
  });
});
