export default function TextField({ label, icon: Icon, type = 'text', ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      <div className="relative">
        {Icon && (
          <Icon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
          />
        )}
        <input
          type={type}
          className={`w-full rounded-lg border border-border bg-surface-raised py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${
            Icon ? 'pl-9 pr-3.5' : 'px-3.5'
          }`}
          {...props}
        />
      </div>
    </label>
  );
}
