import { test, expect } from "@playwright/test"

test.describe("Staff page (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("staff page shows staff count KPI", async ({ page }) => {
    await page.goto("/staff")
    // The page shows an "Activos" / "Active" count KPI
    await expect(page.getByText(/Activos|Active/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test("column visibility toggle — enable email column", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active/i).first()).toBeVisible({ timeout: 10_000 })

    // Open column visibility dropdown
    const columnsBtn = page.getByRole("button", { name: /Columnas|Columns/i })
    await columnsBtn.click()

    // Toggle the email column on
    const emailToggle = page.getByRole("menuitemcheckbox", { name: /email/i })
    await emailToggle.click()

    // Verify the email column header appears in the table
    await expect(page.getByRole("columnheader", { name: /email/i })).toBeVisible()
  })

  test("search filters staff list", async ({ page }) => {
    await page.goto("/staff")
    await expect(page.getByText(/Activos|Active/i).first()).toBeVisible({ timeout: 10_000 })

    // Count initial rows
    const initialRows = await page.locator("table tbody tr").count()

    // Type a search term — use a partial name that is unlikely to match all rows
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
    await expect(page.getByText(/Activos|Active/i).first()).toBeVisible({ timeout: 10_000 })

    // Click the first staff name link in the table
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
