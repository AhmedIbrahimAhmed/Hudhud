import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useConfirm } from './ConfirmDialog.jsx';

// `bare` drops the card chrome (border/bg/padding) for embedding inside another
// container such as the left sidebar, avoiding a box-in-a-box double border.
export default function TeamManagement({ bare = false }) {
  const cardClass = bare ? '' : 'bg-white border border-gray-200 rounded-2xl p-6';
  const [team, setTeam] = useState(null);
  const [role, setRole] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState('');
  const confirm = useConfirm();

  useEffect(() => {
    loadTeam();

    // Listen for team members refresh event (e.g., after accepting invite)
    function handleRefresh() {
      loadTeam();
    }
    window.addEventListener('team-members-refresh', handleRefresh);
    return () => window.removeEventListener('team-members-refresh', handleRefresh);
  }, []);

  async function loadTeam() {
    setLoading(true);
    try {
      const r = await api.get('/teams');
      setTeam(r.data.team);
      setRole(r.data.role);
      if (r.data.team) {
        loadMembers(r.data.team.id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMembers(teamId) {
    try {
      const r = await api.get(`/teams/${teamId}/members`);
      setMembers(r.data.members);
    } catch (e) {
      console.error('Failed to load members:', e);
    }
  }

  async function createTeam() {
    if (!teamName.trim()) {
      setError('اسم الفريق مطلوب');
      return;
    }
    try {
      await api.post('/teams', { name: teamName });
      setShowCreateTeam(false);
      setTeamName('');
      loadTeam();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) {
      setError('البريد الإلكتروني مطلوب');
      return;
    }
    try {
      await api.post('/teams/invite', { email: inviteEmail });
      setInviteEmail('');
      setError('');
      loadMembers(team.id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function deleteTeam() {
    if (
      !(await confirm({
        message: 'سيتم حذف الفريق نهائياً مع جميع المهام والمحادثات. هل أنت متأكد؟',
        confirmText: 'حذف الفريق',
        danger: true,
      }))
    )
      return;
    try {
      await api.delete(`/teams/${team.id}`);
      setTeam(null);
      setRole(null);
      setMembers([]);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function leaveTeam() {
    if (
      !(await confirm({
        message: 'هل أنت متأكد من مغادرة الفريق؟',
        confirmText: 'مغادرة',
        danger: true,
      }))
    )
      return;
    try {
      await api.post(`/teams/${team.id}/leave`);
      setTeam(null);
      setRole(null);
      setMembers([]);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function removeMember(userId) {
    if (!(await confirm({ message: 'هل أنت متأكد من إزالة هذا العضو؟', confirmText: 'إزالة', danger: true }))) return;
    try {
      await api.delete(`/teams/${team.id}/members/${userId}`);
      loadMembers(team.id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-8">جارٍ التحميل…</div>;
  }

  if (!team) {
    return (
      <div className={cardClass}>
        <h3 className="text-lg font-bold text-gray-800 mb-4">إدارة الفريق</h3>
        <p className="text-sm text-gray-600 mb-4">
          أنت لست عضواً في أي فريق حالياً. يمكنك إنشاء فريق جديد أو انتظار دعوة من قائد فريق.
        </p>
        <button
          onClick={() => setShowCreateTeam(true)}
          className="bg-brand text-white text-sm px-4 py-2 rounded-xl hover:bg-brand-dark transition"
        >
          إنشاء فريق جديد
        </button>

        {showCreateTeam && (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="اسم الفريق"
              className="w-full text-sm p-2 border border-gray-200 rounded-lg mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={createTeam}
                className="bg-brand text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-dark"
              >
                إنشاء
              </button>
              <button
                onClick={() => setShowCreateTeam(false)}
                className="bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-flag-red mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`${cardClass} space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-800">
          {team.name}
          <span className="text-xs font-normal text-gray-400 me-2">
            ({role === 'leader' ? 'قائد الفريق' : 'عضو'})
          </span>
        </h3>
        {role === 'leader' ? (
          <button
            onClick={deleteTeam}
            className="shrink-0 text-xs text-flag-red border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5"
          >
            حذف الفريق
          </button>
        ) : (
          <button
            onClick={leaveTeam}
            className="shrink-0 text-xs text-flag-red border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5"
          >
            مغادرة الفريق
          </button>
        )}
      </div>

      {role === 'leader' && (
        <div className="p-4 bg-gray-50 rounded-xl">
          <label className="text-xs text-gray-600 block mb-2">دعوة عضو جديد</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              className="flex-1 text-sm p-2 border border-gray-200 rounded-lg"
            />
            <button
              onClick={inviteMember}
              className="bg-brand text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-dark"
            >
              دعوة
            </button>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-3">الأعضاء ({members.length})</h4>
        <div className="space-y-2">
          {members.map((member) => {
            const name = member.display_name || member.email;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-brand-light grid place-items-center overflow-hidden">
                    {member.avatar_path ? (
                      <img
                        src={member.avatar_path}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-brand text-sm font-medium">
                        {(name || '؟')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{name}</div>
                    {member.display_name && (
                      <div className="text-xs text-gray-500 truncate">{member.email}</div>
                    )}
                    <div className="text-[11px] text-gray-400">
                      {member.role === 'leader' ? 'قائد الفريق' : 'عضو'}
                      {member.status === 'pending' && ' • بانتظار القبول'}
                    </div>
                  </div>
                </div>
                {role === 'leader' && member.role !== 'leader' && (
                  <button
                    onClick={() => removeMember(member.user_id)}
                    className="shrink-0 text-xs text-red-600 hover:text-red-700"
                  >
                    إزالة
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-flag-red">{error}</p>}
    </div>
  );
}
