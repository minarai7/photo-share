import { expect, test, type Page } from '@playwright/test'
import { API, makePost, makeUser } from './helpers'

// Guards DESIGN-SYSTEM.md §7.1: one gesture moves one work.
//
// - Keys step one screen per press.
// - The hand-off: a vertical gesture that begins right after a series' photo
//   track moved sideways is stepped by useWheelToPage, exactly once, and the
//   rest of that gesture is swallowed even when the next work (also a
//   series) slides under the pointer. Round 4's regression stepped twice
//   there, skipping a work.
//
// Playwright's wheel events have no trackpad phases (a burst of them is a
// mouse wheel spun hard, which the browser scrolls notch by notch, and
// headless Chromium doesn't snap a lone notch forward), so native wheel and
// trackpad snapping can't be reproduced here; check those by hand.
// Needs the backend (skips otherwise); uses a profile so only this test's
// works are on the reel.

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/health`).catch(() => null)
  test.skip(!res?.ok(), `backend not reachable at ${API}/health`)
})

/** Which child of the reel is on screen: 0 is the person hero, 1 the first work. */
const screenIndex = (page: Page) =>
  page.evaluate(`(() => { const r = document.querySelector('.reel'); return Math.round(r.scrollTop / r.clientHeight) })()`) as Promise<number>

async function settled(page: Page) {
  let last = -1
  for (let i = 0; i < 30; i++) {
    const now = (await page.evaluate(`document.querySelector('.reel').scrollTop`)) as number
    if (now === last) return
    last = now
    await page.waitForTimeout(120)
  }
}

test('keys, a wheel notch and the series hand-off each move one work', async ({ page, request }) => {
  const { username, id, auth } = await makeUser(request, 'e2e_reel')
  // Newest first on the reel: work 3, work 2, work 1 (series), work 0 (series).
  const posts = []
  for (let i = 0; i < 4; i++) posts.push(await makePost(request, auth, `${username} work ${i}`, i <= 1 ? 2 : 1))

  try {
    await page.goto(`/users/${id}`)
    await expect(page.getByRole('heading', { level: 1, name: username })).toBeVisible()
    await expect(page.locator('.slide')).toHaveCount(4)
    expect(await screenIndex(page)).toBe(0)
    const reel = await page.locator('.reel').boundingBox()
    if (!reel) throw new Error('reel not laid out')
    await page.mouse.move(reel.x + reel.width / 2, reel.y + reel.height / 2)

    await test.step('↓ and J step one screen each', async () => {
      await page.keyboard.press('ArrowDown')
      await settled(page)
      expect(await screenIndex(page)).toBe(1)
      await page.keyboard.press('j')
      await settled(page)
      expect(await screenIndex(page)).toBe(2)
    })

    await test.step('Space steps one too', async () => {
      await page.keyboard.press(' ')
      await settled(page)
      expect(await screenIndex(page)).toBe(3)
    })

    await test.step('a vertical gesture after a sideways one on a series steps once', async () => {
      // Move the series' photo track sideways, as a trackpad swipe would.
      await page.mouse.wheel(240, 0)
      await page.waitForTimeout(300) // a new gesture (> 220 ms gap), still within the 600 ms latch
      for (let i = 0; i < 30; i++) {
        await page.mouse.wheel(0, Math.max(40, 240 - i * 6))
        await page.waitForTimeout(16)
      }
      await settled(page)
      // Work 0 (the next series) is on screen; not the end card past it.
      expect(await screenIndex(page)).toBe(4)
    })

    await test.step('↑ steps back one', async () => {
      await page.waitForTimeout(400)
      await page.keyboard.press('ArrowUp')
      await settled(page)
      expect(await screenIndex(page)).toBe(3)
    })
  } finally {
    for (const p of posts) await request.delete(`${API}/posts/${p.id}`, { headers: auth })
  }
})
