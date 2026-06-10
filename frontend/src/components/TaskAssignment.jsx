import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTeam } from '../team/TeamContext.jsx';
import { keepIfSame } from '../utils/keepIfSame.js';
import FileDropzone from './FileDropzone.jsx';
import PdfPreviewModal from './PdfPreviewModal.jsx';

// Detect PDFs by MIME type or .pdf extension (uploads sometimes carry a generic
// type like application/octet-stream).
function isPdf({ file_type = '', file_name = '', file_url = '' }) {
  const mime = file_type || '';
  const name = (file_name || file_url || '').toLowerCase();
  return mime === 'application/pdf' || /\.pdf$/.test(name);
}

export default function TaskAssignment({ teamId, role, onTaskChange }) {
  const { user } = useAuth();
  // `version` bumps whenever ANY component mutates team/task data, so this list
  // refetches immediately instead of waiting for the poll. `notifyTeamDataChanged`
  // lets our own mutations broadcast to the other task views (e.g. the calendar).
  const { version, notifyTeamDataChanged } = useTeam();
  const [tasks, setTasks] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [members, setMembers] = useState([]);
  const [formData, setFormData] = useState({
    assigned_to: '',
    title: '',
    description: '',
    due_date: '',
    due_time: '',
  });
  const [uploadingTaskId, setUploadingTaskId] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [uploadedName, setUploadedName] = useState('');
  const [uploadedType, setUploadedType] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [previewPdf, setPreviewPdf] = useState(null); // { url, name }
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState({
    status: '',
    comments: '',
  });
  // Header filters + pagination (client-side over the loaded task list).
  const [searchQuery, setSearchQuery] = useState('');
  const [dayFilter, setDayFilter] = useState(''); // 'YYYY-MM-DD' or ''
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;
  const confirm = useConfirm();

  useEffect(() => {
    if (teamId) {
      loadTasks();
      loadMembers();
      loadMyTasks();

      // Poll as a backstop for changes made by OTHER users. Our own mutations
      // (and those of sibling task views) refetch immediately via `version`.
      const interval = setInterval(() => {
        loadTasks();
        loadMembers();
        loadMyTasks();
      }, 5000);

      return () => clearInterval(interval);
    }
    // Re-run when teamId changes OR when any team/task mutation bumps `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, version]);

  async function loadTasks() {
    try {
      const r = await api.get(`/team-tasks/team/${teamId}`);
      // Only update when the data actually changed, so identical polls don't
      // force a re-render every 5 seconds.
      setTasks((prev) => keepIfSame(prev, r.data.tasks));
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  }

  async function loadMyTasks() {
    try {
      const r = await api.get('/team-tasks/my');
      setMyTasks((prev) => keepIfSame(prev, r.data.tasks));
    } catch (e) {
      console.error('Failed to load my tasks:', e);
    }
  }

  async function loadMembers() {
    try {
      const r = await api.get(`/teams/${teamId}/members`);
      // Include the leader too, so the owner can assign tasks to themselves.
      const accepted = r.data.members.filter((m) => m.status === 'accepted');
      setMembers((prev) => keepIfSame(prev, accepted));
    } catch (e) {
      console.error('Failed to load members:', e);
    }
  }

  async function assignTask() {
    if (!formData.assigned_to || !formData.title.trim()) {
      return;
    }
    try {
      await api.post('/team-tasks', {
        team_id: teamId,
        assigned_to: formData.assigned_to,
        title: formData.title,
        description: formData.description,
        due_date: formData.due_date,
        due_time: formData.due_time,
      });
      setShowAssignForm(false);
      setFormData({ assigned_to: '', title: '', description: '', due_date: '', due_time: '' });
      loadTasks();
      notifyTeamDataChanged();
    } catch (e) {
      console.error('Failed to assign task:', e);
    }
  }

  async function handleFileUpload(file, taskId) {
    if (!file) return;

    setUploadingTaskId(taskId);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await api.post('/team-tasks/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFileUrl(r.data.url);
      setUploadedName(r.data.name || file.name);
      setUploadedType(r.data.type || file.type || '');
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.response?.data?.error || err.message || 'فشل رفع الملف');
    } finally {
      setUploadingTaskId(null);
    }
  }

  async function completeTask(taskId) {
    try {
      await api.put(`/team-tasks/${taskId}/complete`, {
        file_url: fileUrl,
        file_name: uploadedName,
        file_type: uploadedType,
      });
      setFileUrl('');
      setUploadedName('');
      setUploadedType('');
      loadTasks();
      loadMyTasks();
      notifyTeamDataChanged();
      if (onTaskChange) onTaskChange();
    } catch (e) {
      console.error('Failed to complete task:', e);
    }
  }

  // Download a task attachment through the backend proxy so it keeps its
  // original filename + extension (Cloudinary serves it under a random id).
  async function downloadTaskFile(task) {
    try {
      const res = await api.get(`/team-tasks/${task.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = task.file_name || 'ملف';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
    }
  }

  async function updateTaskStatus(taskId) {
    try {
      await api.put(`/team-tasks/${taskId}`, {
        status: editFormData.status,
        comments: editFormData.comments,
      });
      setEditingTask(null);
      setEditFormData({ status: '', comments: '' });
      loadTasks();
      notifyTeamDataChanged();
      if (onTaskChange) onTaskChange();
    } catch (e) {
      console.error('Failed to update task:', e);
    }
  }

  function startEditing(task) {
    setEditingTask(task.id);
    setEditFormData({
      status: task.status,
      comments: task.comments || '',
    });
  }

  async function deleteTask(taskId) {
    if (!(await confirm({ message: 'هل أنت متأكد من حذف هذه المهمة؟', confirmText: 'حذف', danger: true }))) return;
    try {
      await api.delete(`/team-tasks/${taskId}`);
      loadTasks();
      notifyTeamDataChanged();
    } catch (e) {
      console.error('Failed to delete task:', e);
    }
  }

  // Resolve a task's assignee display name: the API already returns
  // `assigned_to_name`, but fall back to the local members lookup by id when it's
  // missing so search-by-name stays robust.
  function assigneeName(task) {
    if (task.assigned_to_name) return task.assigned_to_name;
    const m = members.find((mm) => String(mm.user_id) === String(task.assigned_to));
    return m ? m.display_name || m.email || '' : '';
  }

  // Compose filters: search (title OR assignee name, case-insensitive substring)
  // AND day (exact due_date match). Both are applied before pagination.
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (dayFilter && task.due_date !== dayFilter) return false;
      if (q) {
        const title = (task.title || '').toLowerCase();
        const name = assigneeName(task).toLowerCase();
        if (!title.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, members, searchQuery, dayFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  // Clamp the current page so it stays valid as the filtered list shrinks.
  const currentPage = Math.min(page, totalPages);
  const pagedTasks = filteredTasks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to the first page whenever the filters change or the underlying list
  // changes length (e.g. a task was added/removed).
  useEffect(() => {
    setPage(1);
  }, [searchQuery, dayFilter, tasks.length]);

  if (!teamId) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h3 className="text-lg font-bold text-gray-800">مهام الفريق</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالعنوان أو اسم المكلّف"
            className="text-sm p-2 border border-gray-200 rounded-lg w-full sm:w-56"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">اليوم</label>
            <input
              type="date"
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              dir="ltr"
              className="text-sm p-2 border border-gray-200 rounded-lg flex-1 sm:flex-none"
            />
            {dayFilter && (
              <button
                type="button"
                onClick={() => setDayFilter('')}
                title="مسح التاريخ"
                className="text-xs text-gray-500 hover:text-gray-700 px-1"
              >
                مسح
              </button>
            )}
          </div>
          {role === 'leader' && (
            <button
              onClick={() => setShowAssignForm(true)}
              className="bg-brand text-white text-sm px-4 py-2 rounded-xl hover:bg-brand-dark transition whitespace-nowrap"
            >
              تعيين مهمة
            </button>
          )}
        </div>
      </div>

      {showAssignForm && (
        <div className="p-4 bg-gray-50 rounded-xl space-y-3">
          <select
            value={formData.assigned_to}
            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
            className="w-full text-sm p-2 border border-gray-200 rounded-lg"
          >
            <option value="">اختر العضو</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name || member.email}
                {member.role === 'leader' ? ' (قائد الفريق)' : ''}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="عنوان المهمة"
            className="w-full text-sm p-2 border border-gray-200 rounded-lg"
          />
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="وصف المهمة"
            rows={3}
            className="w-full text-sm p-2 border border-gray-200 rounded-lg"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-500 space-y-1">
              <span>التاريخ</span>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                dir="ltr"
                className="w-full text-sm p-2 border border-gray-200 rounded-lg"
              />
            </label>
            <label className="text-xs text-gray-500 space-y-1">
              <span>الوقت (اختياري)</span>
              <input
                type="time"
                value={formData.due_time}
                onChange={(e) => setFormData({ ...formData, due_time: e.target.value })}
                dir="ltr"
                className="w-full text-sm p-2 border border-gray-200 rounded-lg"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={assignTask}
              className="bg-brand text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-dark"
            >
              تعيين
            </button>
            <button
              onClick={() => setShowAssignForm(false)}
              className="bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-300"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400 text-center py-6">جارٍ التحميل…</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">لا توجد مهام بعد</p>
      ) : filteredTasks.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">لا توجد مهام مطابقة</p>
      ) : (
        <div className="space-y-3">
          {pagedTasks.map((task) => (
            <div
              key={task.id}
              className={`p-4 rounded-lg border relative ${
                task.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-sm font-medium text-gray-800">{task.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    إلى: {task.assigned_to_name} • من: {task.assigned_by_name}
                  </div>
                  {task.due_date && (
                    <div className="text-xs text-gray-400 mt-1">تاريخ الاستحقاق: {task.due_date}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      task.status === 'completed' ? 'bg-green-100 text-green-700' : 
                      task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 
                      'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {task.status === 'completed' ? 'مكتملة' : 
                     task.status === 'in_progress' ? 'قيد التنفيذ' : 'معلقة'}
                  </span>
                  {task.assigned_to === user?.id && (
                    <button
                      onClick={() => startEditing(task)}
                      className="text-xs text-brand hover:underline"
                    >
                      تعديل
                    </button>
                  )}
                  {role === 'leader' && (
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
              {task.description && (
                <div className="text-xs text-gray-600 mt-2">{task.description}</div>
              )}
              {task.comments && (
                <div className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded-lg">
                  <span className="font-medium">تعليق:</span> {task.comments}
                </div>
              )}
              {task.file_url && (
                <div className="mt-2 flex items-center gap-3">
                  {isPdf(task) ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPdf({ url: task.file_url, name: task.file_name || 'ملف PDF' })
                        }
                        title="معاينة الملف"
                        className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                      >
                        📄 <span className="truncate max-w-[220px]">{task.file_name || 'الملف المرفق'}</span>
                        <span className="text-[10px] opacity-70">👁</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTaskFile(task)}
                        title="تنزيل الملف"
                        className="text-[10px] text-brand opacity-70 hover:opacity-100"
                      >
                        ⬇
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => downloadTaskFile(task)}
                      title="تنزيل الملف"
                      className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                    >
                      📎 <span className="truncate max-w-[220px]">{task.file_name || 'الملف المرفق'}</span>
                      <span className="text-[10px] opacity-70">⬇</span>
                    </button>
                  )}
                </div>
              )}
              {editingTask === task.id && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">الحالة</label>
                    <select
                      value={editFormData.status}
                      onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                      className="w-full text-sm p-2 border border-gray-200 rounded-lg"
                    >
                      <option value="pending">معلقة</option>
                      <option value="in_progress">قيد التنفيذ</option>
                      <option value="completed">مكتملة</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">تعليق</label>
                    <textarea
                      value={editFormData.comments}
                      onChange={(e) => setEditFormData({ ...editFormData, comments: e.target.value })}
                      placeholder="أضف تعليقاً..."
                      rows={2}
                      className="w-full text-sm p-2 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateTaskStatus(task.id)}
                      className="bg-brand text-white text-xs px-3 py-1.5 rounded-lg hover:bg-brand-dark"
                    >
                      حفظ
                    </button>
                    <button
                      onClick={() => setEditingTask(null)}
                      className="bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-300"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
              {task.assigned_to === user?.id && task.status !== 'completed' && !editingTask && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <FileDropzone
                    onFile={(f) => handleFileUpload(f, task.id)}
                    uploading={uploadingTaskId === task.id}
                    fileName={fileUrl ? uploadedName : ''}
                    accept="image/*,application/pdf,.pdf,.zip,.rar"
                  />
                  {uploadError && <p className="text-xs text-flag-red mt-2">{uploadError}</p>}
                  {fileUrl && (
                    <button
                      onClick={() => completeTask(task.id)}
                      className="mt-2 bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700"
                    >
                      إكمال المهمة
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination — 4 per page. RTL-aware: "previous" advances toward newer
          pages visually on the right via flex-row-reverse. */}
      {!loading && filteredTasks.length > PAGE_SIZE && (
        <div className="flex flex-row-reverse items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            السابق
          </button>
          <span className="text-xs text-gray-500">
            صفحة {currentPage} من {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            التالي
          </button>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPdf && (
        <PdfPreviewModal
          fileUrl={previewPdf.url}
          fileName={previewPdf.name}
          onClose={() => setPreviewPdf(null)}
        />
      )}
    </div>
  );
}
