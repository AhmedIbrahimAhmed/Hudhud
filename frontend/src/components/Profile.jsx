import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ContributionGrid from './ContributionGrid.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [recentArticles, setRecentArticles] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [teamInfo, setTeamInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  // Edit profile state
  const [editName, setEditName] = useState(user?.display_name || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    loadProfileData();
  }, [user]);

  async function loadProfileData() {
    if (!user) return;
    setLoading(true);
    try {
      // Load stats and recent data in parallel
      const [articlesRes, tasksRes, teamTasksRes, teamRes] = await Promise.all([
        api.get('/articles').catch(() => ({ data: { articles: [] } })),
        api.get('/tasks').catch(() => ({ data: { tasks: [] } })),
        api.get('/team-tasks/my').catch(() => ({ data: { tasks: [] } })),
        api.get('/teams').catch(() => ({ data: { team: null, role: null } })),
      ]);

      const articles = articlesRes.data.articles || [];
      const personalTasks = tasksRes.data.tasks || [];
      const teamTasks = teamTasksRes.data.tasks || [];
      const team = teamRes.data.team;

      // Calculate stats
      const completedPersonalTasks = personalTasks.filter(t => t.done === 1).length;
      const completedTeamTasks = teamTasks.filter(t => t.status === 'completed').length;
      const totalCompletedTasks = completedPersonalTasks + completedTeamTasks;

      // Calculate days active
      const joinDate = new Date(user.created_at);
      const daysActive = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24)) + 1;

      setStats({
        articlesWritten: articles.length,
        tasksCompleted: totalCompletedTasks,
        personalTasksCompleted: completedPersonalTasks,
        teamTasksCompleted: completedTeamTasks,
        imagesVerified: 0, // No history endpoint available
        daysActive,
        teamName: team?.name || null,
      });

      // Recent articles (last 5)
      setRecentArticles(articles.slice(0, 5));

      // Recent completed tasks (last 5)
      const allTasks = [
        ...personalTasks.filter(t => t.done === 1).map(t => ({ ...t, type: 'personal' })),
        ...teamTasks.filter(t => t.status === 'completed').map(t => ({ ...t, type: 'team' })),
      ].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      setRecentTasks(allTasks.slice(0, 5));

      setTeamInfo(team);
    } catch (err) {
      console.error('Failed to load profile data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      const r = await api.put('/profile', { display_name: editName, bio: editBio });
      setUser(r.data.user);
      setMsg('تم حفظ التغييرات.');
      setTimeout(() => {
        setEditModalOpen(false);
        setMsg('');
      }, 1500);
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const form = new FormData();
    form.append('avatar', file);
    try {
      const r = await api.post('/profile/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(r.data.user);
      setMsg('تم تحديث الصورة.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordMsg('');
    setPasswordLoading(true);

    if (newPassword !== confirmPassword) {
      setPasswordError('كلمة المرور الجديدة غير متطابقة');
      setPasswordLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      setPasswordLoading(false);
      return;
    }

    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPasswordMsg('تم تغيير كلمة المرور بنجاح');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPasswordModalOpen(false);
        setPasswordMsg('');
      }, 1500);
    } catch (err) {
      setPasswordError(err.response?.data?.error || err.message || 'فشل تغيير كلمة المرور');
    } finally {
      setPasswordLoading(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  if (loading) {
    return (
      <div className="max-w-full mx-auto py-6 px-4">
        <div className="text-center text-gray-400 py-10">جارٍ التحميل...</div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto py-6 px-4 space-y-5">
      {/* User Info Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full bg-brand-light grid place-items-center overflow-hidden">
              {user?.avatar_path ? (
                <img src={user.avatar_path} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-brand text-2xl">{(user?.display_name || '؟')[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 truncate">{user?.display_name || '—'}</h2>
              <p className="text-sm text-gray-500 truncate">{user?.email || '—'}</p>
              <p className="text-xs text-gray-400 mt-1">
                انضم في {formatDate(user?.created_at)}
              </p>
              {teamInfo && (
                <p className="text-xs text-brand mt-1 truncate">
                  فريق: {teamInfo.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => {
                setEditName(user?.display_name || '');
                setEditBio(user?.bio || '');
                setEditModalOpen(true);
              }}
              title="تعديل الملف"
              aria-label="تعديل الملف"
              className="inline-flex items-center gap-1.5 text-sm text-brand border border-brand rounded-lg px-3 py-2 hover:bg-brand-light"
            >
              <span aria-hidden="true">✏️</span>
              <span className="hidden sm:inline">تعديل الملف</span>
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              title="تغيير الصورة"
              aria-label="تغيير الصورة"
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
            >
              <span aria-hidden="true">📷</span>
              <span className="hidden sm:inline">تغيير الصورة</span>
            </button>
            <button
              onClick={() => setPasswordModalOpen(true)}
              title="تغيير كلمة المرور"
              aria-label="تغيير كلمة المرور"
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
            >
              <span aria-hidden="true">🔒</span>
              <span className="hidden sm:inline">تغيير كلمة المرور</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={uploadAvatar}
              className="hidden"
            />
          </div>
        </div>
        {user?.bio && (
          <p className="mt-4 text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
            {user.bio}
          </p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="المقالات المكتوبة"
          value={stats?.articlesWritten || 0}
          icon="📝"
          color="brand"
        />
        <StatCard
          label="المهام المكتملة"
          value={stats?.tasksCompleted || 0}
          icon="✅"
          color="brand"
        />
        <StatCard
          label="أيام النشاط"
          value={stats?.daysActive || 0}
          icon="📅"
          color="brand"
        />
        <StatCard
          label="الفريق"
          value={stats?.teamName || '—'}
          icon="👥"
          color="gray"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent Articles */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">آخر المقالات</h3>
          {recentArticles.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">لا توجد مقالات بعد</p>
          ) : (
            <ul className="space-y-2">
              {recentArticles.map((article) => (
                <li key={article.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                  <div className="font-medium truncate">{article.title || 'بدون عنوان'}</div>
                  <div className="text-gray-400 mt-1">{formatDate(article.updated_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Tasks */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">آخر المهام المكتملة</h3>
          {recentTasks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">لا توجد مهام مكتملة بعد</p>
          ) : (
            <ul className="space-y-2">
              {recentTasks.map((task) => (
                <li key={task.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                  <div className="font-medium truncate">{task.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      task.type === 'team' ? 'bg-brand-light text-brand-dark' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {task.type === 'team' ? 'فريق' : 'شخصي'}
                    </span>
                    <span className="text-gray-400">{formatDate(task.updated_at || task.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Badges/Achievements */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-3">الإنجازات</h3>
        <div className="flex flex-wrap gap-3">
          <Badge
            icon="🌟"
            title="كاتب نشط"
            description={`كتبت ${stats?.articlesWritten || 0} مقال`}
            unlocked={(stats?.articlesWritten || 0) >= 1}
          />
          <Badge
            icon="🏆"
            title="منجز المهام"
            description={`أكملت ${stats?.tasksCompleted || 0} مهمة`}
            unlocked={(stats?.tasksCompleted || 0) >= 5}
          />
          <Badge
            icon="📅"
            title="مستمر"
            description={`نشط لمدة ${stats?.daysActive || 0} يوم`}
            unlocked={(stats?.daysActive || 0) >= 7}
          />
          <Badge
            icon="👥"
            title="عضو فريق"
            description="انضممت إلى فريق"
            unlocked={!!stats?.teamName}
          />
        </div>
      </div>

      {/* Contribution Calendar */}
      <ContributionGrid />


      {/* Edit Profile Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center" onClick={() => setEditModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md m-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-brand">تعديل الملف الشخصي</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                ✕
              </button>
            </div>
            <form onSubmit={saveProfile} className="p-5 space-y-4">
              <label className="block">
                <span className="text-xs text-gray-600">الاسم</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">نبذة</span>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              {msg && <p className="text-brand text-xs">{msg}</p>}
              {error && <p className="text-flag-red text-xs">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="flex-1 text-xs border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button type="submit" className="flex-1 text-xs bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark">
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center" onClick={() => setPasswordModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md m-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-brand">تغيير كلمة المرور</h3>
              <button onClick={() => setPasswordModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
                ✕
              </button>
            </div>
            <form onSubmit={changePassword} className="p-5 space-y-4">
              <label className="block">
                <span className="text-xs text-gray-600">كلمة المرور الحالية</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">كلمة المرور الجديدة</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">تأكيد كلمة المرور الجديدة</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              {passwordMsg && <p className="text-brand text-xs">{passwordMsg}</p>}
              {passwordError && <p className="text-flag-red text-xs">{passwordError}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="flex-1 text-xs border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 text-xs bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50"
                >
                  {passwordLoading ? 'جارٍ التغيير...' : 'تغيير'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const colorClasses = {
    brand: 'bg-brand-light text-brand-dark',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 shrink-0 rounded-lg ${colorClasses[color]} grid place-items-center text-xl`}>
          {icon}
        </div>
        <div className="text-2xl font-bold text-gray-800 truncate">{value}</div>
      </div>
      <div className="text-xs text-gray-500 mt-2">{label}</div>
    </div>
  );
}

function Badge({ icon, title, description, unlocked }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
      unlocked ? 'bg-brand-light border-brand' : 'bg-gray-50 border-gray-200 opacity-50'
    }`}>
      <span className="text-2xl">{unlocked ? icon : '🔒'}</span>
      <div>
        <div className="text-xs font-bold text-gray-700">{title}</div>
        <div className="text-[10px] text-gray-500">{description}</div>
      </div>
    </div>
  );
}
