import { useEffect } from 'react';

export default function ImagePreviewModal({ imageUrl, fileName, onClose }) {
  if (!imageUrl) return null;

  // Handle ESC key press
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center"
      onClick={onClose}
    >
      <div 
        className="relative w-auto h-auto max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300 transition-colors z-10"
          title="إغلاق"
        >
          ✕
        </button>
        <img
          src={imageUrl}
          alt={fileName || 'صورة'}
          className="object-contain w-auto h-auto max-w-[90vw] max-h-[90vh]"
        />
        {fileName && (
          <p className="text-white text-sm text-center mt-3 truncate">{fileName}</p>
        )}
      </div>
    </div>
  );
}
