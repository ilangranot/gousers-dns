import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows navbar with logo", async ({ page }) => {
    // Navbar / header should be present
    const nav = page.locator("nav, header").first();
    await expect(nav).toBeVisible();
  });

  test("has no DNS section", async ({ page }) => {
    const dnsHeading = page.locator("text=DNS").first();
    // The DNS section was removed from the landing page
    await expect(dnsHeading).not.toBeVisible();
  });

  test("has GitHub link", async ({ page }) => {
    const githubLink = page.locator("a[href*='github.com']");
    await expect(githubLink.first()).toBeVisible();
  });

  test("has sign-in link", async ({ page }) => {
    const signInLink = page.locator("a[href*='sign-in'], a:has-text('Sign In'), a:has-text('Sign in')");
    await expect(signInLink.first()).toBeVisible();
  });

  test("page title is not empty", async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
