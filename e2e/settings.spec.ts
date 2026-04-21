import { test, expect } from "@playwright/test"

test.describe("Settings page", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("settings page shows org info", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Should display organisation info
    await expect(
      page.getByText(/Organización|Organisation|Organization|Nombre|Name/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test("settings has multiple tabs", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    const tabs = page.getByRole("tab")
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(4)
  })

  test("features tab loads", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    const featuresTab = page.getByRole("tab", { name: /Funcionalidades|Features/i })
    await featuresTab.click()

    // Should show feature toggles or settings content
    await expect(
      page.getByText(/Funcionalidades|Features|activar|enable|desactivar|disable/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("users tab loads", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    const usersTab = page.getByRole("tab", { name: /^(Usuarios|Users)$/i })
    await usersTab.click()

    // Should show user list or invite form
    await expect(
      page.getByText(/Usuarios|Users|email|invitar|invite/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("notifications tab loads", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    const notifTab = page.getByRole("tab", { name: /Notificaciones|Notifications/i })
    await notifTab.click()

    // Should show notification settings
    await expect(
      page.getByText(/Notificaciones|Notifications|email|Outlook/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("tab switching preserves page", async ({ page }) => {
    await page.goto("/settings")
    await expect(
      page.getByText(/Administración|Administration/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Click through tabs — page should not crash
    const tabNames = [
      /Funcionalidades|Features/i,
      /^(Usuarios|Users)$/i,
      /Notificaciones|Notifications/i,
      /Organización|Organisation/i,
    ]
    for (const name of tabNames) {
      const tab = page.getByRole("tab", { name })
      if (await tab.isVisible()) {
        await tab.click()
        await expect(page.getByText(/Administración|Administration/i).first()).toBeVisible({ timeout: 5_000 })
      }
    }
  })

  test("hr-module page loads", async ({ page }) => {
    await page.goto("/settings/hr-module")
    await expect(
      page.getByText(/Configuracion modulo RRHH|HR Module|RRHH/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })
})
