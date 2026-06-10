import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import RightSidebar from './RightSidebar.jsx';
import LeftSidebar from './LeftSidebar.jsx';
import NotificationPanel from './NotificationPanel.jsx';
import { ChatProvider } from '../chat/ChatContext.jsx';
import { TeamProvider } from '../team/TeamContext.jsx';
import OnlineBadge from './OnlineBadge.jsx';
import api from '../api/client.js';

const MIN = 180;
const MAX = 520;
const clamp = (n) => Math.max(MIN, Math.min(MAX, n));

function load(key, fallback) {
  const v = parseInt(localStorage.getItem(key), 10);
  return Number.isFinite(v) ? clamp(v) : fallback;
}

// A thin draggable divider (desktop only) between a sidebar and the main area.
function Resizer({ onStart, onDrag }) {
  function start(e) {
    e.preventDefault();
    onStart?.();
    const startX = e.clientX;
    function move(ev) {
      onDrag(ev.clientX - startX);
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  return (
    <div
      onMouseDown={start}
      className="hidden lg:block w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-brand transition-colors"
      title="اسحب لتغيير العرض"
    />
  );
}

// A slide-in overlay drawer for small screens. `side` = 'right' | 'left'.
function Drawer({ side, open, onClose, width, children }) {
  return (
    <div
      className={`lg:hidden fixed inset-0 z-40 transition ${
        open ? 'visible' : 'invisible pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Panel */}
      <div
        className={`absolute top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full bg-white shadow-xl transition-transform duration-200 ${
          open
            ? 'translate-x-0'
            : side === 'right'
            ? 'translate-x-full'
            : '-translate-x-full'
        }`}
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}

// Responsive RTL layout.
//  - lg and up: three resizable columns [RightSidebar | main | LeftSidebar].
//  - below lg: full-width main + a top bar with buttons that open the two
//    sidebars as slide-in drawers.
export default function Layout() {
  const [rightWidth, setRightWidth] = useState(() => load('rightWidth', 240));
  const [leftWidth, setLeftWidth] = useState(() => load('leftWidth', 320));
  const [navOpen, setNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Mobile-only notifications: the bell lives in the top header (below lg) and
  // opens the shared NotificationPanel modal. We poll the same unread-count
  // endpoint the sidebar bell uses so the badge stays in sync.
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const base = useRef({ right: 240, left: 320 });

  useEffect(() => {
    let cancelled = false;
    async function loadUnreadCount() {
      try {
        const r = await api.get('/notifications/unread-count');
        if (!cancelled) setUnreadCount(r.data.count);
      } catch (e) {
        console.error('Failed to load unread count:', e);
      }
    }
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [notifOpen]);

  function dragRight(dx) {
    const w = clamp(base.current.right - dx);
    setRightWidth(w);
    localStorage.setItem('rightWidth', String(w));
  }
  function dragLeft(dx) {
    const w = clamp(base.current.left + dx);
    setLeftWidth(w);
    localStorage.setItem('leftWidth', String(w));
  }

  return (
    <TeamProvider>
    <ChatProvider>
    <div className="h-full flex flex-col lg:flex-row bg-gray-50">
      {/* Mobile top bar */}
      <header className="lg:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNavOpen(true)}
            className="text-gray-600 text-xl leading-none"
            aria-label="القائمة"
          >
            ☰
          </button>
          {/* Notifications bell (mobile only) beside the menu button. */}
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="relative text-gray-600 text-xl leading-none p-1"
            aria-label="الإشعارات"
            title="الإشعارات"
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -left-1 bg-brand text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-brand">هدهد</h1>
          <OnlineBadge />
        </div>
        <button
          onClick={() => setChatOpen(true)}
          className="text-gray-600 text-xl leading-none"
          aria-label="المساعد"
        >
          💬
        </button>
      </header>

      {/* Desktop right sidebar (resizable) */}
      <div style={{ width: rightWidth }} className="hidden lg:block shrink-0 h-full bg-white">
        <RightSidebar />
      </div>
      <Resizer onStart={() => (base.current.right = rightWidth)} onDrag={dragRight} />

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>

      {/* Desktop left sidebar (resizable) */}
      <Resizer onStart={() => (base.current.left = leftWidth)} onDrag={dragLeft} />
      <div style={{ width: leftWidth }} className="hidden lg:block shrink-0 h-full bg-white">
        <LeftSidebar />
      </div>

      {/* Mobile drawers */}
      <Drawer side="right" open={navOpen} onClose={() => setNavOpen(false)} width="min(80vw, 18rem)">
        <RightSidebar onNavigate={() => setNavOpen(false)} />
      </Drawer>
      <Drawer side="left" open={chatOpen} onClose={() => setChatOpen(false)} width="min(90vw, 22rem)">
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <span className="text-sm font-bold text-gray-700">المساعد الذكي</span>
            <button onClick={() => setChatOpen(false)} className="text-gray-400 text-xl leading-none">
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LeftSidebar />
          </div>
        </div>
      </Drawer>

      {/* Mobile notifications panel (opened from the header bell). */}
      <NotificationPanel
        open={notifOpen}
        onClose={() => {
          setNotifOpen(false);
        }}
      />
    </div>
    </ChatProvider>
    </TeamProvider>
  );
}
