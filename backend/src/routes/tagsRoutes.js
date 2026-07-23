const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listTags } = require('../controllers/tagsController');

const router = express.Router();

router.use(requireAuth);
router.get('/', listTags);

module.exports = router;
