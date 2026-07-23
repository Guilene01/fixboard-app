const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
};

export default function Avatar({ initials, size = 'md' }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent-muted font-semibold text-accent ${SIZES[size]}`}
    >
      {initials}
    </div>
  );
}
