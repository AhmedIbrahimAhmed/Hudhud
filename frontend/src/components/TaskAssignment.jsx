import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { keepIfSame } from '../utils/keepIfSame.js';
import FileDropzone from './FileDropzone.jsx';

export default function TaskAssignment({ teamId, role, onTaskChange }) {
  const { user } = useAuth();
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
  const [editingTask, setEditingTask] = useState(null);
  const [editFormData, setEditFormData] = useState({
    status: '',
    comments: '',
  });
  const confirm = useConfirm();

  useEffect(() => {
    if (teamId) {
      loadTasks();
      loadMembers();
      loadMyTasks();
      
      // Poll for task updates every 5 seconds
      const interval = setInterval(() => {
        loadTasks();
        loadMembers();
        loadMyTasks();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [teamId]);

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
    } catch (e) {
      console.error('Failed to delete task:', e);
    }
  }

  if (!teamId) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">مهام الفريق</h3>
        {role === 'leader' && (
          <button
            onClick={() => setShowAssignForm(true)}
            className="bg-brand text-white text-sm px-4 py-2 rounded-xl hover:bg-brand-dark transition"
          >
            تعيين مهمة
          </button>
        )}
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
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
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
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => downloadTaskFile(task)}
                    title="تنزيل الملف"
                    className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                  >
                    📎 <span className="truncate max-w-[220px]">{task.file_name || 'الملف المرفق'}</span>
                    <span className="text-[10px] opacity-70">⬇</span>
                  </button>
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
    </div>
  );
}
