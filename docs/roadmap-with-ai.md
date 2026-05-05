The MVP for the app Photo Share is:

**A full-stack photo-sharing app where users can sign up, log in, create photo posts with caption/location/camera/lens metadata, view a feed, view individual posts, view profiles, and edit/delete their own posts.**

Below is a concrete phase-by-phase plan. Each task includes a way to verify it is done.

---

# Phase 0 — Project foundation

## Task 0.1 — Create the repo structure

Set up a clean project layout.

Example:

```text
root/
  frontend/
  backend/
  openapi/
  docs/
```

Backend example:

```text
backend/
  cmd/server/
  internal/handler/
  internal/service/
  internal/repository/
  internal/middleware/
  internal/model/
  internal/config/
  internal/db/
  migrations/
```

Frontend example:

```text
frontend/
  src/
    api/
    components/
    pages/
    hooks/
    types/
    utils/
```

**Test**

* You can open the repo and the directories are logically separated.
* You can commit the initial structure to Git.

---

## Task 0.2 — Set up PostgreSQL locally

Use Docker Compose or a local install.

**Test**

* You can connect to the DB from terminal or GUI.
* You can run a simple query like `SELECT 1;`.

---

## Task 0.3 — Set up the Go backend skeleton

Create the web server entry point and a basic router.

Add one route:

* `GET /health`

Return:

```json
{ "status": "ok" }
```

**Test**

* Start backend server.
* Open `/health` in browser or curl.
* You get HTTP 200 and the expected JSON.

---

## Task 0.4 — Set up the React + TypeScript frontend skeleton

Create the frontend app and render a simple page.

**Test**

* Run the frontend dev server.
* Browser shows a page like `Frontend running`.

---

## Task 0.5 — Set up environment variables

Prepare `.env` / `.env.example` for backend and frontend.

Examples:

* DB connection string
* backend port
* frontend API base URL

**Test**

* App reads env vars successfully.
* Changing the port or base URL actually changes runtime behavior.

---

# Phase 1 — Database design and migrations

## Task 1.1 — Design the MVP schema

For MVP, keep it small:

### `users`

* id
* username
* email
* password_hash
* created_at

### `posts`

* id
* user_id
* image_path
* caption
* location
* camera_body
* lens
* created_at
* updated_at

Optional later:

* sessions
* refresh tokens
* comments
* likes

**Test**

* You can explain why each column exists.
* No unnecessary table is included yet.

---

## Task 1.2 — Write goose migrations

Create migration files for `users` and `posts`.

**Test**

* Run migration up successfully.
* Inspect DB and confirm tables/columns exist.
* Run migration down on a test DB and confirm rollback works.

---

## Task 1.3 — Add DB connection code in Go

Backend should connect to PostgreSQL at startup.

**Test**

* Server starts when DB is running.
* Server fails with a clear error when DB is not running.

---

## Task 1.4 — Integrate GoJet for queries

Generate or write typed DB access for `users` and `posts`.

**Test**

* You can run one test query successfully from Go, such as:

  * fetch all users
  * insert one post
* No raw SQL scattered across handlers.

---

# Phase 2 — Backend architecture skeleton

## Task 2.1 — Create handler/service/repository layers

For example:

* `handler/auth_handler.go`
* `service/auth_service.go`
* `repository/user_repository.go`

And similarly for posts.

**Test**

* Handlers do not directly contain SQL.
* Services do not directly depend on HTTP request objects.
* Repositories are the only layer doing DB access.

---

## Task 2.2 — Add request logging middleware

Log:

* method
* path
* status code
* duration

**Test**

* Hitting any endpoint prints logs in terminal.
* You can see different log lines for different requests.

---

## Task 2.3 — Add recovery middleware

Prevent backend from crashing on panic.

**Test**

* Force a panic in a temporary route.
* Server returns an error response instead of dying.

---

## Task 2.4 — Add CORS configuration

Allow frontend to call backend locally.

**Test**

* Frontend request to backend succeeds from browser.
* No CORS error appears in browser console.

---

# Phase 3 — OpenAPI contract first

## Task 3.1 — Write initial OpenAPI spec

Define the first endpoints:

* `POST /auth/signup`
* `POST /auth/login`
* `GET /posts`
* `GET /posts/{id}`
* `POST /posts`

Start with these, not everything.

**Test**

* YAML validates in an OpenAPI editor or validator.
* Paths, request bodies, and response schemas are clear.

---

## Task 3.2 — Align backend request/response shapes to OpenAPI

Your handlers should match the spec exactly.

**Test**

* A sample response from the backend matches the schema in OpenAPI.
* Field names are consistent between backend and spec.

---

## Task 3.3 — Create frontend API layer from the spec or based on the spec

Even if you do not fully auto-generate at first, keep one API module that mirrors the OpenAPI contract.

**Test**

* Frontend never hardcodes random endpoint shapes in many places.
* API calls are centralized in one layer.

---

# Phase 4 — Authentication backend

## Task 4.1 — Implement signup

Behavior:

* validate input
* reject duplicate email/username
* hash password
* create user

**Test**

* Valid signup creates a row in `users`.
* Duplicate signup returns proper error.
* Password is stored hashed, not plain text.

---

## Task 4.2 — Implement login

Behavior:

* verify email/username + password
* create auth session/token

Choose one simple auth approach and stick to it.

For a portfolio project, simple cookie-based session or JWT is fine.

**Test**

* Correct credentials return success.
* Wrong password returns 401 or equivalent.
* Successful login gives session/token usable on later requests.

---

## Task 4.3 — Add auth middleware

Protect routes like:

* `POST /posts`
* `PUT /posts/{id}`
* `DELETE /posts/{id}`

**Test**

* Unauthenticated request is rejected.
* Authenticated request succeeds.

---

## Task 4.4 — Add “current user” extraction

Middleware should make authenticated user ID available to handlers/services.

**Test**

* Protected endpoint can identify the current logged-in user.
* Post creation stores the correct `user_id`.

---

# Phase 5 — Posts backend

## Task 5.1 — Implement create post without image upload first

Initially accept a placeholder image path or test string.

Payload:

* caption
* location
* camera_body
* lens
* image_path

**Test**

* Authenticated create request inserts a row into `posts`.
* Feed endpoint returns the newly created post.

---

## Task 5.2 — Implement list posts

Return latest posts first.

**Test**

* `GET /posts` returns an array.
* Newly inserted posts appear in correct order.

---

## Task 5.3 — Implement get single post

Return one post by ID, ideally with user info needed for display.

**Test**

* Valid ID returns the expected post.
* Missing ID returns 404.

---

## Task 5.4 — Implement update post

Only the owner should be able to edit.

**Test**

* Owner can edit caption/location/camera/lens.
* Another user cannot edit someone else’s post.

---

## Task 5.5 — Implement delete post

Only the owner should be able to delete.

**Test**

* Owner can delete their post.
* Deleted post no longer appears in feed.
* Another user gets forbidden/unauthorized.

---

# Phase 6 — Real image upload support

## Task 6.1 — Choose simple local storage first

Store uploaded files on local disk for MVP.

Do not start with S3/cloud unless needed later.

**Test**

* Uploading an image creates a file in your storage directory.

---

## Task 6.2 — Add backend upload handling

Validate:

* allowed MIME types
* max file size

Save path in DB.

**Test**

* Valid image upload succeeds.
* Oversized or wrong file type is rejected.
* DB row stores the correct image path.

---

## Task 6.3 — Serve uploaded images

Backend should expose uploaded files so frontend can display them.

**Test**

* Opening the image URL in browser shows the image.
* Feed page can render uploaded photos.

---

# Phase 7 — Frontend routing and page skeletons

## Task 7.1 — Set up routes/pages

Minimum pages:

* signup
* login
* feed
* post detail
* create post
* edit post
* profile

**Test**

* You can manually navigate to each route.
* Each route renders the intended page shell.

---

## Task 7.2 — Build shared layout and navigation

Add a simple nav bar:

* feed
* create post
* profile
* login/logout depending on auth state

**Test**

* Links work.
* Auth-dependent nav changes correctly after login/logout.

---

## Task 7.3 — Add global auth state

Store whether user is logged in and basic user info.

**Test**

* After login, UI updates without manual refresh if designed that way.
* Protected UI elements appear only for logged-in users.

---

# Phase 8 — Frontend auth flow

## Task 8.1 — Build signup page

Form fields:

* username
* email
* password

**Test**

* Successful submit creates a user.
* Error messages display for bad input or duplicates.

---

## Task 8.2 — Build login page

**Test**

* Correct credentials log in successfully.
* Wrong credentials show user-friendly error.

---

## Task 8.3 — Build logout behavior

**Test**

* Logout clears client auth state.
* Protected routes stop working after logout.

---

## Task 8.4 — Add route protection

Create page and edit page should require login.

**Test**

* Visiting protected page while logged out redirects or shows an auth-required message.
* Logged-in user can access it.

---

# Phase 9 — Frontend post flows

## Task 9.1 — Build create post form

Fields:

* photo
* caption
* location
* camera body
* lens

**Test**

* Submitting creates a post.
* After success, post appears in feed.

---

## Task 9.2 — Build feed page

Each card should show:

* photo
* caption
* location
* camera body
* lens
* author
* created time

**Test**

* Feed shows multiple posts correctly.
* Refresh still shows data from backend, not just temporary UI state.

---

## Task 9.3 — Build single post page

**Test**

* Clicking a feed item opens detail page.
* Detail page shows correct post data.

---

## Task 9.4 — Build profile page

Show a user’s posts.

**Test**

* Profile page lists only that user’s posts.
* Different users show different content.

---

## Task 9.5 — Build edit post page

Pre-fill existing values.

**Test**

* Owner sees current values loaded into form.
* Save updates the post and changes appear in feed/detail.

---

## Task 9.6 — Add delete action

**Test**

* Owner can delete from detail page or profile page.
* UI updates after deletion.

---

Below is a roadmap-ready addition you can paste **after Task 9.6** and before **Phase 10**. It fits your current roadmap style, where Task 9.6 is delete action and Phase 10 starts with validation/UX polish. 

---

# Phase 9.5 — AI gear link assistant

This phase adds a small AI-powered feature after the main post flows are complete.

The goal is to let users click the camera body or lens shown on the post detail page and receive AI-suggested product/spec links in a popup/modal.

For the first version, keep this feature simple:

* use the existing `camera_body` and `lens` text from posts
* call the backend from the frontend
* keep the AI API key only in the backend
* return structured link suggestions
* show results in a modal instead of directly redirecting the user

---

## Task 9.7 — Design the AI gear link feature

Decide the exact user experience and API behavior before writing code.

Recommended behavior:

* On the post detail page, camera body and lens metadata should have a small action button.
* Example:

  * `Camera: Sony A7 III [Find product]`
  * `Lens: Tamron 28-75mm f/2.8 [Find product]`
* Clicking the button opens a loading state.
* When the backend returns results, show them in a modal.
* The modal should include suggested links, short reasons, and confidence labels.
* Do not automatically redirect users away from the app.

**Test**

* You can explain what happens when the user clicks the camera button.
* You can explain what happens when the user clicks the lens button.
* You have decided that results appear in a modal/popup.
* You know that the frontend will call the backend, not the AI API directly.

---

## Task 9.8 — Add OpenAPI spec for the AI gear link endpoint

Add a new backend endpoint to `openapi.yaml`.

Endpoint:

```http
POST /ai/gear-link
```

Request example:

```json
{
  "kind": "camera",
  "name": "Sony A7 III"
}
```

Response example:

```json
{
  "kind": "camera",
  "name": "Sony A7 III",
  "summary": "Likely a Sony Alpha full-frame mirrorless camera body.",
  "suggestions": [
    {
      "title": "Sony α7 III official product page",
      "url": "https://example.com",
      "reason": "Likely official product page for this camera body.",
      "confidence": "high"
    }
  ]
}
```

Use `"kind": "camera"` or `"kind": "lens"`.

This endpoint should require authentication so unauthenticated users cannot spend AI API calls.

**Test**

* OpenAPI YAML validates successfully.
* `POST /ai/gear-link` is documented.
* Request and response schemas are clear.
* The endpoint is marked as requiring bearer authentication.

---

## Task 9.9 — Add backend AI handler with fake hardcoded response first

Create a backend handler for:

```http
POST /ai/gear-link
```

At this stage, do **not** call the real AI API yet.

The handler should:

* read JSON from the request body
* validate `kind`
* validate `name`
* return a fake hardcoded response
* require login using existing auth middleware

Example fake response:

```json
{
  "kind": "camera",
  "name": "Sony A7 III",
  "summary": "This is a fake AI response for frontend testing.",
  "suggestions": [
    {
      "title": "Example product page",
      "url": "https://example.com",
      "reason": "Temporary fake result used before real AI integration.",
      "confidence": "medium"
    }
  ]
}
```

**Test**

* Logged-out request is rejected.
* Logged-in request returns JSON.
* Invalid `kind` is rejected.
* Empty `name` is rejected.
* You can test the endpoint with curl, browser dev tools, or your frontend.

---

## Task 9.10 — Add frontend API function for gear link search

Create a frontend API function that calls the backend endpoint.

Example file:

```text
frontend/src/api/aiApi.ts
```

The function should accept:

```ts
kind: "camera" | "lens"
name: string
```

and return:

```ts
GearLinkResponse
```

Example function name:

```ts
findGearLinks()
```

The frontend should not know anything about the AI provider. It should only know that your own backend has an endpoint called `/ai/gear-link`.

**Test**

* Calling `findGearLinks("camera", "Sony A7 III")` sends a request to the backend.
* The function returns typed response data.
* Failed requests throw or return a clear error.
* No AI API key exists anywhere in the frontend code.

---

## Task 9.11 — Add camera/lens action UI to post detail page

Update the post detail page so camera and lens metadata are actionable.

Recommended UI:

```text
Camera: Sony A7 III [Find product]
Lens: Tamron 28-75mm f/2.8 [Find product]
```

Create a reusable component if possible:

```tsx
<GearLinkAction kind="camera" name={post.camera_body} />
<GearLinkAction kind="lens" name={post.lens} />
```

The component should handle:

* button click
* loading state
* error state
* showing returned suggestions
* opening and closing a modal

Do not show the button if the camera/lens value is empty.

**Test**

* Camera button appears only when `camera_body` exists.
* Lens button appears only when `lens` exists.
* Clicking the button calls the backend.
* Loading text appears while waiting.
* Results appear in a modal.
* Modal can be closed.
* Error message appears if the request fails.

---

## Task 9.12 — Replace fake backend response with real AI integration

Add the real AI service in the backend.

Recommended backend structure:

```text
backend/
  internal/
    handler/
      ai_handler.go
    service/
      ai_service.go
    model/
      ai.go
```

The service should:

* receive `kind` and `name`
* create a careful AI prompt
* ask for structured JSON
* return product/spec link suggestions
* avoid exposing the AI API key to the frontend

The prompt should tell the AI:

* prefer official manufacturer pages
* use reliable product/spec pages
* do not invent URLs
* return low confidence if unsure
* return structured JSON only

**Test**

* Backend can call the AI API successfully.
* Real suggestions appear in the frontend modal.
* The response shape still matches OpenAPI.
* AI API key is loaded from backend environment variables.
* AI API key is not committed to Git.
* AI API key is not visible in browser dev tools.

---

## Task 9.13 — Add AI loading, error, and empty-result UX

Improve the user experience around the AI feature.

Handle these states:

* loading
* backend error
* unauthenticated user
* no suggestions found
* slow response
* invalid camera/lens text

Example messages:

```text
Finding product links...
```

```text
Could not find product links. Please try again.
```

```text
Log in to use AI gear search.
```

```text
No reliable product links were found.
```

Also include a small warning:

```text
AI suggestions may be imperfect. Please confirm the product page before buying.
```

**Test**

* User sees a loading state during the request.
* User sees a clear error if the request fails.
* Logged-out users cannot use the feature.
* Empty results do not break the UI.
* The modal never looks blank or frozen.

---

## Task 9.14 — Optional: Add simple AI result caching

This task is optional, but useful if you want to reduce repeated AI API calls.

Create a cache table:

```sql
CREATE TABLE gear_link_cache (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    response_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kind, name)
);
```

Behavior:

* Before calling AI, check if the same `kind` and `name` already exist in cache.
* If cached result exists, return it.
* If not, call AI and save the response.

**Test**

* First request for a camera/lens calls AI.
* Second request for the same camera/lens uses cached result.
* Cache data is stored in PostgreSQL.
* The frontend behavior does not change.

---

# Phase 10 — Ownership, validation, and UX polish

## Task 10.1 — Improve backend validation

Examples:

* caption length
* required fields
* safe file upload validation

**Test**

* Invalid payloads are rejected consistently.
* Errors are understandable, not generic crashes.

---

## Task 10.2 — Improve frontend validation

Do basic checks before submit.

**Test**

* Empty required fields show messages before request.
* User gets immediate feedback.

---

## Task 10.3 — Add loading and error states

For example:

* loading spinner on feed
* disabled submit button during request
* error messages on failure

**Test**

* Slow request visibly shows loading.
* Broken request shows an error instead of silent failure.

---

## Task 10.4 — Add authorization-based UI

Only show edit/delete buttons for owner.

**Test**

* Owner sees edit/delete.
* Other users do not.

---

# Phase 11 — Logging, observability, and cleanup

## Task 11.1 — Improve backend logs

Log major actions:

* signup attempt
* login success/failure
* post creation
* post deletion

Do not log raw passwords.

**Test**

* Important actions appear in logs.
* Sensitive values are not leaked.

---

## Task 11.2 — Standardize error responses

Have a consistent JSON shape for errors.

Example:

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Caption is required"
  }
}
```

**Test**

* Multiple endpoints return the same error structure style.
* Frontend can display backend errors consistently.

---

## Task 11.3 — Refactor obvious duplication

Examples:

* repeated request parsing
* repeated auth checks
* repeated frontend form logic

**Test**

* Code becomes shorter/clearer.
* Behavior remains unchanged after refactor.

---

# Phase 12 — Final portfolio version

## Task 12.1 — Seed some demo data

Create a few users and posts so the app is not empty in screenshots/demo.

**Test**

* Fresh setup can populate sample content quickly.

---

## Task 12.2 — Write a good README

Include:

* project overview
* tech stack
* architecture
* setup steps
* API notes
* screenshots
* future improvements

**Test**

* Someone else could plausibly run the project from the README.
* README makes the project sound coherent and intentional.

---

## Task 12.3 — Create screenshots or a short demo GIF/video

**Test**

* You can show:

  * signup/login
  * create post
  * feed
  * post detail
  * edit/delete
  * profile

---

## Task 12.4 — Deploy if possible

This is optional for MVP, but valuable for portfolio.

**Test**

* At least one reviewer can open the app without local setup.
* Core flows work on deployed version.

---

# Recommended build order inside the MVP

Do it in this order:

1. project setup
2. DB + migrations
3. backend skeleton
4. OpenAPI skeleton
5. signup/login backend
6. posts backend without real upload
7. frontend auth pages
8. frontend feed/create/detail
9. image upload
10. edit/delete/profile
11. polish
12. README/demo/deploy

That order reduces risk.

---

# Very important implementation trick

For faster progress, do **not** start with full image upload first.

Start with:

* backend accepts `image_path: "/demo/test.jpg"` or similar
* frontend displays placeholder images

Then once CRUD works, replace that with real upload support.

That lets you finish the hardest architectural parts before dealing with file handling.

---

# Minimal definition of “MVP finished”

You can say the MVP is done when all of these are true:

* user can sign up and log in
* authenticated user can create a post
* post includes photo + caption + metadata
* feed page shows posts
* detail page shows one post
* profile page shows a user’s posts
* owner can edit/delete own post
* backend has clear layered architecture
* DB uses goose migrations
* API contract is documented with OpenAPI
* frontend uses a dedicated API layer

If all of that works, you already have a strong internship portfolio project.
