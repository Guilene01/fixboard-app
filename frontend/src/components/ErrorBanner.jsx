import { AlertTriangle, X } from 'lucide-react';

export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-muted px-3.5 py-2.5 text-sm text-danger">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 text-danger/70 hover:text-danger">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
