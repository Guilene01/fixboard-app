import { useState } from 'react';
import { Reply, CheckCircle2, Award, Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import CommentForm from './CommentForm';
import { timeAgo } from '../utils/formatTime';

export default function CommentThread({
  comment,
  canSolve,
  solvedCommentId,
  onReply,
  onSolve,
  canDelete,
  onDelete,
  depth = 0,
}) {
  const [replying, setReplying] = useState(false);
  const isAccepted = comment.id === solvedCommentId;

  return (
    <div className={depth > 0 ? 'ml-5 border-l border-border pl-5 sm:ml-8 sm:pl-6' : ''}>
      <div
        className={`rounded-xl border p-4 ${
          isAccepted ? 'border-solved/40 bg-solved-muted' : 'border-border bg-surface'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Avatar initials={comment.author_avatar_initials} size="sm" />
            <div>
              <span className="text-sm font-medium text-text">{comment.author_name}</span>
              <span className="ml-2 text-xs text-text-faint">{timeAgo(comment.created_at)}</span>
            </div>
          </div>
          {isAccepted && (
            <span className="flex items-center gap-1 rounded-full bg-solved/15 px-2.5 py-1 text-xs font-medium text-solved">
              <Award size={13} />
              Accepted Solution
            </span>
          )}
        </div>

        <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-text">
          {comment.content}
        </p>

        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={() => setReplying((r) => !r)}
            className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-accent"
          >
            <Reply size={13} />
            Reply
          </button>
          {canSolve && !isAccepted && (
            <button
              onClick={() => onSolve(comment.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-solved"
            >
              <CheckCircle2 size={13} />
              Mark as solution
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="ml-auto flex items-center gap-1.5 text-xs font-medium text-text-faint hover:text-danger"
              title="Delete comment (instructor)"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {replying && (
          <div className="mt-3">
            <CommentForm
              placeholder={`Reply to ${comment.author_name}…`}
              submitLabel="Reply"
              autoFocus
              onCancel={() => setReplying(false)}
              onSubmit={(content) => onReply(comment.id, content)}
            />
          </div>
        )}
      </div>

      {comment.replies?.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              canSolve={canSolve}
              solvedCommentId={solvedCommentId}
              onReply={onReply}
              onSolve={onSolve}
              canDelete={canDelete}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
