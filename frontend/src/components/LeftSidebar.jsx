import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ChatAssistant from './ChatAssistant.jsx';
import TeamChat from './TeamChat.jsx';
import TeamManagement from './TeamManagement.jsx';

// Left sidebar.
//  - On the team page: top = team management (invite + members), bottom = team
//    chat. The AI assistant is hidden there (not needed on that page).
//  - Everywhere else: a single tabbed panel that switches between the AI
//    assistant and the team chat, so the two chats don't stack on top of each
//    other. The team-chat tab shows an unread badge for new messages.
export default function LeftSidebar() {
  const onTeamPage = useLocation().pathname === '/team';

  if (onTeamPage) {
    return (
      <aside className="w-full h-full bg-white flex flex-col">
        <div className="h-1/2 border-b border-gray-200 overflow-y-auto p-4">
          <TeamManagement bare />
        </div>
        <div className="h-1/2 flex flex-col min-h-0">
          <TeamChat />
        </div>
      </aside>
    );
  }

  return <TabbedChats />;
}

function TabbedChats() {
  const [tab, setTab] = useState('ai'); // 'ai' | 'team'
  const [teamUnread, setTeamUnread] = useState(0);
  const teamActive = tab === 'team';

  const tabClass = (selected) =>
    `relative flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium transition ${
      selected
        ? 'text-brand border-b-2 border-brand bg-brand-light/40'
        : 'text-gray-500 border-b-2 border-transparent hover:text-gray-800 hover:bg-gray-50'
    }`;

  return (
    <aside className="w-full h-full bg-white flex flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-gray-200">
        <button type="button" onClick={() => setTab('ai')} className={tabClass(tab === 'ai')}>
          🤖 المساعد الذكي
        </button>
        <button type="button" onClick={() => setTab('team')} className={tabClass(teamActive)}>
          💬 محادثة الفريق
          {teamUnread > 0 && !teamActive && (
            <span className="bg-brand text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center">
              {teamUnread > 99 ? '99+' : teamUnread}
            </span>
          )}
        </button>
      </div>

      {/* Both panels stay mounted so the team chat keeps polling (and counting
          unread messages) even while the AI tab is showing. */}
      <div className={tab === 'ai' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        <ChatAssistant />
      </div>
      <div className={teamActive ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        <TeamChat active={teamActive} onUnreadChange={setTeamUnread} showHeader={false} />
      </div>
    </aside>
  );
}
