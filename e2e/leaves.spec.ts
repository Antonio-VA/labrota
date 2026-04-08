import { test, expect } from "@playwright/test"

test.describe("Leaves page (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/demo.json" })

  test("leaves page shows leave stats", async ({ page }) => {
    await page.goto("/leaves")
    // Page should show absence stats — "Ausentes hoy" / "Esta semana" or English equivalents
    await expect(
      page.getByText(/Ausentes hoy|Absent today|Today/i).first()
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByText(/Esta semana|This week|Week/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test("add leave button opens the sheet/form", async ({ page }) => {
    await page.goto("/leaves")
    await expect(
      page.getByText(/Ausentes|Sin ausencias|Absent|No leave|Add leave|Añadir ausencia/i).first()
    ).toBeVisible({ timeout: 10_000 })

    // Click the add leave button
    const addBtn = page.getByRole("button", { name: /Añadir ausencia|Add leave/i })
    await addBtn.click()

    // The sheet/form should open — look for form fields or a heading
    await expect(
      page.getByText(/Nueva ausencia|New leave|Tipo|Type|Empleado|Staff member/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
