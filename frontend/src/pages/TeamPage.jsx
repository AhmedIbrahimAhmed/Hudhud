import { useEffect, useState } from 'react';
import api from '../api/client.js';
import TaskAssignment from '../components/TaskAssignment.jsx';
import TeamCalendar from '../components/TeamCalendar.jsx';
import { keepIfSame } from '../utils/keepIfSame.js';

export default function TeamPage() {
  const [team, setTeam] = useState(null);
  const [teamRole, setTeamRole] = useState(null);

  useEffect(() => {
    loadTeamData();
    // Poll so the page reflects team creation/deletion done from the side panel.
    const interval = setInterval(loadTeamData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadTeamData() {
    try {
      const r = await api.get('/teams');
      setTeam((prev) => keepIfSame(prev, r.data.team));
      setTeamRole(r.data.role);
    } catch {
      // ignore transient errors
    }
  }

  return (
    <div className="max-w-full mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">فريق العمل</h2>
      </div>

      {team ? (
        <>
          <TeamCalendar teamId={team.id} role={teamRole} />
          <TaskAssignment teamId={team.id} role={teamRole} />
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-gray-500 text-center">
          أنشئ فريقاً أو انضمّ إلى فريق من اللوحة الجانبية للبدء.
        </div>
      )}
    </div>
  );
}
