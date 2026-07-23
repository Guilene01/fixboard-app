const fs = require('fs');
const pool = require('../db/pool');

const VALID_KINDS = ['architecture', 'log'];

function cleanup(file) {
  if (file) fs.unlink(file.path, () => {});
}

async function uploadAttachment(req, res, next) {
  try {
    const { id: postId } = req.params;
    const { kind } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    if (!VALID_KINDS.includes(kind)) {
      cleanup(req.file);
      return res.status(400).json({ error: "kind must be 'architecture' or 'log'" });
    }

    const postResult = await pool.query(
      'SELECT author_id FROM posts WHERE id = $1 AND deleted_at IS NULL',
      [postId]
    );
    const post = postResult.rows[0];
    if (!post) {
      cleanup(req.file);
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.author_id !== req.userId) {
      cleanup(req.file);
      return res.status(403).json({ error: 'Only the post author can add attachments' });
    }

    if (kind === 'architecture' && !req.file.mimetype.startsWith('image/')) {
      cleanup(req.file);
      return res.status(400).json({ error: 'Architecture attachment must be an image' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const { rows } = await pool.query(
      `INSERT INTO attachments (post_id, kind, file_url) VALUES ($1, $2, $3) RETURNING *`,
      [postId, kind, fileUrl]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    cleanup(req.file);
    next(err);
  }
}

module.exports = { uploadAttachment };
