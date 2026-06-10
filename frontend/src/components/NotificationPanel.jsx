import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useTeam } from '../team/TeamContext.jsx';

export default function NotificationPanel({ open, onClose }) {
  // Refresh the shared team store after accepting an invite so every view
  // (team page, sidebar) reflects the new membership immediately.
  const { respondToInvite: respondToInviteShared, notifyTeamDataChanged } = useTeam();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inviteDialog, setInviteDialog] = useState(null); // { teamId, teamName, fromUserId, inviterName }

  useEffect(() => {
    if (open) {
      loadNotifications();
      loadUnreadCount();
    }
  }, [open]);

  async function loadNotifications() {
    setLoading(true);
    try {
      const r = await api.get('/notifications');
      setNotifications(r.data.notifications);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadUnreadCount() {
    try {
      const r = await api.get('/notifications/unread-count');
      setUnreadCount(r.data.count);
    } catch (e) {
      console.error('Failed to load unread count:', e);
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

  async function markAllAsRead() {
    try {
      await api.put('/notifications/read-all');
      loadNotifications();
      loadUnreadCount();
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  }

  async function acceptInvite() {
    if (!inviteDialog) return;
    try {
      // Updates the shared team store immediately (membership + members list).
      await respondToInviteShared(inviteDialog.teamId, inviteDialog.userId, 'accept');
      setInviteDialog(null);
      loadNotifications();
      loadUnreadCount();
    } catch (e) {
      console.error('Failed to accept invite:', e);
    }
  }

  async function rejectInvite() {
    if (!inviteDialog) return;
    try {
      await api.post(`/teams/${inviteDialog.teamId}/members/${inviteDialog.userId}/reject`);
      setInviteDialog(null);
      loadNotifications();
      loadUnreadCount();
      notifyTeamDataChanged();
    } catch (e) {
      console.error('Failed to reject invite:', e);
    }
  }

  function handleNotificationClick(notification) {
    if (!notification.read) {
      markAsRead(notification.id);
    }

    const metadata = JSON.parse(notification.metadata || '{}');
    if (notification.type === 'team_invite') {
      setInviteDialog({
        teamId: metadata.team_id,
        teamName: metadata.team_name,
        fromUserId: metadata.from_user_id,
        inviterName: metadata.inviter_name,
        userId: notification.user_id, // The current user (invited user)
      });
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
          <h3 className="text-base font-bold text-gray-800">
            الإشعارات
            {unreadCount > 0 && (
              <span className="text-xs font-normal text-brand me-2">({unreadCount} غير مقروء)</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-brand hover:text-brand-dark"
              >
                تحديد الكل كمقروء
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-6">جارٍ التحميل…</p>
          ) : notifications.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">لا توجد إشعارات</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const metadata = JSON.parse(notification.metadata || '{}');
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-3 rounded-lg cursor-pointer transition ${
                      notification.read ? 'bg-gray-50' : 'bg-brand-light border border-brand'
                    }`}
                  >
                    <div className="text-sm text-gray-800">{notification.message}</div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {new Date(notification.created_at).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invite accept/reject dialog */}
      {inviteDialog && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 grid place-items-center"
          onClick={() => setInviteDialog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 className="text-base font-bold text-gray-800 mb-3">دعوة للانضمام إلى فريق</h3>
              <p className="text-sm text-gray-700 mb-2">
                دعاك {inviteDialog.inviterName} للانضمام إلى الفريق:
              </p>
              <p className="text-sm font-medium text-brand mb-4">{inviteDialog.teamName}</p>
              <div className="flex gap-2">
                <button
                  onClick={acceptInvite}
                  className="flex-1 bg-brand text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-dark"
                >
                  قبول
                </button>
                <button
                  onClick={rejectInvite}
                  className="flex-1 bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-300"
                >
                  رفض
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
