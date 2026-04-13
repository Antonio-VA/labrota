import { test, expect } from "@playwright/test"

test.describe("Leaves page (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("leaves page shows leave stats", async ({ page }) => {
    await page.goto("/leaves")
    // Page should show absence stats KPI cards or the add-leave button
    await expect(
      page.getByText(/Ausentes hoy|Absent today|Añadir ausencia|Add leave/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test("add leave button opens the sheet/form", async ({ page }) => {
    await page.goto("/leaves")
    await expect(
      page.getByText(/Ausentes|Sin ausencias|Absent|No leave|Add leave|Añadir ausencia/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Click the first add leave button (page may show multiple)
    const addBtn = page.getByRole("button", { name: /Añadir ausencia|Add leave/i }).first()
    await addBtn.click()

    // The sheet/form should open — look for form fields or a heading
    await expect(
      page.getByText(/Nueva ausencia|New leave|Tipo|Type|Empleado|Staff member/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
