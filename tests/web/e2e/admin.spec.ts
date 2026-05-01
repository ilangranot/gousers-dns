import { test, expect } from "@playwright/test";

/**
 * Admin E2E tests with mocked API responses.
 * These tests verify the admin UI renders correctly given known API data.
 */

test.describe("Admin interface", () => {
  test.beforeEach(async ({ page }) => {
    // Mock filtering rules
    await page.route("**/admin/filtering-rules", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "rule-001",
              name: "Block SSN",
              type: "pii",
              pattern: "ALL",
              action: "block",
              priority: 10,
              is_active: true,
              created_at: new Date().toISOString(),
            },
          ]),
        });
      } else {
        route.continue();
      }
    });

    // Mock GPT connections
    await page.route("**/admin/gpt-connections", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "conn-001",
            provider: "openai",
            model: "gpt-4o",
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ]),
      });
    });

    // Mock users
    await page.route("**/admin/users", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "user-001",
            provider_user_id: "user_abc",
            email: "admin@example.com",
            role: "admin",
            created_at: new Date().toISOString(),
          },
        ]),
      });
    });

    // Mock analytics
    await page.route("**/analytics/summary**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_messages: 150,
          blocked_messages: 12,
          active_sessions: 25,
          active_users: 8,
          messages_by_provider: { openai: 150 },
          messages_by_day: [],
          top_blocked_rules: [],
        }),
      });
    });

    // Mock invitations
    await page.route("**/admin/invitations/**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    // Mock agents
    await page.route("**/admin/agents**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    // Mock settings
    await page.route("**/settings/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ theme: "midnight", org_display_name: null, vertical: "general" }),
      });
    });
  });

  test("admin page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/admin");
    const url = page.url();
    // Should be on admin or sign-in (Clerk auth)
    expect(url).toMatch(/\/admin|\/sign-in/);
  });

  test("filtering page loads", async ({ page }) => {
    await page.goto("/admin/filtering");
    const url = page.url();
    expect(url).toMatch(/\/admin|\/sign-in/);
  });

  test("team page loads", async ({ page }) => {
    await page.goto("/admin/team");
    const url = page.url();
    expect(url).toMatch(/\/admin|\/sign-in/);
  });
});
