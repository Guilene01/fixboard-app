import { Loader2 } from 'lucide-react';

export default function Spinner({ label = 'Loading…', full = false }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 text-sm text-text-muted ${
        full ? 'py-24' : 'py-8'
      }`}
    >
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}
