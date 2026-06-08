import MicDictation from './MicDictation.jsx';

// Presentational editor: a full-width title block on top, then a full-width
// body block below (with word count + process button).
export default function ArticleEditor({
  title,
  setTitle,
  body,
  setBody,
  onProcess,
  processing,
  online = true,
}) {
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const appendTranscript = (text) =>
    setBody((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));

  return (
    <div className="flex flex-col gap-4">
      {/* Title block — full width, on top */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان المقال…"
          className="w-full text-lg font-bold focus:outline-none placeholder:text-gray-300"
        />
      </div>

      {/* Body block — full width, below */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="اكتب نص المقال هنا…"
          rows={14}
          className="w-full resize-y text-sm leading-8 focus:outline-none placeholder:text-gray-300"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{words} كلمة</span>
            <MicDictation onTranscript={appendTranscript} online={online} />
          </div>
          <button
            onClick={onProcess}
            disabled={processing || !body.trim() || !online}
            title={!online ? 'غير متصل' : undefined}
            className="bg-brand text-white text-sm px-6 py-2.5 rounded-xl hover:bg-brand-dark disabled:opacity-40 transition"
          >
            {processing ? 'جارٍ المعالجة…' : 'معالجة المقال'}
          </button>
        </div>
      </div>
    </div>
  );
}
