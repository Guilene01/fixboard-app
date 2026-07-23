const pool = require('../db/pool');

async function getUnreadCount(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getUnreadCount, markRead };
