import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Fullscreen in-app PDF preview. Embeds the PDF natively via an <iframe> so no
// extra dependency is needed. Backdrop click + ESC close the modal (mirrors
// ImagePreviewModal). Responsive: the embed fills the available height on every
// screen size, with an "open in new tab" fallback for browsers that refuse to
// render PDFs inline.
export default function PdfPreviewModal({ fileUrl, fileName, onClose }) {
  // Handle ESC key press
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!fileUrl) return null;

  // Portal to <body> so the fixed overlay covers the whole viewport even when
  // opened from inside a transformed ancestor (sidebars/drawers use translate-x,
  // which would otherwise trap position:fixed within that panel).
  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
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
        className="relative flex flex-col w-full max-w-4xl h-[85vh] sm:h-[88vh] bg-white rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: filename + open/download fallback */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
          <p className="text-xs sm:text-sm text-gray-700 truncate flex items-center gap-1.5">
            📄 <span className="truncate">{fileName || 'ملف PDF'}</span>
          </p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-brand hover:underline flex items-center gap-1"
            title="فتح في علامة تبويب جديدة"
          >
            فتح في نافذة جديدة <span className="text-[10px]">↗</span>
          </a>
        </div>

        {/* Native PDF embed */}
        <iframe
          src={fileUrl}
          title={fileName || 'ملف PDF'}
          className="flex-1 w-full bg-gray-100"
        />
      </div>
    </div>,
    document.body
  );
}
