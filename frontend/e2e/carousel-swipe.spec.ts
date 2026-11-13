import { expect, test } from '@playwright/test'
import { en } from '../src/lang/en'

// A real touch swipe on a phone-sized screen moves the post's carousel to the
// next photo. Needs the Go backend + Postgres (skips when /health is down).
// Creates a throwaway user (e2e_swipe_<timestamp>) and deletes its post at the end.

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

// 1×1 JPEG — enough for the backend's content sniffing.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/health`).catch(() => null)
  test.skip(!res?.ok(), `backend not reachable at ${API}/health`)
})

test('swiping the carousel shows the next photo', async ({ page, request }) => {
  const id = `e2e_swipe_${Date.now()}`
  const caption = `Swipe ${id}`

  // Set up through the API: a user and a post with three photos.
  const signup = await request.post(`${API}/auth/signup`, { data: { username: id, email: `${id}@example.test`, password: 'e2e-password-123' } })
  expect(signup.ok()).toBeTruthy()
  const login = await request.post(`${API}/auth/login`, { data: { email: `${id}@example.test`, password: 'e2e-password-123' } })
  const { token } = await login.json()
  const auth = { Authorization: `Bearer ${token}` }

  const images = []
  for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) {
    const up = await request.post(`${API}/uploads`, {
      headers: auth,
      multipart: { image: { name, mimeType: 'image/jpeg', buffer: TINY_JPEG } },
    })
    expect(up.ok()).toBeTruthy()
    const { image_path, thumbnail_path } = await up.json()
    images.push(thumbnail_path ? { image_path, thumbnail_path } : { image_path })
  }
  const created = await request.post(`${API}/posts`, { headers: auth, data: { images, caption } })
  expect(created.ok()).toBeTruthy()
  const post = await created.json()

  try {
    await page.goto(`/posts/${post.id}`)
    await expect(page.getByRole('heading', { name: caption })).toBeVisible()
    await expect(page.getByText(en.posts.imagePosition(1, 3))).toBeVisible()

    // A finger dragged right to left across the photo, as raw touch events
    // through Chromium's input pipeline (not a JS scroll); scroll-snap settles
    // it on the next slide. (Input.synthesizeScrollGesture with touch doesn't
    // scroll anything in headless Chromium, so it can't be used here.)
    const box = await page.locator('.image-carousel-track').boundingBox()
    if (!box) throw new Error('carousel track not laid out')
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

    await expect(page.getByText(en.posts.imagePosition(2, 3))).toBeVisible()
    await expect(page.getByRole('img', { name: caption })).toHaveAttribute('src', new RegExp(`${images[1].image_path}$`))
    // The page itself did not scroll sideways.
    expect(await page.evaluate('window.scrollX')).toBe(0) // a string: e2e code has no DOM types
  } finally {
    await request.delete(`${API}/posts/${post.id}`, { headers: auth })
  }
})
