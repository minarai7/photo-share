import { expect, type APIRequestContext } from '@playwright/test'

export const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

// 1×1 JPEG — enough for the backend's content sniffing.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

/** A throwaway user (there is no delete-user API, so it stays in the DB). */
export async function makeUser(request: APIRequestContext, prefix: string) {
  const username = `${prefix}_${Date.now()}`
  const email = `${username}@example.test`
  const signup = await request.post(`${API}/auth/signup`, { data: { username, email, password: 'e2e-password-123' } })
  expect(signup.ok()).toBeTruthy()
  const { token, user } = await signup.json()
  return { username, id: user.id as number, token: token as string, auth: { Authorization: `Bearer ${token}` } }
}

/** Uploads `count` tiny photos and creates a post from them; returns the post. */
export async function makePost(request: APIRequestContext, auth: Record<string, string>, caption: string, count: number) {
  const images = []
  for (let i = 0; i < count; i++) {
    const up = await request.post(`${API}/uploads`, {
      headers: auth,
      multipart: { image: { name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: TINY_JPEG } },
    })
    expect(up.ok()).toBeTruthy()
    const { image_path, thumbnail_path } = await up.json()
    images.push(thumbnail_path ? { image_path, thumbnail_path } : { image_path })
  }
  const created = await request.post(`${API}/posts`, { headers: auth, data: { images, caption } })
  expect(created.ok()).toBeTruthy()
  return created.json() as Promise<{ id: number; images: { image_path: string }[] }>
}
