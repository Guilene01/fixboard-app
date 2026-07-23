import { X } from 'lucide-react';

export default function ImageLightbox({ src, alt, onClose }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
    >
      <button
        onClick={onClose}
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-text hover:bg-surface-raised"
      >
        <X size={18} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}
