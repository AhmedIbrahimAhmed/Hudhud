import { useState } from 'react';
import api from '../api/client.js';
import { useOnline } from '../hooks/useOnline.js';

const LEVELS = {
  safe: { label: 'آمن', badge: 'bg-green-50 text-green-700 border-green-200', bar: 'bg-green-500' },
  suspicious: { label: 'مشبوه', badge: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' },
  dangerous: { label: 'خطر', badge: 'bg-red-50 text-flag-red border-red-200', bar: 'bg-flag-red' },
  invalid: { label: 'غير صالح', badge: 'bg-gray-100 text-gray-500 border-gray-200', bar: 'bg-gray-400' },
};

function ResultCard({ r }) {
  const lv = LEVELS[r.level] || LEVELS.invalid;
  const d = r.domain;
  return (
    <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-gray-700 break-all" dir="ltr">
          {r.url}
        </span>
        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${lv.badge}`}>
          {lv.label}
        </span>
      </div>

      {/* Risk score */}
      <div>
        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
          <span>درجة الخطورة</span>
          <span>{r.score}/100</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${lv.bar}`} style={{ width: `${r.score}%` }} />
        </div>
      </div>

      {/* Flags */}
      {r.flags?.length > 0 ? (
        <ul className="space-y-1">
          {r.flags.map((f, i) => (
            <li key={i} className="text-xs text-gray-600 leading-6">
              ⚠️ {f}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-green-700">✓ لم تُرصد مؤشرات خطر.</p>
      )}

      {/* Domain details */}
      {d && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
          {d.ageDays != null && (
            <div>
              العمر: <span className="text-gray-700">{d.ageDays} يوم</span>
            </div>
          )}
          {d.created && (
            <div>
              التسجيل: <span className="text-gray-700">{d.created.slice(0, 10)}</span>
            </div>
          )}
          {d.registrar && (
            <div className="col-span-2">
              المُسجِّل: <span className="text-gray-700">{d.registrar}</span>
            </div>
          )}
          {d.nameservers?.length > 0 && (
            <div className="col-span-2 break-all">
              خوادم الأسماء: <span className="text-gray-700">{d.nameservers.join('، ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DomainChecker() {
  const online = useOnline();
  const [input, setInput] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const r = await api.post('/domain/check', { input });
      setResults(r.data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <h2 className="text-xl font-bold text-gray-800">فاحص أمان الروابط</h2>
      <p className="text-xs text-gray-400 -mt-3">
        الصق رابطاً أو نصاً يحتوي على روابط للكشف عن المشبوهة وغير الآمنة، مع تفاصيل النطاق.
      </p>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://example.com  أو الصق نصاً يحتوي على روابط…"
          rows={4}
          dir="ltr"
          className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300"
        />
        <div className="flex justify-end">
          <button
            onClick={check}
            disabled={loading || !input.trim() || !online}
            title={!online ? 'غير متصل' : undefined}
            className="bg-brand text-white text-sm px-6 py-2.5 rounded-xl hover:bg-brand-dark disabled:opacity-40"
          >
            {loading ? 'جارٍ الفحص…' : 'فحص الروابط'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-flag-red text-sm rounded-xl p-3">{error}</div>
      )}

      {results && results.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">لم يُعثر على روابط في النص.</p>
      )}
      {results?.map((r, i) => (
        <ResultCard key={i} r={r} />
      ))}
    </div>
  );
}
