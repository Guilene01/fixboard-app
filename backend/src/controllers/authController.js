const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { getInitials } = require('../utils/initials');
const { isValidEmail } = require('../utils/validators');
const { jwtSecret, jwtExpiresIn } = require('../config/env');

const SALT_ROUNDS = 10;

async function signup(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const avatarInitials = getInitials(name);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, avatar_initials)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, avatar_initials, created_at`,
      [name, email, passwordHash, avatarInitials]
    );

    const user = rows[0];
    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: jwtExpiresIn });

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: jwtExpiresIn });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_initials: user.avatar_initials,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login };
