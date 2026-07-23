-- FixBoard initial schema
-- Enums are implemented as TEXT + CHECK constraints to keep things simple
-- and easy for students to alter later without ALTER TYPE gymnastics.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'instructor')),
  avatar_initials TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- solved_comment_id references comments(id), created below. The column is
-- defined here and the FK constraint is added after the comments table
-- exists, since posts <-> comments reference each other.
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  logs_text TEXT,
  what_tried TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'solved')),
  solved_comment_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('architecture', 'log', 'other')),
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  parent_comment_id INTEGER REFERENCES comments(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_solved_comment_id_fkey'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_solved_comment_id_fkey
      FOREIGN KEY (solved_comment_id) REFERENCES comments(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_tag_id ON posts(tag_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id);
