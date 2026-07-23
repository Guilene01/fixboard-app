import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';
import TagBadge from './TagBadge';
import { timeAgo } from '../utils/formatTime';
import { useAuth } from '../context/AuthContext';
import { deletePost } from '../api/posts';

export default function PostCard({ post, onDeleted }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const isInstructor = user?.role === 'instructor';

  async function handleDelete(e) {
    e.stopPropagation();
    if (!window.confirm('Delete this post? This cannot be undone.')) return;

    setDeleting(true);
    try {
      await deletePost(post.id);
      onDeleted?.(post.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/posts/${post.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/posts/${post.id}`)}
      className="group flex w-full cursor-pointer flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-left transition-colors duration-150 hover:border-border-hover hover:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-text group-hover:text-accent-hover">
          {post.title}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={post.status} />
          {isInstructor && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete post (instructor)"
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-danger-muted hover:text-danger disabled:opacity-50"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-text-muted">
        {post.description}
      </p>

      <div className="mt-1 flex items-center justify-between">
        <TagBadge name={post.tag_name} />
        {post.author_name && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-text-faint">
              <Clock size={12} />
              {timeAgo(post.created_at)}
            </span>
            <Avatar initials={post.author_avatar_initials} size="sm" />
          </div>
        )}
        {!post.author_name && (
          <span className="flex items-center gap-1 text-xs text-text-faint">
            <Clock size={12} />
            {timeAgo(post.created_at)}
          </span>
        )}
      </div>
    </div>
  );
}
