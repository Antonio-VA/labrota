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

  test("schedule loads with data", async ({ page }) => {
    await page.goto("/schedule")
    // Budget bar pills = data loaded (not shimmer)
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 20_000 })
  })

  test("week navigation is instant (prefetch)", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 20_000 })

    // Next week button
    const nextBtn = page.getByRole("button", { name: /siguiente|Next period/i })
    await nextBtn.click()

    // Must load within 3s (prefetch cache hit)
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 3_000 })
  })

  test("lab page loads", async ({ page }) => {
    await page.goto("/schedule")
    await page.getByRole("link", { name: /Laboratorio|Laboratory/i }).click()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 5_000 })
  })

  test("team page loads", async ({ page }) => {
    await page.goto("/schedule")
    await page.getByRole("link", { name: /Equipo|Team/i }).click()
    await expect(page.getByText(/Activos|Active/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test("leaves page loads", async ({ page }) => {
    await page.goto("/schedule")
    await page.getByRole("link", { name: /Ausencias|Leaves/i }).click()
    // Either leave list or empty state
    await expect(page.getByText(/Ausentes|Sin ausencias|Absent|No leaves/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test("reports page loads", async ({ page }) => {
    await page.goto("/schedule")
    await page.getByRole("link", { name: /Informes|Reports/i }).click()
    await expect(page.getByText(/Resumen|Summary|Staff summary/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test("admin page loads", async ({ page }) => {
    await page.goto("/schedule")
    await page.getByRole("link", { name: "Admin" }).click()
    await expect(page.getByText(/Administración|Administration/i).first()).toBeVisible({ timeout: 5_000 })
  })
})
