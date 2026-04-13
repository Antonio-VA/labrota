import { test, expect } from "@playwright/test"

test.describe("Staff page (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("staff page shows staff count KPI", async ({ page }) => {
    await page.goto("/staff")
    // The page shows an "Activos" / "Active" count KPI or empty state
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test("search input is visible", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })

    // Search/filter input should be present
    const searchInput = page.getByPlaceholder(/Buscar|Search|Filtrar|Filter/i)
    await expect(searchInput).toBeVisible({ timeout: 5_000 })
  })

  test("search filters staff list", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })

    // Count initial rows — skip test if org has no staff
    const initialRows = await page.locator("table tbody tr").count()
    test.skip(initialRows === 0, "No staff in test org — skipping filter test")

    // Type a search term that won't match any rows
    const searchInput = page.getByPlaceholder(/Buscar|Search|Filtrar|Filter/i)
    await searchInput.fill("zzz_no_match")

    // Table should show fewer rows (likely zero) or an empty state
    await expect(async () => {
      const filtered = await page.locator("table tbody tr").count()
      expect(filtered).toBeLessThan(initialRows)
    }).toPass({ timeout: 5_000 })
  })

  test("clicking staff member name navigates to detail page", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active|equipo|team/i).first()).toBeVisible({ timeout: 15_000 })

    // Skip if no staff links in the table
    const linkCount = await page.locator("table tbody tr a").count()
    test.skip(linkCount === 0, "No staff in test org — skipping navigation test")

    const firstNameLink = page.locator("table tbody tr a").first()
    const nameText = await firstNameLink.textContent()
    expect(nameText).toBeTruthy()

    await firstNameLink.click()

    // Should navigate to a staff detail page (/staff/[id])
    await expect(page).toHaveURL(/\/staff\/[a-zA-Z0-9-]+/, { timeout: 10_000 })

    // Detail page should show the staff member name
    await expect(page.getByText(nameText!.trim()).first()).toBeVisible({ timeout: 10_000 })
  })
})
