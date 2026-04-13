import { test as setup, expect } from "@playwright/test"
import path from "path"

const STORAGE_STATE = path.join(__dirname, ".auth/e2e-test.json")

setup("authenticate as test user", async ({ page }) => {
  await page.goto("/demo")
  await page.fill("#email", process.env.E2E_TEST_EMAIL || "e2e-test@labrota.app")
  await page.fill("#password", process.env.E2E_TEST_PASSWORD || "LabRotaE2E2026")
  await page.click("button[type='submit']")
  await page.waitForURL("**/schedule", { timeout: 15_000 })
  await page.context().storageState({ path: STORAGE_STATE })
})

export { STORAGE_STATE }
