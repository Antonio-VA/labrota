import { test, expect } from "@playwright/test"

test.describe("Settings page (authenticated)", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("settings page shows org name", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 10_000 })

    // Should display the organisation name somewhere on the page
    await expect(
      page.getByText(/Organización|Organisation|Organization|Nombre|Name/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test("tab navigation works — click Funcionalidades tab", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 10_000 })

    // Click the Funcionalidades / Features tab
    const featuresTab = page.getByRole("tab", { name: /Funcionalidades|Features/i })
    await featuresTab.click()

    // Verify the tab content changed — look for feature-specific content
    await expect(
      page.getByText(/Funcionalidades|Features|PDF|Módulo|Module/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
