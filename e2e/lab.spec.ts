import { test, expect } from "@playwright/test"

test.describe("Lab configuration page", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("lab page shows all tabs", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })

    // All major tabs should be present
    const tabs = page.getByRole("tab")
    await expect(tabs.first()).toBeVisible({ timeout: 5_000 })

    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(7)
  })

  test("departments tab loads content", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })

    const deptTab = page.getByRole("tab", { name: /Departamentos|Departments/i })
    await deptTab.click()

    // Should show department list or empty state
    await expect(
      page.getByText(/Departamentos|Departments|Añadir|Add/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("shifts tab loads content", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })

    const shiftsTab = page.getByRole("tab", { name: /^(Turnos|Shifts)$/i })
    await shiftsTab.click()

    // Should show shift type cards or configuration
    await expect(
      page.getByText(/T1|T2|turno|shift/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("tasks tab loads content", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })

    const tasksTab = page.getByRole("tab", { name: /^(Tareas|Tasks)$/i })
    await tasksTab.click()

    // Should show task list or empty state
    await expect(
      page.getByText(/Tareas|Tasks|Añadir|Add|tarea|task/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("coverage tab loads content", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })

    const coverageTab = page.getByRole("tab", { name: /^(Cobertura|Coverage)$/i })
    await coverageTab.click()

    // Should show coverage configuration
    await expect(
      page.getByText(/Cobertura|Coverage|mínimo|minimum/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("rules tab loads content", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })

    const rulesTab = page.getByRole("tab", { name: /^(Reglas|Rules)$/i })
    await rulesTab.click()

    // Should show rules list or empty state
    await expect(
      page.getByText(/Reglas|Rules|regla|rule|Añadir|Add/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test("tab switching preserves page", async ({ page }) => {
    await page.goto("/lab")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 })

    // Click through multiple tabs — page should not error
    const tabNames = [/Turnos|Shifts/i, /Tareas|Tasks/i, /Departamentos|Departments/i, /Cobertura|Coverage/i]
    for (const name of tabNames) {
      const tab = page.getByRole("tab", { name })
      if (await tab.isVisible()) {
        await tab.click()
        // Heading should still be present (page didn't crash)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 5_000 })
      }
    }
  })
})
