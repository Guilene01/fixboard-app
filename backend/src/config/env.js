require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'),
};
