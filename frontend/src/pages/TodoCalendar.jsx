import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import { useOnline } from '../hooks/useOnline.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';

// --- date helpers (all LOCAL time, no UTC drift) ---------------------------
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY_KEY = toKey(new Date());

// Week starts Sunday. getDay(): 0=Sun … 6=Sat maps straight to the column.
const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const colOf = (date) => date.getDay();
const monthLabel = (y, m) =>
  new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(new Date(y, m, 1));

// 'HH:MM' (24h) -> a localized Arabic 12h label like "٣:٣٠ م". Empty -> ''.
const formatTime = (hhmm) =>
  hhmm
    ? new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(
        new Date(`2000-01-01T${hhmm}:00`)
      )
    : '';

const PRIORITY_CHIP = {
  high: 'bg-red-100 text-red-700 hover:bg-red-200',
  medium: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  low: 'bg-green-100 text-green-700 hover:bg-green-200',
};

const emptyDraft = (date) => ({
  title: '',
  notes: '',
  priority: 'medium',
  due_date: date || TODAY_KEY,
  due_time: '',
  done: false,
});

// --- the month grid: shows the tasks themselves inside each day -------------
function Calendar({ year, month, tasksByDate, onPrev, onNext, onDayClick, onTaskClick }) {
  const firstCol = colOf(new Date(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null); // fill the trailing week

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1">
          <button onClick={onPrev} className="text-gray-400 hover:text-brand px-2 py-1 text-lg rounded-lg hover:bg-brand-light" aria-label="الشهر السابق">
            ‹
          </button>
          <button onClick={onNext} className="text-gray-400 hover:text-brand px-2 py-1 text-lg rounded-lg hover:bg-brand-light" aria-label="الشهر التالي">
            ›
          </button>
        </div>
        <h3 className="text-sm font-bold text-gray-800">تقويم المهام — {monthLabel(year, month)}</h3>
      </div>

      <div className="grid grid-cols-7 border-t border-r border-gray-100 rounded-lg overflow-hidden">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[11px] text-gray-400 font-medium py-2 text-center border-l border-b border-gray-100 bg-gray-50">
            {w}
          </div>
        ))}

        {cells.map((d, i) => {
          if (d === null)
            return <div key={`b${i}`} className="min-h-[96px] border-l border-b border-gray-100 bg-gray-50/40" />;
          const key = `${year}-${pad(month + 1)}-${pad(d)}`;
          const isToday = key === TODAY_KEY;
          const dayTasks = tasksByDate[key] || [];
          return (
            <div
              key={key}
              onClick={() => onDayClick(key)}
              className="group min-h-[96px] border-l border-b border-gray-100 p-1 align-top cursor-pointer hover:bg-brand-light/40 transition-colors"
            >
              <div className="flex items-center justify-between px-1">
                <span className="opacity-0 group-hover:opacity-100 text-brand text-xs leading-none" title="إضافة مهمة">
                  ＋
                </span>
                <span
                  className={`text-xs ${
                    isToday
                      ? 'bg-brand text-white rounded-full w-5 h-5 inline-flex items-center justify-center'
                      : 'text-gray-500'
                  }`}
                >
                  {d}
                </span>
              </div>
              <div className="space-y-0.5 mt-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(t);
                    }}
                    title={`${t.due_time ? formatTime(t.due_time) + ' — ' : ''}${t.title}`}
                    className={`block w-full text-right truncate text-[10px] px-1.5 py-0.5 rounded transition ${
                      t.done ? 'bg-gray-100 text-gray-400 line-through' : PRIORITY_CHIP[t.priority] || PRIORITY_CHIP.medium
                    }`}
                  >
                    {t.team_task_id ? '👥 ' : ''}
                    {t.due_time ? `${formatTime(t.due_time)} ` : ''}
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="block text-[10px] text-gray-400 px-1">+{dayTasks.length - 3} أخرى</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- create / edit modal ----------------------------------------------------
function TaskModal({ draft, setDraft, onSubmit, onClose, onDelete, busy, editing, readOnly }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center " onClick={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!readOnly) onSubmit();
        }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">
            {readOnly ? 'مهمة الفريق (عرض فقط)' : editing ? 'تعديل المهمة' : 'مهمة جديدة'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            ✕
          </button>
        </div>

        {readOnly && (
          <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg p-2">
            هذه مهمة مُسندة من فريقك. تُدار من صفحة الفريق ولا يمكن تعديلها من هنا.
          </p>
        )}

        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="عنوان المهمة…"
          autoFocus={!readOnly}
          readOnly={readOnly}
          className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300 read-only:bg-gray-50"
        />
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="ملاحظات (اختياري)…"
          rows={2}
          readOnly={readOnly}
          className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-300 read-only:bg-gray-50"
        />

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500 space-y-1">
            <span>التاريخ</span>
            <input
              type="date"
              value={draft.due_date}
              onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
              dir="ltr"
              readOnly={readOnly}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-brand read-only:bg-gray-50"
            />
          </label>
          <label className="text-xs text-gray-500 space-y-1">
            <span>الوقت (اختياري)</span>
            <input
              type="time"
              value={draft.due_time}
              onChange={(e) => setDraft({ ...draft, due_time: e.target.value })}
              dir="ltr"
              readOnly={readOnly}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-brand read-only:bg-gray-50"
            />
          </label>
        </div>

        <select
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
          disabled={readOnly}
          className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-50"
        >
          <option value="high">أولوية عالية</option>
          <option value="medium">أولوية متوسطة</option>
          <option value="low">أولوية منخفضة</option>
        </select>

        {editing && !readOnly && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={draft.done}
              onChange={(e) => setDraft({ ...draft, done: e.target.checked })}
              className="w-4 h-4 accent-brand"
            />
            تمّ إنجازها
          </label>
        )}

        <div className="flex items-center justify-between pt-1">
          {editing && !readOnly ? (
            <button type="button" onClick={onDelete} disabled={busy} className="text-xs text-flag-red hover:underline disabled:opacity-40">
              حذف المهمة
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2">
              {readOnly ? 'إغلاق' : 'إلغاء'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={busy || !draft.title.trim()}
                className="bg-brand text-white text-xs px-5 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-40"
              >
                {editing ? 'حفظ' : 'إضافة'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// --- page -------------------------------------------------------------------
export default function TodoCalendar() {
  const online = useOnline();
  const confirm = useConfirm();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [readOnlyTeam, setReadOnlyTeam] = useState(false); // viewing a mirrored team task
  const [draft, setDraft] = useState(emptyDraft);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/tasks');
      setTasks(r.data.tasks || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Group tasks by day and sort each day chronologically (timed first).
  const tasksByDate = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      if (!t.due_date) continue;
      (m[t.due_date] ||= []).push(t);
    }
    for (const k in m) {
      m[k].sort((a, b) => (a.due_time || '99:99').localeCompare(b.due_time || '99:99') || a.id - b.id);
    }
    return m;
  }, [tasks]);

  function prevMonth() {
    setMonth((m) => (m === 0 ? (setYear((y) => y - 1), 11) : m - 1));
  }
  function nextMonth() {
    setMonth((m) => (m === 11 ? (setYear((y) => y + 1), 0) : m + 1));
  }

  function openNew(dateKey) {
    setEditingId(null);
    setReadOnlyTeam(false);
    setDraft(emptyDraft(dateKey));
    setModalOpen(true);
  }
  function openEdit(task) {
    setEditingId(task.id);
    setReadOnlyTeam(!!task.team_task_id); // team tasks are read-only here
    setDraft({
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      due_date: task.due_date || TODAY_KEY,
      due_time: task.due_time || '',
      done: !!task.done,
    });
    setModalOpen(true);
  }

  async function submit() {
    if (!draft.title.trim()) return;
    setBusy(true);
    setError('');
    const payload = {
      title: draft.title,
      notes: draft.notes,
      priority: draft.priority,
      due_date: draft.due_date,
      due_time: draft.due_time,
      done: draft.done ? 1 : 0,
    };
    try {
      if (editingId) {
        const r = await api.put(`/tasks/${editingId}`, payload);
        setTasks((prev) => prev.map((t) => (t.id === editingId ? r.data.task : t)));
      } else {
        const r = await api.post('/tasks', payload);
        setTasks((prev) => [r.data.task, ...prev]);
      }
      setModalOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    if (!(await confirm({ message: 'حذف هذه المهمة؟', confirmText: 'حذف', danger: true }))) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/tasks/${editingId}`);
      setTasks((prev) => prev.filter((t) => t.id !== editingId));
      setModalOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">مهامي والتقويم</h2>
          <p className="text-xs text-gray-400 mt-1">
            تظهر المهام داخل أيام التقويم. اضغط يوماً لإضافة مهمة، أو اضغط مهمة لتعديلها.
          </p>
        </div>
        <button
          onClick={() => openNew(TODAY_KEY)}
          disabled={!online}
          className="shrink-0 bg-brand text-white text-sm px-4 py-2.5 rounded-xl hover:bg-brand-dark disabled:opacity-40"
        >
          ＋ مهمة جديدة
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-flag-red text-sm rounded-xl p-3">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">جارٍ التحميل…</p>
      ) : (
        <Calendar
          year={year}
          month={month}
          tasksByDate={tasksByDate}
          onPrev={prevMonth}
          onNext={nextMonth}
          onDayClick={openNew}
          onTaskClick={openEdit}
        />
      )}

      {modalOpen && (
        <TaskModal
          draft={draft}
          setDraft={setDraft}
          onSubmit={submit}
          onClose={() => setModalOpen(false)}
          onDelete={remove}
          busy={busy || !online}
          editing={!!editingId}
          readOnly={readOnlyTeam}
        />
      )}
    </div>
  );
}
