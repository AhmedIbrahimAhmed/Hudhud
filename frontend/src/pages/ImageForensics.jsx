import { useRef, useState } from 'react';
import api from '../api/client.js';
import { useOnline } from '../hooks/useOnline.js';

export default function ImageForensics() {
  const online = useOnline();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUrlInput('');
    setPreview(URL.createObjectURL(f));
    setResult(null);
  }

  async function analyze() {
    if (!file && !urlInput.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      let r;
      if (file) {
        
        const form = new FormData();
        form.append('image', file, file.name);
        r = await api.post('/image/analyze', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        r = await api.post('/image/analyze', { url: urlInput.trim() });
        setPreview(urlInput.trim());
      }
      setResult(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const ai = result?.ai;
  const reverse = result?.reverse;
  const aiPct = ai?.confidence != null ? Math.round(ai.confidence * 100) : null;

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <h2 className="text-xl font-bold text-gray-800">التحقق من الصور</h2>
      <p className="text-xs text-gray-400 -mt-3">
        ابحث عن مصدر الصورة وأماكن نشرها سابقاً، وتحقّق مما إذا كانت مولّدة بالذكاء الاصطناعي.
      </p>

      {/* Input */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm border border-gray-200 text-gray-600 rounded-xl px-4 py-2 hover:border-brand hover:text-brand"
          >
            📁 اختر صورة
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
          <span className="text-gray-300">أو</span>
          <input
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setFile(null);
            }}
            placeholder="الصق رابط صورة…"
            dir="ltr"
            className="flex-1 min-w-[180px] text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300"
          />
        </div>

        {preview && (
          <img
            src={preview}
            alt=""
            className="max-h-56 rounded-xl border border-gray-100 object-contain"
          />
        )}

        <div className="flex justify-end">
          <button
            onClick={analyze}
            disabled={loading || (!file && !urlInput.trim()) || !online}
            title={!online ? 'غير متصل' : undefined}
            className="bg-brand text-white text-sm px-6 py-2.5 rounded-xl hover:bg-brand-dark disabled:opacity-40"
          >
            {loading ? 'جارٍ التحليل…' : 'تحليل الصورة'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400">
          ملاحظة: تُرفع الصورة إلى خدمات خارجية (بحث عكسي + كشف الذكاء الاصطناعي) لإجراء الفحص.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-flag-red text-sm rounded-xl p-3">{error}</div>
      )}

      {result?.notices?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-1">
          {result.notices.map((n, i) => (
            <p key={i} className="text-xs text-amber-700">⚠️ {n}</p>
          ))}
        </div>
      )}

      {/* AI detection */}
      {ai && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-bold text-gray-700">كشف الذكاء الاصطناعي / التزييف</h3>
          {ai.note && ai.label == null ? (
            <p className="text-xs text-gray-500">
              ℹ️ {ai.note === 'No face detected in the image' ? 'لا يوجد وجه بشري في الصورة لتحليله (هذا الكاشف متخصّص في تزييف الوجوه).' : ai.note}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`text-sm px-3 py-1 rounded-full border ${
                  ai.isAi
                    ? 'bg-red-50 text-flag-red border-red-200'
                    : 'bg-green-50 text-green-700 border-green-200'
                }`}
              >
                {ai.isAi ? '🤖 مزيّفة / مولّدة بالذكاء الاصطناعي' : '✓ تبدو حقيقية'}
              </span>
              {aiPct != null && (
                <span className="text-xs text-gray-500">نسبة الثقة: {aiPct}%</span>
              )}
              {ai.type && <span className="text-[11px] text-gray-400">({ai.type})</span>}
              {ai.faces != null && (
                <span className="text-[11px] text-gray-400">عدد الوجوه: {ai.faces}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reverse search */}
      {reverse && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-700">
            البحث العكسي — ظهرت في {reverse.count} موضعاً
          </h3>
          {reverse.matches.length === 0 ? (
            <p className="text-xs text-gray-400">لم يُعثر على نتائج — قد تكون الصورة جديدة أو نادرة.</p>
          ) : (
            <ul className="space-y-2">
              {reverse.matches.map((m, i) => (
                <li key={i} className="flex items-start gap-3 border-b border-gray-50 pb-2">
                  {m.thumbnail && (
                    <img src={m.thumbnail} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <a
                      href={m.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-brand hover:underline break-all line-clamp-2"
                    >
                      {m.title || m.link}
                    </a>
                    <div className="text-[11px] text-gray-400">
                      {m.source}
                      {m.date ? ` · ${m.date}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
