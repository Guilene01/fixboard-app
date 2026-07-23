export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-20 text-center">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-text-faint">
          <Icon size={26} />
        </div>
      )}
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
