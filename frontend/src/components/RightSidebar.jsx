import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import SessionsModal from "./SessionsModal.jsx";
import api from "../api/client.js";
import { keepIfSame } from "../utils/keepIfSame.js";
import OnlineBadge from "./OnlineBadge.jsx";

const linkBase =
  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition";
const linkClass = ({ isActive }) =>
  `${linkBase} ${isActive ? "bg-brand text-white" : "text-gray-600 hover:bg-brand-light"}`;

export default function RightSidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [actingInvite, setActingInvite] = useState(null); // teamId currently being accepted/rejected
  const [inviteDialog, setInviteDialog] = useState(null); // pending invite shown in the accept/reject popup
  const notifRef = useRef(null);

  // Close the notifications popup when clicking outside of it.
  useEffect(() => {
    function onClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    loadUnreadCount();
    loadNotifications();
    loadPendingInvites();

    // Poll for new notifications every 5 seconds
    const interval = setInterval(() => {
      loadUnreadCount();
      loadNotifications();
      loadPendingInvites();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  async function loadUnreadCount() {
    try {
      const r = await api.get('/notifications/unread-count');
      setUnreadCount(r.data.count);
    } catch (e) {
      console.error('Failed to load unread count:', e);
    }
  }

  async function loadNotifications() {
    try {
      const r = await api.get('/notifications');
      setNotifications((prev) => keepIfSame(prev, r.data.notifications));
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  }

  async function markAsRead(id) {
    try {
      await api.put(`/notifications/${id}/read`);
      loadNotifications();
      loadUnreadCount();
    } catch (e) {
      console.error('Failed to mark as read:', e);
    }
  }

  async function loadPendingInvites() {
    try {
      const r = await api.get('/teams/invites');
      setPendingInvites((prev) => keepIfSame(prev, r.data.invites));
    } catch (e) {
      console.error('Failed to load invites:', e);
    }
  }

  // The pending invite (if any) that a team_invite notification refers to.
  function inviteForNotification(notification) {
    if (notification.type !== 'team_invite') return null;
    let teamId;
    try {
      teamId = JSON.parse(notification.metadata || '{}').team_id;
    } catch {
      return null;
    }
    return pendingInvites.find((inv) => String(inv.team_id) === String(teamId)) || null;
  }

  async function respondToInvite(invite, action) {
    if (!user?.id) return;
    setActingInvite(invite.team_id);
    try {
      await api.post(`/teams/${invite.team_id}/members/${user.id}/${action}`);
      // Refresh everything so the invite disappears and counts update.
      await Promise.all([loadPendingInvites(), loadNotifications(), loadUnreadCount()]);
      setInviteDialog(null);
    } catch (e) {
      console.error(`Failed to ${action} invite:`, e);
    } finally {
      setActingInvite(null);
    }
  }

  return (
    <aside className="w-full h-full bg-white flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand">هدهد</h1>
          <p className="text-xs text-gray-400 mt-1">أداة الصحفي الفلسطيني</p>
          <OnlineBadge className="mt-2" />
        </div>

        {/* Notifications bell + popup */}
        <div className="relative shrink-0" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((o) => !o)}
            title="الإشعارات"
            className="relative text-xl text-gray-500 hover:text-brand p-1 leading-none"
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -left-1 bg-brand text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 z-30 w-72 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 text-sm font-bold text-gray-700">
                الإشعارات
              </div>
              <div className="px-3 py-2 space-y-2 max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">لا توجد إشعارات</p>
                ) : (
                  notifications.map((notification) => {
                    const invite = inviteForNotification(notification);
                    return (
                      <div
                        key={notification.id}
                        onClick={() => {
                          if (!notification.read) markAsRead(notification.id);
                          // A pending invite opens the accept/reject popup.
                          if (invite) {
                            setInviteDialog(invite);
                            setNotificationsOpen(false);
                            return;
                          }
                          // Other team/task notifications open the team page.
                          if (/task|invite|team|member/.test(notification.type || '')) {
                            navigate('/team');
                          }
                          setNotificationsOpen(false);
                          onNavigate?.(); // close the mobile drawer if open
                        }}
                        className={`p-3 rounded-lg transition relative cursor-pointer ${
                          notification.read && !invite ? 'bg-gray-50' : 'bg-brand-light'
                        }`}
                      >
                        {!notification.read && (
                          <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        )}
                        <p className="text-xs text-gray-700">{notification.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(notification.created_at).toLocaleDateString('ar-EG')}
                        </p>
                        {invite && (
                          <p className="text-[10px] text-brand font-medium mt-1">اضغط للرد على الدعوة ←</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <NavLink to="/team" className={linkClass} onClick={onNavigate}>
          👥 فريق العمل
        </NavLink>
        <NavLink to="/tasks" className={linkClass} onClick={onNavigate}>
          🗓️ مهامي والتقويم
        </NavLink>
        <NavLink to="/write" className={linkClass} onClick={onNavigate}>
          ✍️ كتابة مقال
        </NavLink>
        <NavLink to="/voice" className={linkClass} onClick={onNavigate}>
          🎧 أدوات صوتية
        </NavLink>
        <NavLink to="/domains" className={linkClass} onClick={onNavigate}>
          🛡️ فاحص الروابط
        </NavLink>
        <NavLink to="/images" className={linkClass} onClick={onNavigate}>
          🖼️ التحقق من الصور
        </NavLink>
        <NavLink to="/image-editor" className={linkClass} onClick={onNavigate}>
          🎨 محرّر الصور
        </NavLink>
        <NavLink to="/video-check" className={linkClass} onClick={onNavigate}>
          🎥 التحقق من الفيديو
        </NavLink>
        
        <button
          type="button"
          onClick={() => setSessionsOpen(true)}
          className={`${linkBase} w-full text-gray-600 hover:bg-brand-light`}
        >
          🗂️ المسودات
        </button>
      </nav>

      <SessionsModal
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        onPicked={onNavigate}
      />

      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-brand-light grid place-items-center overflow-hidden">
              {user?.avatar_path ? (
                <img
                  src={user.avatar_path}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-brand text-sm">
                  {(user?.display_name || "؟")[0]}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.display_name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <NavLink
            to="/profile"
            onClick={onNavigate}
            title="الملف الشخصي"
            className="shrink-0 text-gray-400 hover:text-brand text-lg p-1"
          >
            👤
          </NavLink>
        </div>
        <button
          onClick={logout}
          className="w-full mt-2 text-xs text-gray-400 hover:text-flag-red py-2"
        >
          تسجيل الخروج
        </button>
      </div>

      {/* Accept / reject team-invite popup */}
      {inviteDialog && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4"
          onClick={() => actingInvite || setInviteDialog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 className="text-base font-bold text-gray-800 mb-3">دعوة للانضمام إلى فريق</h3>
              <p className="text-sm text-gray-700 mb-2">
                دعاك <span className="font-medium">{inviteDialog.inviter_name || inviteDialog.inviter_email}</span> للانضمام إلى الفريق:
              </p>
              <p className="text-sm font-bold text-brand mb-5">{inviteDialog.team_name}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!!actingInvite}
                  onClick={() => respondToInvite(inviteDialog, 'accept')}
                  className="flex-1 bg-brand text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-60"
                >
                  {actingInvite ? '…' : 'قبول'}
                </button>
                <button
                  type="button"
                  disabled={!!actingInvite}
                  onClick={() => respondToInvite(inviteDialog, 'reject')}
                  className="flex-1 bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-60"
                >
                  {actingInvite ? '…' : 'رفض'}
                </button>
              </div>
              <button
                type="button"
                disabled={!!actingInvite}
                onClick={() => setInviteDialog(null)}
                className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                لاحقاً
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
