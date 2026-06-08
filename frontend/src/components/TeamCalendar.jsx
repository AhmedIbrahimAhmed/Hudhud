import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { keepIfSame } from '../utils/keepIfSame.js';

// --- date helpers (local time) ---------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY_KEY = toKey(new Date());
const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // back to Sunday
  return x;
}

const formatTime = (hhmm) =>
  hhmm
    ? new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(
        new Date(`2000-01-01T${hhmm}:00`)
      )
    : '';

const STATUS_CHIP = {
  completed: 'bg-gray-100 text-gray-400 line-through',
  in_progress: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
};
const STATUS_LABEL = {
  completed: 'مكتملة',
  in_progress: 'قيد التنفيذ',
  pending: 'قيد الانتظار',
};

const emptyDraft = (date) => ({
  assigned_to: '',
  title: '',
  description: '',
  due_date: date || TODAY_KEY,
  due_time: '',
});

// Compact one-week calendar of the team's assigned tasks. Mirrors the personal
// calendar's click behaviour: leaders click a day to assign a task and click a
// task to edit it; assignees can change their task's status.
export default function TeamCalendar({ teamId, role }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const isLeader = role === 'leader';

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // the task being viewed/edited, or null for create
  const [draft, setDraft] = useState(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teamId) return;
    let active = true;
    async function load() {
      try {
        const [t, m] = await Promise.all([
          api.get(`/team-tasks/team/${teamId}`),
          api.get(`/teams/${teamId}/members`),
        ]);
        if (!active) return;
        setTasks((prev) => keepIfSame(prev, t.data.tasks || []));
        setMembers((prev) => keepIfSame(prev, (m.data.members || []).filter((x) => x.status === 'accepted')));
      } catch {
        // keep prior state
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [teamId]);

  const tasksByDate = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = String(t.due_date).slice(0, 10);
      (m[key] ||= []).push(t);
    }
    for (const k in m) {
      m[k].sort((a, b) => (a.due_time || '99:99').localeCompare(b.due_time || '99:99') || a.id - b.id);
    }
    return m;
  }, [tasks]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart]
  );

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }
  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  function openCreate(dateKey) {
    if (!isLeader) return; // only the leader assigns tasks
    setEditing(null);
    setDraft(emptyDraft(dateKey));
    setError('');
    setModalOpen(true);
  }
  function openTask(task) {
    setEditing(task);
    setDraft({
      assigned_to: task.assigned_to,
      title: task.title,
      description: task.description || '',
      due_date: String(task.due_date || '').slice(0, 10) || TODAY_KEY,
      due_time: task.due_time || '',
    });
    setError('');
    setModalOpen(true);
  }

  async function reload() {
    try {
      const r = await api.get(`/team-tasks/team/${teamId}`);
      setTasks(r.data.tasks || []);
    } catch {
      /* ignore */
    }
  }

  async function submitCreate() {
    if (!draft.assigned_to || !draft.title.trim()) {
      setError('المُسند إليه والعنوان مطلوبان');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/team-tasks', { team_id: teamId, ...draft });
      setModalOpen(false);
      reload();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!draft.title.trim()) {
      setError('العنوان مطلوب');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.put(`/team-tasks/${editing.id}/details`, {
        title: draft.title,
        description: draft.description,
        due_date: draft.due_date,
        due_time: draft.due_time,
      });
      setModalOpen(false);
      reload();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status) {
    setBusy(true);
    setError('');
    try {
      await api.put(`/team-tasks/${editing.id}`, { status });
      setModalOpen(false);
      reload();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask() {
    if (!(await confirm({ message: 'هل أنت متأكد من حذف هذه المهمة؟', confirmText: 'حذف', danger: true }))) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/team-tasks/${editing.id}`);
      setModalOpen(false);
      reload();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  const fmt = (d) => new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long' }).format(d);
  const weekLabel = `${fmt(days[0])} – ${fmt(days[6])}`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button onClick={prevWeek} className="text-gray-400 hover:text-brand px-2 py-1 text-lg rounded-lg hover:bg-brand-light" aria-label="الأسبوع السابق">
            ‹
          </button>
          <button onClick={nextWeek} className="text-gray-400 hover:text-brand px-2 py-1 text-lg rounded-lg hover:bg-brand-light" aria-label="الأسبوع التالي">
            ›
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="text-[11px] text-gray-400 hover:text-brand px-2 py-1 rounded-lg hover:bg-brand-light">
            هذا الأسبوع
          </button>
        </div>
        <h3 className="text-sm font-bold text-gray-800">تقويم مهام الفريق — {weekLabel}</h3>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const key = toKey(d);
          const isToday = key === TODAY_KEY;
          const dayTasks = tasksByDate[key] || [];
          return (
            <div
              key={key}
              onClick={() => openCreate(key)}
              className={`group rounded-xl border p-1.5 min-h-[88px] transition ${
                isToday ? 'border-brand bg-brand-light/40' : 'border-gray-100 bg-gray-50/40'
              } ${isLeader ? 'cursor-pointer hover:bg-brand-light/40' : ''}`}
            >
              <div className="flex items-center justify-between px-0.5">
                {isLeader ? (
                  <span className="opacity-0 group-hover:opacity-100 text-brand text-xs leading-none" title="إضافة مهمة">
                    ＋
                  </span>
                ) : (
                  <span />
                )}
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">{WEEKDAYS[d.getDay()]}</div>
                  <div
                    className={`text-xs font-bold ${
                      isToday ? 'bg-brand text-white rounded-full w-5 h-5 inline-flex items-center justify-center' : 'text-gray-600'
                    }`}
                  >
                    {d.getDate()}
                  </div>
                </div>
              </div>
              <div className="space-y-0.5 mt-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      openTask(t);
                    }}
                    title={`${t.due_time ? formatTime(t.due_time) + ' — ' : ''}${t.title} (${
                      STATUS_LABEL[t.status] || t.status
                    }${t.assigned_to_name ? ' • ' + t.assigned_to_name : ''})`}
                    className={`block w-full text-right truncate text-[10px] px-1 py-0.5 rounded transition ${
                      STATUS_CHIP[t.status] || STATUS_CHIP.pending
                    }`}
                  >
                    {t.due_time ? `${formatTime(t.due_time)} ` : ''}
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="block text-[10px] text-gray-400 text-center">+{dayTasks.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200"></span> قيد الانتظار</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-200"></span> قيد التنفيذ</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200"></span> مكتملة</span>
      </div>

      {modalOpen && (
        <TaskModal
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          members={members}
          isLeader={isLeader}
          isAssignee={editing && editing.assigned_to === user?.id}
          busy={busy}
          error={error}
          onClose={() => setModalOpen(false)}
          onCreate={submitCreate}
          onEdit={submitEdit}
          onStatus={changeStatus}
          onDelete={deleteTask}
        />
      )}
    </div>
  );
}

function TaskModal({ editing, draft, setDraft, members, isLeader, isAssignee, busy, error, onClose, onCreate, onEdit, onStatus, onDelete }) {
  const readOnly = editing && !isLeader; // members can only change status, not fields
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">
            {editing ? (isLeader ? 'تعديل المهمة' : 'تفاصيل المهمة') : 'تعيين مهمة'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {!editing && (
          <select
            value={draft.assigned_to}
            onChange={(e) => setDraft({ ...draft, assigned_to: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg p-2"
          >
            <option value="">اختر العضو</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.email}
                {m.role === 'leader' ? ' (قائد الفريق)' : ''}
              </option>
            ))}
          </select>
        )}

        {editing && (
          <p className="text-xs text-gray-500">
            المُسند إليه: {editing.assigned_to_name} • الحالة: {STATUS_LABEL[editing.status] || editing.status}
          </p>
        )}

        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="عنوان المهمة"
          readOnly={readOnly}
          className="w-full text-sm border border-gray-200 rounded-lg p-2.5 disabled:bg-gray-50 read-only:bg-gray-50"
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="وصف المهمة"
          rows={2}
          readOnly={readOnly}
          className="w-full text-sm border border-gray-200 rounded-lg p-2.5 read-only:bg-gray-50"
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
              className="w-full text-sm border border-gray-200 rounded-lg p-2 read-only:bg-gray-50"
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
              className="w-full text-sm border border-gray-200 rounded-lg p-2 read-only:bg-gray-50"
            />
          </label>
        </div>

        {/* Assignee can change status */}
        {editing && isAssignee && (
          <label className="text-xs text-gray-500 space-y-1 block">
            <span>تحديث الحالة</span>
            <select
              value={editing.status}
              onChange={(e) => onStatus(e.target.value)}
              disabled={busy}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            >
              <option value="pending">قيد الانتظار</option>
              <option value="in_progress">قيد التنفيذ</option>
              <option value="completed">مكتملة</option>
            </select>
          </label>
        )}

        {error && <p className="text-xs text-flag-red">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          {editing && isLeader ? (
            <button onClick={onDelete} disabled={busy} className="text-xs text-flag-red hover:underline disabled:opacity-40">
              حذف المهمة
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2">إغلاق</button>
            {!editing && (
              <button onClick={onCreate} disabled={busy || !draft.title.trim() || !draft.assigned_to} className="bg-brand text-white text-xs px-5 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-40">
                تعيين
              </button>
            )}
            {editing && isLeader && (
              <button onClick={onEdit} disabled={busy || !draft.title.trim()} className="bg-brand text-white text-xs px-5 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-40">
                حفظ
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
