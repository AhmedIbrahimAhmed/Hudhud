import SuggestionCard from './SuggestionCard.jsx';

function StatBar({ label, value, danger, hint }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-bold">{value}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${danger ? 'bg-flag-red' : 'bg-brand'}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      {hint && <p className="text-[10px] text-gray-400 mt-1 leading-5">{hint}</p>}
    </div>
  );
}

export default function CorrectionReport({ result, onAccept, onReject, onAcceptAll }) {
  const { corrections, stats, notices } = result;
  const pending = corrections.filter((c) => c.status === 'pending').length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatBar
          label="المحتوى الصادم"
          value={stats.shocking_content_percentage}
          danger
          hint={stats.shocking_reason}
        />
        <StatBar
          label="المحتوى المخل"
          value={stats.inappropriate_content_percentage}
          danger
          hint={stats.inappropriate_reason}
        />
        <StatBar label="نسبة الأخطاء" value={stats.error_percentage} />
        <StatBar label="سهولة القراءة" value={stats.readability_score} />
      </div>

      {/* SEO suggestions */}
      {stats.seo_suggestions?.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold mb-2 text-gray-700">💡 اقتراحات SEO</h3>
          <ul className="space-y-1.5">
            {stats.seo_suggestions.map((s, i) => (
              <li key={i} className="text-xs text-gray-600 leading-6">
                • {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notices?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          {notices.map((n, i) => (
            <p key={i} className="text-xs text-amber-700 leading-6">
              ⚠️ {n}
            </p>
          ))}
        </div>
      )}

      {/* Suggestions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">
          التصحيحات المقترحة ({corrections.length})
        </h3>
        {pending > 0 && (
          <button
            onClick={onAcceptAll}
            className="text-xs text-brand hover:underline"
          >
            قبول الكل ({pending})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {corrections.length === 0 && (
          <p className="text-xs text-gray-400">لا توجد تصحيحات — النص سليم. ✅</p>
        )}
        {corrections.map((c) => (
          <SuggestionCard key={c.id} item={c} onAccept={onAccept} onReject={onReject} />
        ))}
      </div>
    </div>
  );
}
