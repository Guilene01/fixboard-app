import { getTagIcon } from '../utils/tagIcons';
import { LayoutGrid } from 'lucide-react';

export default function TagFilter({ tags, active, onChange }) {
  return (
    <div className="scrollbar-thin flex items-center gap-2 overflow-x-auto pb-1">
      <FilterPill label="All" icon={LayoutGrid} isActive={!active} onClick={() => onChange(null)} />
      {tags.map((tag) => (
        <FilterPill
          key={tag.id}
          label={tag.name}
          icon={getTagIcon(tag.name)}
          isActive={active === tag.name}
          onClick={() => onChange(tag.name)}
        />
      ))}
    </div>
  );
}

function FilterPill({ label, icon: Icon, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
        isActive
          ? 'border-accent bg-accent-muted text-accent'
          : 'border-border bg-surface text-text-muted hover:border-border-hover hover:text-text'
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
