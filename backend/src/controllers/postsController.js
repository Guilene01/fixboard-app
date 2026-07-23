const pool = require('../db/pool');

function nestComments(comments) {
  const byId = new Map();
  comments.forEach((c) => byId.set(c.id, { ...c, replies: [] }));

  const roots = [];
  byId.forEach((comment) => {
    if (comment.parent_comment_id && byId.has(comment.parent_comment_id)) {
      byId.get(comment.parent_comment_id).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots;
}

async function createPost(req, res, next) {
  try {
    const { title, description, tag_id, logs_text, what_tried } = req.body;

    if (!title || !description || !tag_id) {
      return res.status(400).json({ error: 'title, description, and tag_id are required' });
    }

    const tagCheck = await pool.query('SELECT id FROM tags WHERE id = $1', [tag_id]);
    if (tagCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid tag_id' });
    }

    const { rows } = await pool.query(
      `INSERT INTO posts (author_id, tag_id, title, description, logs_text, what_tried)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.userId, tag_id, title, description, logs_text || null, what_tried || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function listPosts(req, res, next) {
  try {
    const { tag } = req.query;
    const conditions = ['posts.deleted_at IS NULL'];
    const params = [];

    if (tag) {
      params.push(tag);
      conditions.push(`tags.name ILIKE $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT
         posts.id,
         posts.title,
         posts.description,
         posts.status,
         posts.created_at,
         users.name AS author_name,
         users.avatar_initials AS author_avatar_initials,
         tags.id AS tag_id,
         tags.name AS tag_name,
         (
           SELECT COUNT(*)::int FROM comments
           WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
         ) AS comment_count
       FROM posts
       JOIN users ON users.id = posts.author_id
       JOIN tags ON tags.id = posts.tag_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY posts.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getMyPosts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         posts.id,
         posts.title,
         posts.description,
         posts.status,
         posts.created_at,
         tags.id AS tag_id,
         tags.name AS tag_name
       FROM posts
       JOIN tags ON tags.id = posts.tag_id
       WHERE posts.author_id = $1 AND posts.deleted_at IS NULL
       ORDER BY posts.created_at DESC`,
      [req.userId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getPostById(req, res, next) {
  try {
    const { id } = req.params;

    const postResult = await pool.query(
      `SELECT
         posts.*,
         users.name AS author_name,
         users.avatar_initials AS author_avatar_initials,
         tags.name AS tag_name
       FROM posts
       JOIN users ON users.id = posts.author_id
       JOIN tags ON tags.id = posts.tag_id
       WHERE posts.id = $1 AND posts.deleted_at IS NULL`,
      [id]
    );

    const post = postResult.rows[0];
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const [commentsResult, attachmentsResult] = await Promise.all([
      pool.query(
        `SELECT comments.*, users.name AS author_name, users.avatar_initials AS author_avatar_initials
         FROM comments
         JOIN users ON users.id = comments.author_id
         WHERE comments.post_id = $1 AND comments.deleted_at IS NULL
         ORDER BY comments.created_at ASC`,
        [id]
      ),
      pool.query(
        `SELECT id, kind, file_url, uploaded_at FROM attachments WHERE post_id = $1 ORDER BY uploaded_at ASC`,
        [id]
      ),
    ]);

    res.json({
      ...post,
      comments: nestComments(commentsResult.rows),
      attachments: attachmentsResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

async function solvePost(req, res, next) {
  try {
    const { id } = req.params;
    const { comment_id } = req.body;

    if (!comment_id) {
      return res.status(400).json({ error: 'comment_id is required' });
    }

    const postResult = await pool.query(
      'SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    const post = postResult.rows[0];
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.author_id !== req.userId) {
      return res.status(403).json({ error: 'Only the post author can mark it solved' });
    }

    const commentResult = await pool.query(
      'SELECT id FROM comments WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL',
      [comment_id, id]
    );
    if (commentResult.rows.length === 0) {
      return res.status(400).json({ error: 'comment_id does not belong to this post' });
    }

    const { rows } = await pool.query(
      `UPDATE posts SET status = 'solved', solved_comment_id = $1 WHERE id = $2 RETURNING *`,
      [comment_id, id]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deletePost(req, res, next) {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE posts SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { createPost, listPosts, getMyPosts, getPostById, solvePost, deletePost };
