-- Instructor moderation (Task 3): soft delete for posts and comments.
-- Soft delete avoids cascade headaches (a deleted comment's replies, a
-- deleted post's attachments/notifications) and keeps the FK graph intact.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at ON comments(deleted_at);
