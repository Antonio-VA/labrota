import { test as setup, expect } from "@playwright/test"
import path from "path"

const STORAGE_STATE = path.join(__dirname, ".auth/demo.json")

setup("authenticate as demo user", async ({ page }) => {
  await page.goto("/demo")
  await page.fill("#email", "demo@labrota.app")
  await page.fill("#password", process.env.E2E_DEMO_PASSWORD || "LabRotaDemo2026")
  await page.click("button[type='submit']")
  await page.waitForURL("**/schedule", { timeout: 15_000 })
  await page.context().storageState({ path: STORAGE_STATE })
})

export { STORAGE_STATE }
