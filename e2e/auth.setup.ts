import { test as setup } from "@playwright/test"
import path from "path"

const STORAGE_STATE = path.join(__dirname, ".auth/e2e-test.json")

setup("authenticate as test user", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD
  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set (add them to .env.local or CI secrets).",
    )
  }
  await page.goto("/demo")
  await page.fill("#email", email)
  await page.fill("#password", password)
  await page.click("button[type='submit']")
  await page.waitForURL("**/schedule", { timeout: 15_000 })
  await page.context().storageState({ path: STORAGE_STATE })
})

export { STORAGE_STATE }
