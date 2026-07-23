import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Download,
  ClipboardList,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { getPost, addComment, solvePost, deletePost, deleteComment } from '../api/posts';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import StatusBadge from '../components/StatusBadge';
import TagBadge from '../components/TagBadge';
import CommentThread from '../components/CommentThread';
import CommentForm from '../components/CommentForm';
import ImageLightbox from '../components/ImageLightbox';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import { timeAgo } from '../utils/formatTime';
import { assetUrl } from '../utils/assetUrl';

function countComments(comments) {
  return comments.reduce((sum, c) => sum + 1 + countComments(c.replies || []), 0);
}

export default function ThreadPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [uploadErrors, setUploadErrors] = useState(location.state?.uploadErrors || []);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchPost = useCallback(async () => {
    try {
      const data = await getPost(id);
      setPost(data);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchPost().finally(() => setLoading(false));
  }, [fetchPost]);

  async function handleReply(parentCommentId, content) {
    await addComment(id, { content, parent_comment_id: parentCommentId });
    await fetchPost();
  }

  async function handleSolve(commentId) {
    await solvePost(id, commentId);
    await fetchPost();
  }

  async function handleDeletePost() {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deletePost(id);
      navigate('/');
    } catch (err) {
      setActionError(err.message);
      setDeleting(false);
    }
  }

  async function handleDeleteComment(commentId) {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    try {
      await deleteComment(id, commentId);
      await fetchPost();
    } catch (err) {
      setActionError(err.message);
    }
  }

  if (loading) return <Spinner label="Loading post…" full />;

  if (error || !post) {
    return (
      <EmptyState
        icon={FileText}
        title="Couldn't load this post"
        description={error || 'It may have been removed.'}
      />
    );
  }

  const architectureImage = post.attachments?.find((a) => a.kind === 'architecture');
  const logFiles = post.attachments?.filter((a) => a.kind === 'log') || [];
  const canSolve = post.status === 'open' && user?.id === post.author_id;
  const isInstructor = user?.role === 'instructor';
  const commentCount = countComments(post.comments || []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <button
        onClick={() => navigate(-1)}
        className="flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft size={15} />
        Back
      </button>

      {uploadErrors.length > 0 && (
        <ErrorBanner message={uploadErrors.join(' ')} onDismiss={() => setUploadErrors([])} />
      )}
      <ErrorBanner message={actionError} />

      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold leading-snug text-text">{post.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={post.status} />
            {isInstructor && (
              <button
                onClick={handleDeletePost}
                disabled={deleting}
                title="Delete post (instructor)"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-faint transition-colors duration-150 hover:bg-danger-muted hover:text-danger disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TagBadge name={post.tag_name} />
          <div className="flex items-center gap-2">
            <Avatar initials={post.author_avatar_initials} size="sm" />
            <span className="text-sm text-text-muted">
              {post.author_name} · {timeAgo(post.created_at)}
            </span>
          </div>
        </div>

        <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-text">
          {post.description}
        </p>

        {post.logs_text && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
              Logs
            </h3>
            <pre className="scrollbar-thin overflow-x-auto rounded-lg border border-border bg-bg px-4 py-3 font-mono text-xs leading-relaxed text-text-muted">
              {post.logs_text}
            </pre>
          </div>
        )}

        {post.what_tried && (
          <div className="mt-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-faint">
              <ClipboardList size={13} />
              What's been tried
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-muted">
              {post.what_tried}
            </p>
          </div>
        )}

        {(architectureImage || logFiles.length > 0) && (
          <div className="mt-5 flex flex-col gap-3">
            {architectureImage && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Architecture
                </h3>
                <img
                  src={assetUrl(architectureImage.file_url)}
                  alt="Architecture diagram"
                  onClick={() => setLightboxSrc(assetUrl(architectureImage.file_url))}
                  className="w-auto cursor-zoom-in rounded-lg border border-border object-contain"
                  style={{ height: '280px' }}
                />
              </div>
            )}

            {logFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {logFiles.map((log) => (
                  <a
                    key={log.id}
                    href={assetUrl(log.file_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-medium text-text-muted hover:border-border-hover hover:text-text"
                  >
                    <Download size={13} />
                    Log file
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <MessageSquare size={15} />
          {commentCount} {commentCount === 1 ? 'Comment' : 'Comments'}
        </h2>

        {post.comments?.length > 0 ? (
          <div className="flex flex-col gap-3">
            {post.comments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                canSolve={canSolve}
                solvedCommentId={post.solved_comment_id}
                onReply={handleReply}
                onSolve={handleSolve}
                canDelete={isInstructor}
                onDelete={handleDeleteComment}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-faint">No comments yet — be the first to help.</p>
        )}

        <div className="rounded-xl border border-border bg-surface p-4">
          <CommentForm
            placeholder="Share a suggestion or ask a clarifying question…"
            submitLabel="Comment"
            onSubmit={(content) => handleReply(undefined, content)}
          />
        </div>
      </div>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Architecture diagram"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
