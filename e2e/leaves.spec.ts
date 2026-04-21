import { test, expect } from "@playwright/test"

test.describe("Leaves page", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("leaves page shows leave stats or empty state", async ({ page }) => {
    await page.goto("/leaves")
    await expect(
      page.getByText(/Ausentes hoy|Absent today|Añadir ausencia|Add leave|Sin ausencias|No leave/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test("add leave button opens form", async ({ page }) => {
    await page.goto("/leaves")
    await expect(
      page.getByText(/Ausentes|Sin ausencias|Absent|No leave|Añadir ausencia|Add leave/i).first()
    ).toBeVisible({ timeout: 15_000 })

    const addBtn = page.getByRole("button", { name: /Añadir ausencia|Add leave/i }).first()
    await addBtn.click()

    // Form should open with type/staff selectors
    await expect(
      page.getByText(/Nueva ausencia|New leave|Tipo|Type|Empleado|Staff member/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("leave form has required fields", async ({ page }) => {
    await page.goto("/leaves")
    await expect(
      page.getByText(/Ausentes|Sin ausencias|Absent|No leave|Añadir ausencia|Add leave/i).first()
    ).toBeVisible({ timeout: 15_000 })

    const addBtn = page.getByRole("button", { name: /Añadir ausencia|Add leave/i }).first()
    await addBtn.click()

    await expect(
      page.getByText(/Nueva ausencia|New leave|Tipo|Type/i).first()
    ).toBeVisible({ timeout: 5_000 })

    // Should have date inputs and a submit button
    await expect(page.locator("input:not([type='file']), [role='combobox'], select").first()).toBeVisible({ timeout: 3_000 })
    await expect(
      page.getByRole("button", { name: /Guardar|Save|Crear|Create|Añadir|Add/i }).first()
    ).toBeVisible({ timeout: 3_000 })
  })
})
