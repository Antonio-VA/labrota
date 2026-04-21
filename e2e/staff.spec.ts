import { test, expect } from "@playwright/test"

test.describe("Staff page", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("staff page shows staff count", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test("search input is visible", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })

    const searchInput = page.getByPlaceholder(/Buscar|Search|Filtrar|Filter/i)
    await expect(searchInput).toBeVisible({ timeout: 5_000 })
  })

  test("search filters staff list", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })

    const initialRows = await page.locator("table tbody tr").count()
    test.skip(initialRows === 0, "No staff in test org")

    const searchInput = page.getByPlaceholder(/Buscar|Search|Filtrar|Filter/i)
    await searchInput.fill("zzz_no_match")

    await expect(async () => {
      const filtered = await page.locator("table tbody tr").count()
      expect(filtered).toBeLessThan(initialRows)
    }).toPass({ timeout: 5_000 })
  })

  test("clicking staff name navigates to detail", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })

    const linkCount = await page.locator("table tbody tr a").count()
    test.skip(linkCount === 0, "No staff in test org")

    const firstNameLink = page.locator("table tbody tr a").first()
    const nameText = await firstNameLink.textContent()
    expect(nameText).toBeTruthy()

    await firstNameLink.click()

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/staff\/[a-zA-Z0-9-]+/, { timeout: 10_000 })

    // Detail page should show the staff name
    await expect(page.getByText(nameText!.trim()).first()).toBeVisible({ timeout: 10_000 })
  })

  test("staff detail page has edit form", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })

    const linkCount = await page.locator("table tbody tr a").count()
    test.skip(linkCount === 0, "No staff in test org")

    await page.locator("table tbody tr a").first().click()
    await expect(page).toHaveURL(/\/staff\/[a-zA-Z0-9-]+/, { timeout: 10_000 })

    // Should have form fields (name inputs, role selector, etc.)
    await expect(page.locator("input, select, [role='combobox']").first()).toBeVisible({ timeout: 5_000 })

    // Should have a back link to /staff
    const backLink = page.locator("a[href='/staff']")
    await expect(backLink).toBeVisible({ timeout: 5_000 })
  })

  test("new staff page shows creation form", async ({ page }) => {
    await page.goto("/staff/new")
    await expect(
      page.getByText(/Añadir miembro|Add member/i).first()
    ).toBeVisible({ timeout: 10_000 })

    // Form should have name inputs
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5_000 })

    // Should have a submit/save button
    await expect(
      page.getByRole("button", { name: /Guardar|Save|Crear|Create/i }).first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
