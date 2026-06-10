import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ImagePreviewModal({ imageUrl, fileName, onClose }) {
  // Handle ESC key press
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!imageUrl) return null;

  // Render through a portal to <body> so the fixed overlay covers the whole
  // viewport even when opened from inside a transformed ancestor (the sidebars
  // and drawers use translate-x, which would otherwise trap position:fixed).
  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/90 sm:bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      {/* Close button: fixed to the viewport corner so it is always visible/tappable */}
      <button
        onClick={onClose}
        className="fixed top-3 left-3 sm:top-4 sm:left-4 z-[60] flex items-center justify-center w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-white/70"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          left: 'max(0.75rem, env(safe-area-inset-left))',
        }}
        title="إغلاق"
        aria-label="إغلاق"
      >
        ✕
      </button>

      <div
        className="relative flex flex-col items-center justify-center w-full h-full sm:w-auto sm:h-auto max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={fileName || 'صورة'}
          className="object-contain w-full h-full sm:w-auto sm:h-auto max-w-full max-h-screen sm:max-h-[85vh] sm:rounded-lg"
        />
        {fileName && (
          <p className="text-white text-xs sm:text-sm text-center mt-3 max-w-full truncate px-2">
            {fileName}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
