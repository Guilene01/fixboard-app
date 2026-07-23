const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getUnreadCount, markRead } = require('../controllers/notificationsController');

const router = express.Router();

router.use(requireAuth);

router.get('/unread-count', getUnreadCount);
router.patch('/read', markRead);

module.exports = router;
