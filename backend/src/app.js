const express = require('express');
const cors = require('cors');
const multer = require('multer');
const authRoutes = require('./routes/authRoutes');
const postsRoutes = require('./routes/postsRoutes');
const tagsRoutes = require('./routes/tagsRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');
const { uploadsDir } = require('./config/env');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/uploads', express.static(uploadsDir));

app.use('/auth', authRoutes);
app.use('/posts', postsRoutes);
app.use('/tags', tagsRoutes);
app.use('/notifications', notificationsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 8MB)' : err.message;
    return res.status(400).json({ error: message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
