# FixBoard Frontend

React SPA for FixBoard, built against the [Task 1 backend API](../backend/README.md).

## Requirements

- Node.js 18+
- The backend running (see `../backend/README.md`) — the frontend calls it directly, it does not proxy or mock anything.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Point the app at your backend:

   ```bash
   cp .env.example .env
   ```

   `VITE_API_URL` defaults to `http://localhost:3000`, matching the backend's default port.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Opens at `http://localhost:5173`. Log in with the seeded test account
   (`test@fixboard.dev` / `password123`) or sign up a new one.

## Production build

The final deployment target is a static bundle served by Nginx (matches how
it will run in Docker/Kubernetes later) — not the Vite dev server.

```bash
npm run build      # outputs to dist/
npm run preview    # sanity-check the build locally
```

Vite inlines `VITE_API_URL` at build time, so point it at wherever the
backend will actually be reachable from the browser before building:

```bash
VITE_API_URL=https://api.fixboard.example.com npm run build
```

### Docker

A `Dockerfile` + `nginx.conf` are included — multi-stage build that compiles
the app with Node, then serves `dist/` with Nginx (with an SPA fallback so
client-side routes like `/posts/42` don't 404 on refresh).

```bash
docker build -t fixboard-frontend --build-arg VITE_API_URL=http://localhost:3000 .
docker run -p 8090:80 fixboard-frontend
```

For running the whole stack together (Postgres + backend + frontend), see the
[root README](../README.md) and `docker-compose.yml` — that's the normal way
to run this in Docker, not building the frontend image standalone.

## Project layout

```
src/
  api/          fetch wrapper + one module per resource (auth, posts, tags, notifications)
  components/   shared UI (rows/cards, badges, forms, layout/nav, theme toggle)
  context/      AuthContext, NotificationsContext, ThemeContext
  pages/        one component per route
  utils/        tag-icon mapping, relative time formatting, asset URL resolution
```

## Theming

Light is the default theme; the sun/moon toggle in the nav (and on the
login/signup pages) switches to dark and persists the choice to
`localStorage`. Both themes are defined purely as CSS custom-property
overrides in `src/index.css` (`:root` for light, `[data-theme="dark"]` for
dark) — components reference semantic tokens like `bg-surface` or
`text-accent`, never a raw color, so the whole app repaints from one file.

## Notes on scope

- Auth token + user are stored in `localStorage`; a 401 from any
  authenticated request clears them and hard-redirects to `/login`.
- Comment counts aren't shown in the Dashboard row list — `GET /posts` doesn't
  return them, and adding either a backend query change or a per-post fetch
  was out of scope for the (styling-only) task that introduced the row
  layout. Follow-up: add a comment count to the `GET /posts` response.
