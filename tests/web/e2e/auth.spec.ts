import { test, expect } from "@playwright/test";

const API = process.env.PLAYWRIGHT_API_URL || "http://localhost:8000";

// Unique email per test run so re-runs don't collide
const testEmail = `playwright-${Date.now()}@example.com`;
const testPassword = "TestPass123!";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock the register endpoint to return a canned success payload. */
function mockRegister(page: Parameters<typeof test>[1] extends { page: infer P } ? P : never, overrides?: { status?: number; body?: object }) {
  return page.route(`${API}/auth/register`, (route) => {
    route.fulfill({
      status: overrides?.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(
        overrides?.body ?? {
          id: "test-user-id",
          email: testEmail,
          orgKey: "personal_test-user-id",
          orgRole: "admin",
        }
      ),
    });
  });
}

// ---------------------------------------------------------------------------
// Sign-in page
// ---------------------------------------------------------------------------

test.describe("Sign-in page", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows a link to register", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /register/i })).toBeVisible();
  });

  test("shows a forgot-password link", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  });

  test("shows an error for wrong credentials", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 8000 });
  });

  test("unauthenticated users visiting /chat are redirected to /sign-in", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 8000 });
  });

  test("unauthenticated users visiting /admin are redirected to /sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Sign-up page
// ---------------------------------------------------------------------------

test.describe("Sign-up page", () => {
  test("renders the registration form", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("shows a link back to sign-in", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("shows an error when email is already registered", async ({ page }) => {
    await page.route(`${API}/auth/register`, (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Email already registered" }),
      })
    );
    await page.goto("/sign-up");
    await page.getByLabel(/email/i).fill("existing@example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/email already registered/i)).toBeVisible({ timeout: 8000 });
  });

  test("successful registration submits without a registration error", async ({ page }) => {
    // Mock the browser-side register call
    await page.route(`${API}/auth/register`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "new-user-id",
          email: testEmail,
          orgKey: "personal_new-user-id",
          orgRole: "admin",
        }),
      })
    );

    await page.goto("/sign-up");
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill(testPassword);
    await page.getByRole("button", { name: /create account/i }).click();

    // Registration itself succeeded — no "Registration failed" error visible.
    // The subsequent NextAuth sign-in is server-side and can't be mocked here;
    // the page will navigate to /chat (full stack) or stay on /sign-up (test env).
    await expect(page.getByText(/registration failed/i)).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/email already registered/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Forgot-password page
// ---------------------------------------------------------------------------

test.describe("Forgot-password page", () => {
  test("renders the email form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });

  test("shows confirmation message after submitting", async ({ page }) => {
    await page.route(`${API}/auth/forgot-password`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
    );
    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill("someone@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 8000 });
  });

  test("even an unregistered email shows the same confirmation (no enumeration)", async ({ page }) => {
    await page.route(`${API}/auth/forgot-password`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
    );
    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill("notregistered@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 8000 });
  });

  test("has a back-to-sign-in link", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("link", { name: /back to sign in/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Reset-password page
// ---------------------------------------------------------------------------

test.describe("Reset-password page", () => {
  test("shows an error when no token is provided", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/invalid reset link/i)).toBeVisible();
  });

  test("renders the new-password form when a token is present", async ({ page }) => {
    await page.goto("/reset-password?token=some-valid-looking-token");
    await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();
    await expect(page.getByLabel(/new password/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /set new password/i })).toBeVisible();
  });

  test("shows an error when passwords do not match", async ({ page }) => {
    await page.goto("/reset-password?token=test-token");
    await page.getByLabel(/new password/i).fill("password123");
    await page.getByLabel(/confirm password/i).fill("different123");
    await page.getByRole("button", { name: /set new password/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test("shows an error for an invalid or expired token", async ({ page }) => {
    await page.route(`${API}/auth/reset-password`, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid or expired reset link" }),
      })
    );
    await page.goto("/reset-password?token=expired-token");
    await page.getByLabel(/new password/i).fill("newpassword1");
    await page.getByLabel(/confirm password/i).fill("newpassword1");
    await page.getByRole("button", { name: /set new password/i }).click();
    await expect(page.getByText(/invalid or expired/i)).toBeVisible({ timeout: 8000 });
  });

  test("shows success message after a valid reset", async ({ page }) => {
    await page.route(`${API}/auth/reset-password`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
    );
    await page.goto("/reset-password?token=valid-token");
    await page.getByLabel(/new password/i).fill("newpassword1");
    await page.getByLabel(/confirm password/i).fill("newpassword1");
    await page.getByRole("button", { name: /set new password/i }).click();
    await expect(page.getByText(/password updated/i)).toBeVisible({ timeout: 8000 });
  });
});
