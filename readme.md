# Photo Share

Photo Share is a full-stack photo-sharing web application built with Go, React, TypeScript, and PostgreSQL.

Users can sign up, log in, create photo posts, upload images, add caption/location/camera/lens metadata, view a public feed, view individual posts, view user profiles, and edit or delete their own posts.

The project also includes an AI-powered gear link assistant that helps users find product/spec links for camera bodies and lenses mentioned in posts.

## Features

- User signup and login
- JWT-based authentication
- Create photo posts with uploaded images
- Add caption, location, camera body, and lens metadata
- View a feed of recent posts
- View individual post detail pages
- View user profile pages
- Edit and delete owned posts
- Protected routes for authenticated actions
- AI gear link assistant for camera/lens product suggestions
- OpenAPI-documented backend API

## Tech Stack

### Frontend

- React
- TypeScript
- React Router
- Vite
- CSS

### Backend

- Go
- PostgreSQL
- go-jet
- goose migrations
- JWT authentication
- OpenAPI

### AI Integration

- Backend-only AI API integration
- Structured JSON responses for gear link suggestions

### Development Tools

- Git / GitHub
- VS Code
- curl for API testing

## Architecture

The project is split into a frontend, backend, database, and OpenAPI contract.

```text
photo-share/
  backend/
    cmd/server/              # Go server entry point
    internal/handler/        # HTTP handlers
    internal/service/        # Business logic
    internal/repository/     # Database queries
    internal/middleware/     # Auth, CORS, logging, recovery
    internal/db/             # Database generated models
    internal/dto/            # Shared data transfer objects
    internal/config/         # Environment/config loading
    internal/httpx/          # Shared response writer utility
    internal/storage/        # Local storage for uploaded images
    migrations/              # goose migration files

  frontend/
    src/
      api/                   # API client functions
      auth/                  # Global auth state
      components/            # Reusable UI components
      pages/                 # Route-level page components
      routes/                # Route protection wrappers
      types/                 # TypeScript types
      utils/                 # Helper functions

  openapi/
    openapi.yaml             # API contract

  docs/
    screenshots/             # README screenshots
```

## Environment Variables

Create environment files in ```backend/.env``` based on the examples in ```backend/.env.example```

## Local Setup

This section is a stub.

## API Notes

The backend API is documented with OpenAPI.

Main endpoint groups:

```text
auth:
  POST /auth/signup
  POST /auth/login
  GET  /users/{id}

posts:
  GET    /posts
  GET    /posts/{id}
  POST   /posts
  PUT    /posts/{id}
  DELETE /posts/{id}

uploads:
  POST /uploads

ai:
  POST /ai/gear-link
```

Protected endpoints require a Bearer token:

```http
Authorization: Bearer <token>
```

The OpenAPI spec is located at:

```text
openapi/openapi.yaml
```

## Screenshots

### Feed

![Feed page](docs/screenshots/feed.png)

### Post Detail

![Post detail page](docs/screenshots/post-detail.png)

### Edit Post

![Edit post](docs/screenshots/edit-post.png)

### Profile

![Profile page](docs/screenshots/profile.png)

### AI Gear Link Assistant

![AI gear link modal](docs/screenshots/ai-gear-link.png)

## Future Improvements

- Improve create post ui
- Deploy the frontend and backend
- Store uploaded images in cloud storage such as S3
- Add comments and likes
- Add follow/follower relationships
- Add post search and filtering
- Add pagination or infinite scrolling to the feed
- Improve AI gear link accuracy with caching and stricter source validation
- Add automated backend and frontend tests
- Add refresh tokens or cookie-based authentication

## Development Notes

This project uses a layered backend architecture:

- Handlers parse HTTP requests and return HTTP responses.
- Services contain business logic.
- Repositories handle database access.
- Middleware handles cross-cutting concerns such as authentication, CORS, logging, and panic recovery.

The frontend uses a dedicated API layer so page components do not directly hardcode fetch logic everywhere.