export default function Textarea({ label, hint, mono = false, ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        {hint && <span className="text-xs text-text-faint">{hint}</span>}
      </div>
      <textarea
        className={`w-full resize-y rounded-lg border border-border bg-surface-raised px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${
          mono ? 'font-mono text-[13px]' : ''
        }`}
        {...props}
      />
    </label>
  );
}
