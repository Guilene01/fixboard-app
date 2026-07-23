import { useRef, useState } from 'react';
import { UploadCloud, X, FileText, Image as ImageIcon } from 'lucide-react';

const MAX_SIZE = 8 * 1024 * 1024;

export default function FileUpload({ label, hint, accept, file, onChange, kind = 'file' }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const Icon = kind === 'image' ? ImageIcon : FileText;

  function handleSelect(e) {
    const selected = e.target.files?.[0] || null;
    if (selected && selected.size > MAX_SIZE) {
      setError('File is too large (max 8MB).');
      e.target.value = '';
      return;
    }
    setError('');
    onChange(selected);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        <span className="text-xs text-text-faint">{hint || 'Max 8MB'}</span>
      </div>

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleSelect} />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-4 text-sm text-text-faint transition-colors duration-150 hover:border-border-hover hover:text-text-muted"
        >
          <UploadCloud size={16} />
          Choose a file
        </button>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-3.5 py-2.5 text-sm text-text">
          <span className="flex items-center gap-2 truncate">
            <Icon size={15} className="shrink-0 text-text-faint" />
            <span className="truncate">{file.name}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="shrink-0 text-text-faint hover:text-danger"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
