import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, MessageSquare } from 'lucide-react';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';
import TagBadge from './TagBadge';
import { timeAgo } from '../utils/formatTime';
import { useAuth } from '../context/AuthContext';
import { deletePost } from '../api/posts';

export default function PostRow({ post, onDeleted }) {
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
      className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-surface-raised sm:grid-cols-[auto_1fr_auto_auto_auto_auto]"
    >
      <StatusBadge status={post.status} />

      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold text-text group-hover:text-accent">
          {post.title}
        </h3>
        <p className="mt-0.5 hidden truncate text-sm text-text-muted sm:block">
          {post.description}
        </p>
      </div>

      <div className="hidden sm:block">
        <TagBadge name={post.tag_name} />
      </div>

      <div className="hidden items-center gap-2 sm:flex">
        <Avatar initials={post.author_avatar_initials} size="sm" />
        <span className="whitespace-nowrap text-sm text-text-muted">{post.author_name}</span>
      </div>

      <div className="hidden items-center gap-1.5 text-text-faint sm:flex" title="Comments">
        <MessageSquare size={14} />
        <span className="text-xs">{post.comment_count ?? 0}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-xs text-text-faint">
          {timeAgo(post.created_at)}
        </span>
        {isInstructor && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete post (instructor)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-danger-muted hover:text-danger disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
