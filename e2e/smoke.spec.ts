import { test, expect } from "@playwright/test"

// ── Public pages ──────────────────────────────────────────────────────────────

test.describe("Public pages", () => {
  test("marketing page loads", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("text=labrota").first()).toBeVisible()
  })

  test("login page shows magic link form", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("#email")).toBeVisible()
    await expect(page.locator("#password")).not.toBeVisible()
  })

  test("demo page shows password form", async ({ page }) => {
    await page.goto("/demo")
    await expect(page.locator("#email")).toBeVisible()
    await expect(page.locator("#password")).toBeVisible()
  })
})

// ── Authenticated pages ───────────────────────────────────────────────────────

test.describe("Schedule (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/demo.json" })

  test("schedule page renders toolbar", async ({ page }) => {
    await page.goto("/schedule")
    // Toolbar should render (even before rota data)
    await expect(page.getByRole("button", { name: /Semana|Week/i })).toBeVisible({ timeout: 45_000 })
  })

  test("schedule loads rota data", async ({ page }) => {
    await page.goto("/schedule")
    // Budget bar pills = data loaded. 45s for cold start + client fallback.
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 45_000 })
  })

  test("week navigation is instant (prefetch)", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 45_000 })

    // Next week button
    const nextBtn = page.getByRole("button", { name: /siguiente|Next period/i })
    await nextBtn.click()

    // Must load within 3s (prefetch cache hit)
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 3_000 })
  })

  // Navigate directly via URL to avoid depending on schedule loading state
  test("lab page loads", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })
  })

  test("team page loads", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("leaves page loads", async ({ page }) => {
    await page.goto("/leaves")
    await expect(page.getByText(/Ausentes|Sin ausencias|Absent|No leave|Add leave|Añadir ausencia/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("reports page loads", async ({ page }) => {
    await page.goto("/reports")
    await expect(page.getByText(/Resumen|Summary|Staff summary/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("admin page loads", async ({ page }) => {
    await page.goto("/settings")
    await expect(page.getByText(/Administración|Administration/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
