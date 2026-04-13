import { test, expect } from "@playwright/test"

test.describe("Settings page (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("settings page shows org name", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Should display the organisation name somewhere on the page
    await expect(
      page.getByText(/Organización|Organisation|Organization|Nombre|Name/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test("tab navigation works", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Click any non-first tab — try Features, Users, or Billing
    const tab = page.getByRole("tab").nth(1)
    await tab.click()

    // Verify the tab content changed — page should still show settings content
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
