import { test } from '@playwright/test'

// Screenshots for design review (DESIGN-SYSTEM.md §11.1): every screen that
// works without signing in, at desktop and phone size, once with reduced
// motion. The feed and post screens need the backend (they show its data).

const sizes = [
  { name: 'desk', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]

for (const size of sizes) {
  for (const reduced of [false, true]) {
    const tag = `${size.name}${reduced ? '-reduced' : ''}`
    test.describe(tag, () => {
      test.use({
        viewport: { width: size.width, height: size.height },
        contextOptions: { reducedMotion: reduced ? 'reduce' : 'no-preference' },
      })

      for (const [name, path] of [['feed', '/'], ['login', '/login'], ['signup', '/signup'], ['404', '/nothing-here']]) {
        test(`screenshot ${name}`, async ({ page }) => {
          await page.goto(path)
          await page.waitForLoadState('networkidle')
          await page.screenshot({ path: `e2e/screenshots/${tag}-${name}.png` })
        })
      }
    })
  }
}
