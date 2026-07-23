# FixBoard Backend

Express + PostgreSQL API for FixBoard, a troubleshooting Q&A board for
DevOps/Cloud/SRE/Platform Engineering students.

This task covers the backend only — no frontend, no file upload handling,
no notification logic, no instructor moderation. The schema already has
the tables those later tasks need (`attachments`, `notifications`,
`parent_comment_id` on comments, `role` on users).

## Requirements

- Node.js 18+
- A running PostgreSQL instance

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a database:

   ```bash
   createdb fixboard
   ```

3. Copy the env file and adjust as needed:

   ```bash
   cp .env.example .env
   ```

   | Var | Description |
   |---|---|
   | `PORT` | Port the API listens on (default `3000`) |
   | `DATABASE_URL` | Postgres connection string |
   | `JWT_SECRET` | Secret used to sign auth tokens |
   | `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |

4. Run the server:

   ```bash
   npm start
   ```

   Migrations and the seed script run automatically on startup and are
   idempotent — safe to restart as many times as you like. On first boot
   this creates the 12 tags and a test account:

   - email: `test@fixboard.dev`
   - password: `password123`

   You can also run them manually:

   ```bash
   npm run migrate
   npm run seed
   ```

## Auth

Every route except `/auth/signup`, `/auth/login`, and `/health` requires
a bearer token, obtained from signup/login:

```
Authorization: Bearer <token>
```

## API Walkthrough (curl)

```bash
# Sign up
curl -X POST localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"password123"}'

# Log in (or use the seeded test account)
curl -X POST localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@fixboard.dev","password":"password123"}'
# => { "token": "...", "user": {...} }

TOKEN="paste-token-here"

# List tags (need a valid tag_id to create a post)
curl localhost:3000/tags -H "Authorization: Bearer $TOKEN"

# Create a post
curl -X POST localhost:3000/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "CrashLoopBackOff on my deployment",
        "description": "Pod keeps restarting after I changed the readiness probe.",
        "tag_id": 1,
        "logs_text": "Liveness probe failed: HTTP probe failed with statuscode: 500",
        "what_tried": "Increased initialDelaySeconds, still failing."
      }'

# List posts (optionally filter by tag name)
# Each post includes comment_count — the number of non-deleted comments
# on that post (top-level + replies), via a subquery, not N+1 fetches.
curl localhost:3000/posts -H "Authorization: Bearer $TOKEN"
curl "localhost:3000/posts?tag=Kubernetes" -H "Authorization: Bearer $TOKEN"

# Posts authored by the current user
curl localhost:3000/posts/mine -H "Authorization: Bearer $TOKEN"

# Full post detail (comments nested, attachments included)
curl localhost:3000/posts/1 -H "Authorization: Bearer $TOKEN"

# Add a comment
curl -X POST localhost:3000/posts/1/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Check if the readiness probe path actually exists."}'

# Reply to a comment
curl -X POST localhost:3000/posts/1/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"It does, but only after warm-up.","parent_comment_id":1}'

# Mark solved (post author only)
curl -X PATCH localhost:3000/posts/1/solve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment_id":1}'
```

## Project layout

```
src/
  config/       env loading
  controllers/  request handlers
  db/           pg pool, migrations, migration runner, seed script
  middleware/   auth middleware
  routes/       route definitions
  utils/        small helpers (initials, validators)
  app.js        express app + error handling
  server.js     entrypoint (runs migrations/seed, then listens)
```
