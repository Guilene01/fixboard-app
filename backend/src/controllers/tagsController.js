const pool = require('../db/pool');

async function listTags(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT id, name FROM tags ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listTags };
