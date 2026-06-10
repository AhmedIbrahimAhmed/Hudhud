import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client.js';

// Popup listing the user's saved sessions (articles). Picking one dispatches a
// "load-session" event that the Dashboard listens for.
export default function SessionsModal({ open, onClose, onPicked }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, title }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    api
      .get('/articles')
      .then((r) => setItems(r.data.articles || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  async function pick(id) {
    try {
      const r = await api.get(`/articles/${id}`);
      const article = r.data.article;
      
      // The article editor (Dashboard) lives at /write. If we're not there yet,
      // navigate first and wait for it to mount before dispatching the event.
      if (location.pathname !== '/write') {
        navigate('/write');
        // Wait for Dashboard to mount before dispatching event
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('load-session', { detail: article }));
        }, 100);
      } else {
        // Already on the editor, dispatch immediately
        window.dispatchEvent(new CustomEvent('load-session', { detail: article }));
      }
      
      onPicked?.();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }

  function newSession() {
    // The article editor (Dashboard) lives at /write. If we're not there yet,
    // navigate first and wait for it to mount before dispatching the event so
    // the editor starts a fresh/empty draft.
    if (location.pathname !== '/write') {
      navigate('/write');
      // Wait for Dashboard to mount before dispatching event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('new-session'));
      }, 100);
    } else {
      // Already on the editor, dispatch immediately
      window.dispatchEvent(new CustomEvent('new-session'));
    }
    
    onPicked?.();
    onClose();
  }

  async function deleteSession(id, e) {
    e.stopPropagation();
    const item = items.find((i) => i.id === id);
    setDeleteConfirm({ id, title: item?.title || item?.preview || `مسودة #${id}` });
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/articles/${deleteConfirm.id}`);
      setItems((prev) => prev.filter((item) => item.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-bold text-gray-800">المسودات</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="p-3 overflow-y-auto">
          <button
            onClick={newSession}
            className="w-full text-sm bg-brand-light text-brand-dark rounded-xl py-2.5 mb-3 hover:bg-brand hover:text-white transition"
          >
            ＋ مسودة جديدة
          </button>

          {loading && <p className="text-xs text-gray-400 text-center py-6">جارٍ التحميل…</p>}
          {error && <p className="text-xs text-flag-red text-center py-3">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">لا توجد مسودات محفوظة بعد.</p>
          )}

          <ul className="space-y-1.5">
            {items.map((a) => (
              <li key={a.id}>
                <div className="relative">
                  <button
                    onClick={() => pick(a.id)}
                    className="w-full text-right p-3 rounded-xl border border-gray-100 hover:border-brand hover:bg-brand-light/40 transition"
                  >
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {a.title?.trim() || a.preview?.trim() || `مسودة #${a.id}`}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">{a.preview}</div>
                    <div className="text-[10px] text-gray-300 mt-1">{a.updated_at || a.created_at}</div>
                  </button>
                  <button
                    onClick={(e) => deleteSession(a.id, e)}
                    className="absolute bottom-2 left-2 bg-red-50 text-red-600 rounded-lg px-2 py-1 text-xs hover:bg-red-100 transition shrink-0"
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 grid place-items-center"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-bold text-flag-red">تأكيد الحذف</h3>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-gray-700">
                هل أنت متأكد من حذف المسودة التالية؟
              </p>
              <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg p-3">
                {deleteConfirm.title}
              </p>
              <p className="text-[11px] text-gray-400 mt-3">
                لا يمكن التراجع عن هذا الإجراء.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-xs border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={confirmDelete}
                className="text-xs bg-flag-red text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                نعم احذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
