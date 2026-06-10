import TaskAssignment from '../components/TaskAssignment.jsx';
import TeamCalendar from '../components/TeamCalendar.jsx';
import { useTeam } from '../team/TeamContext.jsx';

export default function TeamPage() {
  // Shared team state — updates immediately when a team is created/deleted from
  // the side panel (no waiting for a poll).
  const { team, role } = useTeam();

  return (
    <div className="max-w-full mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">فريق العمل</h2>
      </div>

      {team ? (
        <>
          <TeamCalendar teamId={team.id} role={role} />
          <TaskAssignment teamId={team.id} role={role} />
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-gray-500 text-center">
          أنشئ فريقاً أو انضمّ إلى فريق من اللوحة الجانبية للبدء.
        </div>
      )}
    </div>
  );
}
