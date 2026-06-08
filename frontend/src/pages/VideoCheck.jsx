import { useRef, useState } from 'react';
import api from '../api/client.js';
import { useOnline } from '../hooks/useOnline.js';

export default function VideoCheck() {
  const online = useOnline();
  const [file, setFile] = useState(null);
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
    setResult(null);
    setError('');
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
        form.append('video', file, file.name);
        r = await api.post('/defence/video/detection', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        r = await api.post('/defence/video/detection', { url: urlInput.trim() });
      }
      setResult(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <h2 className="text-xl font-bold text-gray-800">التحقق من الفيديو</h2>
      <p className="text-xs text-gray-400 -mt-3">
        تحقق من الفيديوهات للكشف عن التزييف والتلاعب باستخدام الذكاء الاصطناعي.
      </p>

      {/* Input */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm border border-gray-200 text-gray-600 rounded-xl px-4 py-2 hover:border-brand hover:text-brand"
          >
            🎥 اختر فيديو
          </button>
          <input ref={fileRef} type="file" accept="video/*" onChange={pickFile} className="hidden" />
          <span className="text-gray-300">أو</span>
          <input
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setFile(null);
            }}
            placeholder="الصق رابط فيديو…"
            dir="ltr"
            className="flex-1 min-w-[180px] text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300"
          />
          {file && (
            <span className="text-sm text-gray-600 truncate max-w-md">
              {file.name}
            </span>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={analyze}
            disabled={loading || (!file && !urlInput.trim()) || !online}
            title={!online ? 'غير متصل' : undefined}
            className="bg-brand text-white text-sm px-6 py-2.5 rounded-xl hover:bg-brand-dark disabled:opacity-40"
          >
            {loading ? 'جارٍ التحليل…' : 'تحليل الفيديو'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400">
          ملاحظة: يُرفع الفيديو إلى خدمة خارجية (Scam.ai) لإجراء الفحص.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-flag-red text-sm rounded-xl p-3">{error}</div>
      )}

      {/* Result */}
      {result && <ResultCard result={result} />}
    </div>
  );
}

// Arabic labels for ScamAI detection types.
const DETECTION_LABELS = {
  face_swap: 'تبديل الوجه',
  lip_sync: 'مزامنة الشفاه',
  expression_manipulation: 'التلاعب بالتعابير',
  deepfake: 'تزييف عميق',
};

function ResultCard({ result }) {
  // The ScamAI payload nests the verdict; drill in defensively so the card
  // still renders if the shape changes.
  const core = result?.data?.result || result?.result || result?.data || result || {};
  const details = core.analysis_details || {};
  const modelInfo = core.ai_model_info || {};

  const isManipulated = details.is_manipulated ?? core.is_manipulated;
  const confidence = details.confidence_score ?? core.confidence_score;
  const certainty = details.model_certainty || core.model_certainty;
  const framesAnalyzed = details.frames_analyzed ?? core.frames_analyzed;
  const processingMs = details.processing_time_ms ?? core.processing_time_ms;
  const detectionTypes = details.detection_types || core.detection_types || [];

  const hasVerdict = typeof isManipulated === 'boolean';
  const confidencePct =
    typeof confidence === 'number'
      ? `${Math.round(confidence * 100)}%`
      : null;

  const certaintyLabel =
    { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' }[certainty] || certainty;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
      <h3 className="text-sm font-bold text-gray-700">نتيجة التحليل</h3>

      {hasVerdict ? (
        <>
          {/* Verdict banner */}
          <div
            className={`rounded-xl p-4 flex items-center justify-between gap-4 ${
              isManipulated
                ? 'bg-red-50 border border-red-200'
                : 'bg-green-50 border border-green-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{isManipulated ? '⚠️' : '✅'}</span>
              <div>
                <div
                  className={`text-base font-bold ${
                    isManipulated ? 'text-flag-red' : 'text-green-700'
                  }`}
                >
                  {isManipulated ? 'فيديو مُتلاعب به' : 'لا يوجد تلاعب واضح'}
                </div>
                <div className="text-xs text-gray-500">
                  {isManipulated
                    ? 'تم رصد مؤشرات على تزييف أو تلاعب بالفيديو.'
                    : 'لم تُرصد مؤشرات واضحة على التزييف.'}
                </div>
              </div>
            </div>
            {confidencePct && (
              <div className="text-center shrink-0">
                <div className="text-2xl font-bold text-gray-800">{confidencePct}</div>
                <div className="text-[10px] text-gray-400">درجة الثقة</div>
              </div>
            )}
          </div>

          {/* Detection types */}
          {detectionTypes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-gray-500">أنواع التلاعب المرصودة</div>
              <div className="flex flex-wrap gap-2">
                {detectionTypes.map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-red-50 text-flag-red border border-red-200 rounded-lg px-2.5 py-1"
                  >
                    {DETECTION_LABELS[t] || t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {certaintyLabel && (
              <Stat label="موثوقية النموذج" value={certaintyLabel} />
            )}
            {typeof framesAnalyzed === 'number' && (
              <Stat label="الإطارات المحللة" value={framesAnalyzed} />
            )}
            {typeof processingMs === 'number' && (
              <Stat label="زمن المعالجة" value={`${processingMs} مث`} />
            )}
            {modelInfo.model_name && (
              <Stat
                label="النموذج"
                value={`${modelInfo.model_name}${
                  modelInfo.model_version ? ` ${modelInfo.model_version}` : ''
                }`}
              />
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          تعذّر قراءة نتيجة واضحة من الخدمة.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl p-2.5">
      <div className="text-sm font-bold text-gray-800 truncate" title={String(value)}>
        {value}
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
