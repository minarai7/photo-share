import { expect, test } from '@playwright/test'
import { en } from '../src/lang/en'
import { API, TINY_JPEG } from './helpers'

// Full-stack smoke test: sign up → new post with 2 photos → page through them
// → edit → delete. Needs the Go backend + Postgres running (e.g. `docker
// compose up`, or `go run ./cmd/server`). Skips when the API isn't reachable.
// Creates a throwaway user (e2e_<timestamp>) in whatever DB that backend uses;
// the post is deleted at the end, the user stays (there is no delete-user API).

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/health`).catch(() => null)
  test.skip(!res?.ok(), `backend not reachable at ${API}/health`)
})

test('user can sign up, post photos, edit the post and delete it', async ({ page }) => {
  const id = `e2e_${Date.now()}`
  const caption = `E2E caption ${id}`
  const edited = `${caption} (edited)`

  await test.step('sign up (and be signed in)', async () => {
    await page.goto('/signup')
    await page.getByLabel(en.auth.username).fill(id)
    await page.getByLabel(en.auth.email).fill(`${id}@example.test`)
    await page.getByLabel(en.auth.password).fill('e2e-password-123')
    await page.getByRole('button', { name: en.auth.signupButton }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText(en.toast.welcome)).toBeVisible()
  })

  await test.step('publish a post with two photos', async () => {
    await page.getByRole('banner').getByRole('link', { name: en.header.newPostLabel }).click()
    await expect(page.getByRole('heading', { name: en.compose.title })).toBeVisible()
    await page.locator('input[type=file]').setInputFiles([
      { name: 'first.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
      { name: 'second.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
    ])
    await expect(page.getByRole('img', { name: en.compose.coverAlt('first.jpg') })).toBeVisible()
    await page.getByLabel(en.compose.caption).fill(caption)
    await page.getByLabel(en.compose.place).fill('Playwright Park')
    await page.getByRole('button', { name: en.compose.publish }).click()
    await page.waitForURL(/\/posts\/\d+$/)
    await expect(page.getByText(en.toast.published)).toBeVisible()
  })

  await test.step('page through its photos', async () => {
    await expect(page.getByRole('status', { name: en.post.photoPosition(1, 2) })).toBeVisible()
    await page.getByRole('button', { name: en.post.nextPhoto }).click()
    await expect(page.getByRole('status', { name: en.post.photoPosition(2, 2) })).toBeVisible()
  })

  await test.step('edit it from the wall label', async () => {
    await page.getByRole('button', { name: en.post.infoDown }).click()
    const label = page.getByRole('region', { name: en.post.about })
    await label.getByRole('button', { name: en.post.manage }).click()
    await label.getByRole('button', { name: en.post.edit }).click()
    const dialog = page.getByRole('dialog', { name: en.editPost.title })
    await dialog.getByLabel(en.editPost.caption).fill(edited)
    await dialog.getByRole('button', { name: en.editPost.save }).click()
    await expect(page.getByText(en.toast.updated)).toBeVisible()
    await expect(label).toContainText(edited)
  })

  await test.step('delete it (after confirming)', async () => {
    const label = page.getByRole('region', { name: en.post.about })
    await label.getByRole('button', { name: en.post.delete }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: en.deletePost.confirm }).click()
    await expect(page.getByText(en.toast.deleted)).toBeVisible()
    await page.waitForURL((url) => !url.pathname.startsWith('/posts/'))
    await expect(page.getByText(edited)).toHaveCount(0)
  })
})
