const pool = require('../db/pool');

async function requireInstructor(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    if (!rows[0] || rows[0].role !== 'instructor') {
      return res.status(403).json({ error: 'Instructor role required' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireInstructor };
