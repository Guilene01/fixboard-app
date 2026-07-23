import { getTagIcon } from '../utils/tagIcons';

export default function TagBadge({ name }) {
  const Icon = getTagIcon(name);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-muted px-2.5 py-1 text-xs font-medium text-accent">
      <Icon size={13} />
      {name}
    </span>
  );
}
