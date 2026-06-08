// One suggestion card: shows original → suggested, the explanation and
// category, with Approve / Reject buttons.

const CATEGORY_STYLE = {
  'مصطلح سياسي': 'bg-red-50 text-flag-red border-red-200',
  نحوي: 'bg-blue-50 text-blue-700 border-blue-200',
  إملائي: 'bg-amber-50 text-amber-700 border-amber-200',
  'محتوى مخل': 'bg-purple-50 text-purple-700 border-purple-200',
  'محتوى صادم': 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function SuggestionCard({ item, onAccept, onReject }) {
  const accepted = item.status === 'accepted';
  const rejected = item.status === 'rejected';

  return (
    <div
      className={`border rounded-xl p-3 transition ${
        accepted
          ? 'border-brand bg-brand-light'
          : rejected
          ? 'border-gray-200 bg-gray-50 opacity-60'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              CATEGORY_STYLE[item.category] || 'bg-gray-100 text-gray-600 border-gray-200'
            }`}
          >
            {item.category}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
            {item.field === 'title' ? 'العنوان' : 'النص'}
          </span>
        </div>
        {accepted && <span className="text-[11px] text-brand font-bold">✓ مقبول</span>}
        {rejected && <span className="text-[11px] text-gray-400">✕ مرفوض</span>}
      </div>

      <div className="text-sm leading-7">
        <span className="line-through text-flag-red bg-red-50 rounded px-1">{item.original}</span>
        <span className="mx-1 text-gray-300">←</span>
        {item.corrected ? (
          <span className="text-brand-dark bg-brand-light rounded px-1 font-medium">
            {item.corrected}
          </span>
        ) : (
          <span className="text-gray-500 bg-gray-100 rounded px-1 font-medium">(حذف)</span>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-2 leading-6">{item.explanation}</p>

      {item.status === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onAccept(item.id)}
            className="flex-1 bg-brand text-white text-xs py-1.5 rounded-lg hover:bg-brand-dark"
          >
            موافقة
          </button>
          <button
            onClick={() => onReject(item.id)}
            className="flex-1 bg-gray-100 text-gray-600 text-xs py-1.5 rounded-lg hover:bg-gray-200"
          >
            رفض
          </button>
        </div>
      )}
    </div>
  );
}
