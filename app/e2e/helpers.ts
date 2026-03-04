import { type Page } from "@playwright/test";

/** Navigate to a page with the given locale prefix. */
export async function gotoWithLocale(page: Page, path: string, locale = "en") {
  const url = `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
  await page.goto(url);
}

/** Wait for any loading skeletons to disappear. */
export async function waitForLoad(page: Page) {
  // Wait for main content to be present
  await page.waitForSelector("main", { state: "visible", timeout: 10000 });
}

/** Switch locale using the locale switcher button. */
export async function switchLocale(page: Page, targetLocale: "en" | "pt-BR" | "es") {
  const label = targetLocale === "pt-BR" ? "BR" : targetLocale === "es" ? "ES" : "EN";
  const switcher = page.getByRole("button", { name: /EN|BR|ES/i });
  if (await switcher.isVisible()) {
    await switcher.click();
    const option = page.getByText(label, { exact: true });
    if (await option.isVisible()) {
      await option.click();
    }
  }
}
