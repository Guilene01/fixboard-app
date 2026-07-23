const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireInstructor } = require('../middleware/requireInstructor');
const upload = require('../middleware/upload');
const {
  createPost,
  listPosts,
  getMyPosts,
  getPostById,
  solvePost,
  deletePost,
} = require('../controllers/postsController');
const { createComment, deleteComment } = require('../controllers/commentsController');
const { uploadAttachment } = require('../controllers/attachmentsController');

const router = express.Router();

router.use(requireAuth);

router.post('/', createPost);
router.get('/', listPosts);
router.get('/mine', getMyPosts);
router.get('/:id', getPostById);
router.post('/:id/comments', createComment);
router.patch('/:id/solve', solvePost);
router.post('/:id/attachments', upload.single('file'), uploadAttachment);
router.delete('/:id', requireInstructor, deletePost);
router.delete('/:id/comments/:commentId', requireInstructor, deleteComment);

module.exports = router;
