import { expect, test } from '@playwright/test'
import { en } from '../src/lang/en'

// Full-stack smoke test: signup → login → upload + create post → edit → delete.
// Needs the Go backend + Postgres running (e.g. `docker compose up`, or
// `go run ./cmd/server`). Skips when the API isn't reachable.
// Creates a throwaway user (e2e_<timestamp>) in whatever DB that backend uses;
// the post is deleted at the end, the user stays (there is no delete-user API).

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

// 1×1 JPEG — enough for the backend's content sniffing.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/health`).catch(() => null)
  test.skip(!res?.ok(), `backend not reachable at ${API}/health`)
})

test('user can sign up, post a photo, edit it and delete it', async ({ page }) => {
  const id = `e2e_${Date.now()}`
  const email = `${id}@example.test`
  const password = 'e2e-password-123'
  const caption = `E2E caption ${id}`
  const edited = `${caption} (edited)`

  await test.step('sign up', async () => {
    await page.goto('/signup')
    await page.getByLabel(en.auth.username).fill(id)
    await page.getByLabel(en.auth.email).fill(email)
    await page.getByLabel(en.auth.password).fill(password)
    await page.getByRole('button', { name: en.auth.signupButton }).click()
    await expect(page.getByText(en.auth.signupSuccess)).toBeVisible()
    await page.waitForURL('**/login')
  })

  await test.step('log in', async () => {
    await page.getByLabel(en.auth.email).fill(email)
    await page.getByLabel(en.auth.password).fill(password)
    await page.getByRole('button', { name: en.auth.loginButton }).click()
    await expect(page.getByRole('link', { name: en.nav.profile(id) })).toBeVisible()
  })

  await test.step('create a post', async () => {
    await page.getByRole('link', { name: en.nav.createPost }).click()
    await page.getByLabel(en.posts.photo).setInputFiles({ name: 'tiny.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG })
    await page.getByLabel(en.posts.title).fill(caption)
    await page.getByLabel(en.posts.location).fill('Playwright Park')
    await page.getByRole('button', { name: en.posts.createPostButton }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText(caption)).toBeVisible()
  })

  await test.step('edit the post', async () => {
    await page.getByRole('img', { name: caption }).click()
    await expect(page.getByRole('heading', { name: caption })).toBeVisible()
    await page.getByRole('button', { name: en.posts.edit }).click()
    await page.getByLabel(en.posts.title).fill(edited)
    await page.getByRole('button', { name: en.posts.save }).click()
    await expect(page.getByRole('heading', { name: edited })).toBeVisible()
  })

  await test.step('delete the post', async () => {
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: en.posts.edit }).click()
    await page.getByRole('button', { name: en.posts.delete }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText(edited)).toHaveCount(0)
  })
})
