const VARIANTS = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-sm shadow-accent/20',
  secondary:
    'bg-surface-raised text-text border border-border hover:border-border-hover',
  ghost: 'text-text-muted hover:text-text hover:bg-surface-raised',
  danger: 'bg-danger-muted text-danger hover:bg-danger/20',
};

export default function Button({
  variant = 'primary',
  className = '',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
