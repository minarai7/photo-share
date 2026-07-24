import { test } from '@playwright/test'

test('screenshot login page', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'e2e/screenshots/login.png', fullPage: true })
})

test('screenshot signup page', async ({ page }) => {
  await page.goto('/signup')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'e2e/screenshots/signup.png', fullPage: true })
})
