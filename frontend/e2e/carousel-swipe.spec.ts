import { expect, test } from '@playwright/test'
import { en } from '../src/lang/en'
import { API, makePost, makeUser } from './helpers'

// A real touch swipe on a phone-sized screen moves the post view's photo
// track to the next photo. Needs the Go backend + Postgres (skips when
// /health is down). Creates a throwaway user and deletes its post at the end.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/health`).catch(() => null)
  test.skip(!res?.ok(), `backend not reachable at ${API}/health`)
})

test('swiping the post view shows the next photo', async ({ page, request }) => {
  const { username, auth } = await makeUser(request, 'e2e_swipe')
  const caption = `Swipe ${username}`
  const post = await makePost(request, auth, caption, 3)

  try {
    await page.goto(`/posts/${post.id}`)
    await expect(page.getByRole('status', { name: en.post.photoPosition(1, 3) })).toBeVisible()

    // A finger dragged right to left across the photo, as raw touch events
    // through Chromium's input pipeline (not a JS scroll); scroll-snap settles
    // it on the next photo. (Input.synthesizeScrollGesture with touch doesn't
    // scroll anything in headless Chromium, so it can't be used here.)
    const box = await page.locator('.post-track').boundingBox()
    if (!box) throw new Error('photo track not laid out')
    const cdp = await page.context().newCDPSession(page)
    const y = Math.round(box.y + box.height / 2)
    let x = Math.round(box.x + box.width * 0.8)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 0; i < 12; i++) {
      x -= Math.round(box.width / 20)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
      await page.waitForTimeout(16) // ~one frame per move, like a real finger
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    await expect(page.getByRole('status', { name: en.post.photoPosition(2, 3) })).toBeVisible()
    await expect(page.getByRole('img', { name: en.post.photoOf(caption, 2, 3) })).toHaveAttribute('src', new RegExp(`${post.images[1].image_path}$`))
    // The page itself did not scroll sideways.
    expect(await page.evaluate('window.scrollX')).toBe(0) // a string: e2e code has no DOM types
  } finally {
    await request.delete(`${API}/posts/${post.id}`, { headers: auth })
  }
})
