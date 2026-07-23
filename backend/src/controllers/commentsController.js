const pool = require('../db/pool');

async function createComment(req, res, next) {
  try {
    const { id: postId } = req.params;
    const { content, parent_comment_id } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const postResult = await pool.query(
      'SELECT id, author_id FROM posts WHERE id = $1 AND deleted_at IS NULL',
      [postId]
    );
    const post = postResult.rows[0];
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (parent_comment_id) {
      const parentResult = await pool.query(
        'SELECT id FROM comments WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL',
        [parent_comment_id, postId]
      );
      if (parentResult.rows.length === 0) {
        return res.status(400).json({ error: 'parent_comment_id does not belong to this post' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO comments (post_id, author_id, parent_comment_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [postId, req.userId, parent_comment_id || null, content]
    );

    const comment = rows[0];

    if (post.author_id !== req.userId) {
      await pool.query(
        `INSERT INTO notifications (user_id, post_id, comment_id) VALUES ($1, $2, $3)`,
        [post.author_id, postId, comment.id]
      );
    }

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    const { id: postId, commentId } = req.params;

    const { rows } = await pool.query(
      `UPDATE comments SET deleted_at = now()
       WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [commentId, postId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { createComment, deleteComment };
