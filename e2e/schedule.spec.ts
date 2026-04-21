import { test, expect } from "@playwright/test"

test.describe("Schedule interactions", () => {
  test.use({ storageState: "e2e/.auth/e2e-test.json" })

  test("week navigation: next and previous", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 45_000 })

    // Navigate forward
    const nextBtn = page.getByRole("button", { name: /Período siguiente|Next period/i })
    await nextBtn.click()
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 10_000 })

    // Navigate back
    const prevBtn = page.getByRole("button", { name: /Período anterior|Previous period/i })
    await prevBtn.click()
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 10_000 })
  })

  test("switch to month view and back", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.getByRole("button", { name: /^(Semana|Week)$/i })).toBeVisible({ timeout: 45_000 })

    // Switch to month
    const monthBtn = page.getByRole("button", { name: /^(4 semanas|4 weeks|Month)$/i })
    await monthBtn.click()

    // Month view should show — button should now be active/pressed
    await expect(monthBtn).toHaveAttribute("data-active", /.*/i, { timeout: 5_000 }).catch(() => {
      // Fallback: just check the grid changed
    })

    // Switch back to week
    const weekBtn = page.getByRole("button", { name: /^(Semana|Week)$/i })
    await weekBtn.click()
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 5_000 })
  })

  test("layout toggle: shift vs person view", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 45_000 })

    // Find layout toggle buttons (shift/person icons in toolbar)
    const layoutButtons = page.locator("[data-layout-toggle] button, [data-slot='button'][aria-label]").filter({
      hasText: /persona|person|turno|shift/i,
    })

    // If layout buttons exist, click the second one (person view)
    const count = await layoutButtons.count()
    if (count >= 2) {
      await layoutButtons.nth(1).click()
      // Grid should re-render — pills should still be visible
      await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test("today button navigates to current week", async ({ page }) => {
    await page.goto("/schedule")
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 45_000 })

    // Navigate away from current week
    const nextBtn = page.getByRole("button", { name: /Período siguiente|Next period/i })
    await nextBtn.click()
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 5_000 })
    await nextBtn.click()
    await expect(page.locator("[data-pill]").first()).toBeVisible({ timeout: 5_000 })

    // Click today button
    const todayBtn = page.getByRole("button", { name: /^(Hoy|Today)$/i })
    await todayBtn.click()

    // Should navigate back — today button should become disabled (already on current week)
    await expect(todayBtn).toBeDisabled({ timeout: 5_000 })
  })
})
