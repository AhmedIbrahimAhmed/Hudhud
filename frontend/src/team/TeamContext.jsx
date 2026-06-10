import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import api from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { keepIfSame } from '../utils/keepIfSame.js';

// Single shared source of truth for the user's team. Every view that shows team
// data (the team page, the sidebar team-management panel, task lists, etc.)
// reads from here instead of fetching `/teams` into its own local state. Each
// mutation refreshes this shared state on success, so ALL consumers re-render
// immediately — no waiting for a periodic poll.
//
// A `version` counter is bumped on every team/task mutation; task views watch it
// to refetch their own lists the moment any of them changes something.
const TeamContext = createContext(null);

const POLL_MS = 5000; // backstop only — picks up changes made by OTHER users.

export function TeamProvider({ children }) {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [role, setRole] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Bumped on any mutation so task/calendar views know to refetch right away.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Mirror the current team id into a ref so the mutation callbacks (which are
  // memoized and must not close over a stale `team`) can read it without being
  // re-created on every team change.
  const teamIdRef = useRef(null);
  useEffect(() => {
    teamIdRef.current = team?.id ?? null;
  }, [team]);

  const refreshMembers = useCallback(async (teamId) => {
    const id = teamId ?? teamIdRef.current;
    if (!id) {
      setMembers((prev) => keepIfSame(prev, []));
      return;
    }
    try {
      const r = await api.get(`/teams/${id}/members`);
      setMembers((prev) => keepIfSame(prev, r.data.members || []));
    } catch (e) {
      console.error('Failed to load members:', e);
    }
  }, []);

  // Refetch the shared team + role (and members). Called after every mutation
  // and by the backstop poll. Returns the team so callers can chain.
  const refreshTeam = useCallback(
    async ({ silent = true } = {}) => {
      if (!silent) setLoading(true);
      try {
        const r = await api.get('/teams');
        const nextTeam = r.data.team || null;
        setTeam((prev) => keepIfSame(prev, nextTeam));
        setRole((prev) => keepIfSame(prev, r.data.role || null));
        if (nextTeam) {
          await refreshMembers(nextTeam.id);
        } else {
          setMembers((prev) => keepIfSame(prev, []));
        }
        return nextTeam;
      } catch {
        // keep prior state on transient errors
        return team;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [refreshMembers, team]
  );

  // Initial load + backstop poll. Reset when the logged-in user changes.
  useEffect(() => {
    if (!user) {
      setTeam(null);
      setRole(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    refreshTeam({ silent: false });
    const poll = setInterval(() => {
      if (active) refreshTeam({ silent: true });
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(poll);
    };
    // Re-run only when the user identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // --- Mutations: each updates the shared state immediately on success. -----

  const createTeam = useCallback(
    async (name) => {
      await api.post('/teams', { name });
      bump();
      return refreshTeam();
    },
    [bump, refreshTeam]
  );

  const deleteTeam = useCallback(async () => {
    const id = teamIdRef.current;
    if (!id) return;
    await api.delete(`/teams/${id}`);
    setTeam(null);
    setRole(null);
    setMembers([]);
    bump();
  }, [bump]);

  const leaveTeam = useCallback(async () => {
    const id = teamIdRef.current;
    if (!id) return;
    await api.post(`/teams/${id}/leave`);
    setTeam(null);
    setRole(null);
    setMembers([]);
    bump();
  }, [bump]);

  const inviteMember = useCallback(
    async (email) => {
      await api.post('/teams/invite', { email });
      bump();
      await refreshMembers();
    },
    [bump, refreshMembers]
  );

  const removeMember = useCallback(
    async (userId) => {
      const id = teamIdRef.current;
      if (!id) return;
      await api.delete(`/teams/${id}/members/${userId}`);
      bump();
      await refreshMembers();
    },
    [bump, refreshMembers]
  );

  // Accept/reject a pending invite. After accepting, the user gains a team, so
  // we refresh the whole team. Used by the notifications popup.
  const respondToInvite = useCallback(
    async (teamId, userId, action) => {
      await api.post(`/teams/${teamId}/members/${userId}/${action}`);
      bump();
      await refreshTeam();
    },
    [bump, refreshTeam]
  );

  const value = {
    team,
    role,
    members,
    loading,
    version,
    refreshTeam,
    refreshMembers,
    notifyTeamDataChanged: bump,
    createTeam,
    deleteTeam,
    leaveTeam,
    inviteMember,
    removeMember,
    respondToInvite,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return ctx;
}
