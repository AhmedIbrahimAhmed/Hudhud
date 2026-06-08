import { useRef, useState } from 'react';

// Custom file input with drag-and-drop. Calls onFile(file) when a file is
// chosen via click or drop.
//   onFile      - (File) => void
//   uploading   - show the "uploading…" state
//   fileName    - name of the currently selected/uploaded file (optional)
//   accept      - input accept attribute (optional)
//   disabled    - disable interaction
export default function FileDropzone({
  onFile,
  uploading = false,
  fileName = '',
  accept,
  disabled = false,
  hint = 'اسحب الملف هنا أو اضغط للاختيار',
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function pick(file) {
    if (file && !disabled) onFile(file);
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-xl border-2 border-dashed p-4 text-center transition select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${
        dragOver
          ? 'border-brand bg-brand-light/50'
          : 'border-gray-200 hover:border-brand hover:bg-gray-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = ''; // allow re-selecting the same file
        }}
        className="hidden"
      />

      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <span className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          جارٍ الرفع…
        </div>
      ) : fileName ? (
        <div className="text-xs text-gray-700">
          <div className="text-xl mb-1">✅</div>
          <p className="truncate">{fileName}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">اضغط لاستبدال الملف</p>
        </div>
      ) : (
        <>
          <div className="text-2xl mb-1 text-gray-400">📎</div>
          <p className="text-xs text-gray-500">{hint}</p>
          <p className="text-[10px] text-gray-400 mt-1">صور، PDF، ZIP، RAR — حتى 50 ميجابايت</p>
        </>
      )}
    </div>
  );
}
