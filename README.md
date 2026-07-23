# FixBoard

A troubleshooting Q&A board for DevOps/Cloud/SRE/Platform Engineering
students. Posts capture full problem context — environment, logs,
architecture — so answers become a searchable, reusable knowledge base
instead of one-off chat messages.

This is a teaching project. The stack is kept deliberately simple so the
complexity budget stays available for the Kubernetes deployment lessons
that come after this.

## Stack

- **Backend:** Node.js + Express + PostgreSQL ([backend/](backend))
- **Frontend:** React (Vite build), served as a static bundle via Nginx ([frontend/](frontend))
- **Local orchestration:** Docker Compose (this README)

## Quick start

Requirements: Docker + Docker Compose.

```bash
docker compose up --build
```

That's it — no manual setup required. This brings up three services:

| Service    | URL                     | What it is                          |
|------------|--------------------------|--------------------------------------|
| frontend   | http://localhost:8090    | The web app                          |
| backend    | http://localhost:3000    | The API (migrations + seed run automatically on boot) |
| postgres   | localhost:5432           | Database (not needed directly)       |

Open **http://localhost:8090** and log in with a seeded test account:

| Role       | Email                     | Password      |
|------------|----------------------------|---------------|
| Student    | `test@fixboard.dev`        | `password123` |
| Instructor | `instructor@fixboard.dev`  | `password123` |

To stop everything: `docker compose down`. To also wipe the database and
uploaded files: `docker compose down -v`.

### Configuring it

Defaults are baked into `docker-compose.yml`, so the command above works
with zero configuration. To override anything (ports, credentials, JWT
secret), copy the env file and edit it:

```bash
cp .env.example .env
```

`docker compose` picks up `.env` automatically. See `.env.example` for
every variable.

**Note:** `FRONTEND_PORT` and `POSTGRES_PORT` are read at container
*start* time, but `BACKEND_PORT` is also baked into the frontend's
JavaScript bundle at *build* time (Vite inlines it as the API base URL).
If you change `BACKEND_PORT`, rebuild: `docker compose up --build`.

## Architecture notes

- **File uploads** land on a named Docker volume (`uploads_data`) mounted
  into the backend container at `/app/uploads`, and are served back out
  under `/uploads/*`. The backend only ever treats this as "a writable
  directory it was handed" — swapping it for an EFS-backed PVC at the
  Kubernetes stage is a volume-mount change, not a code change.
- **Soft delete:** instructor deletes (of posts or comments) set a
  `deleted_at` timestamp rather than removing rows. This sidesteps
  cascade edge cases (a deleted comment with replies, a deleted post's
  attachments/notifications) while keeping the FK graph intact. Deleted
  rows are simply filtered out of every read query.
- **Notifications** are a minimal unread-count model, not an inbox: a row
  is written when someone comments on your post (not when you comment on
  your own), the frontend polls `GET /notifications/unread-count` for the
  nav badge, and opening My Posts marks everything read.

## Repo layout

```
backend/    Express API — see backend/README.md for endpoints, schema, local (non-Docker) run instructions
frontend/   React app — see frontend/README.md for local (non-Docker) dev instructions
docker-compose.yml
.env.example
```

For day-to-day frontend/backend development (hot reload, debugging one
service in isolation) see the README in each subdirectory — Compose is
the "run the whole thing like production" path, not the dev loop.

## End-to-end flow this was verified against

Signup (student) → browse dashboard → filter by tag → create a post with
an architecture image and a log file → a second student comments on it →
original poster sees an unread badge on My Posts → opens the post, marks
a comment as the solution → an instructor deletes a test post and a test
comment.
