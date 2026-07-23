import { CheckCircle2, CircleDot } from 'lucide-react';

export default function StatusBadge({ status }) {
  const isSolved = status === 'solved';
  const Icon = isSolved ? CheckCircle2 : CircleDot;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isSolved ? 'bg-solved-muted text-solved' : 'bg-open-muted text-open'
      }`}
    >
      <Icon size={14} strokeWidth={2.5} />
      {isSolved ? 'Solved' : 'Open'}
    </span>
  );
}
