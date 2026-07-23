import { useState } from 'react';
import { Send } from 'lucide-react';
import Button from './Button';

export default function CommentForm({
  onSubmit,
  placeholder = 'Write a comment…',
  submitLabel = 'Comment',
  onCancel,
  autoFocus = false,
}) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      await onSubmit(content);
      setContent('');
      onCancel?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        autoFocus={autoFocus}
        rows={3}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-border bg-surface-raised px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="px-3 py-1.5 text-xs">
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting || !content.trim()}
          className="px-3 py-1.5 text-xs"
        >
          {submitting ? 'Posting…' : submitLabel}
          {!submitting && <Send size={13} />}
        </Button>
      </div>
    </form>
  );
}
