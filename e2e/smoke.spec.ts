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

  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy")
    await expect(page.getByText(/Privacy Policy|Política de Privacidad/i).first()).toBeVisible()
  })

  test("terms page loads", async ({ page }) => {
    await page.goto("/terms")
    await expect(page.getByText(/Terms of Service|Términos de Servicio/i).first()).toBeVisible()
  })

  test("GDPR page loads", async ({ page }) => {
    await page.goto("/gdpr")
    await expect(page.getByText(/GDPR|RGPD/i).first()).toBeVisible()
  })
})

// ── Authenticated smoke tests ────────────────────────────────────────────────

test.describe("Authenticated page loads", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("schedule page renders toolbar", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.getByRole("button", { name: /^(Semana|Week)$/i })).toBeVisible({ timeout: 45_000 })
  })

  test("schedule loads rota data", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 45_000 })
  })

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
    await expect(
      page.getByText(/Ausentes|Sin ausencias|Absent|No leave|Añadir ausencia|Add leave/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test("reports page loads", async ({ page }) => {
    await page.goto("/reports")
    await expect(page.getByText(/Informes|Reports/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings")
    await expect(page.getByText(/Administración|Administration/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("my-rota page loads", async ({ page }) => {
    // my-rota is mobile-only (md:hidden). Use phone viewport.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/my-rota")
    // Page should render — "no shift" message or schedule content
    await expect(
      page.getByText(/No tienes un turno|No shift assigned/i).first()
    ).toBeVisible({ timeout: 20_000 }).catch(async () => {
      // If user has a shift, schedule content loads instead
      await expect(page.locator("[data-pill], .animate-pulse").first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test("staff/new page loads", async ({ page }) => {
    await page.goto("/staff/new")
    await expect(
      page.getByText(/Añadir miembro|Add member/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test("settings/hr-module page loads", async ({ page }) => {
    await page.goto("/settings/hr-module")
    await expect(
      page.getByText(/Configuracion modulo RRHH|HR Module|RRHH/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})
