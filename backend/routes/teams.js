import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/teams - Create a new team (user can only have one team)
router.post('/', requireAuth, (req, res) => {
  // Check if user already has a team or is a member of any team
  const existingTeam = db
    .prepare('SELECT id FROM teams WHERE leader_id = ?')
    .get(req.user.id);
  
  if (existingTeam) {
    return res.status(400).json({ error: 'لديك بالفعل فريق. لا يمكن إنشاء أكثر من فريق.' });
  }

  const existingMembership = db
    .prepare("SELECT id FROM team_members WHERE user_id = ? AND status = 'accepted'")
    .get(req.user.id);
  
  if (existingMembership) {
    return res.status(400).json({ error: 'أنت عضو بالفعل في فريق. لا يمكن الانضمام إلى أكثر من فريق.' });
  }

  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'اسم الفريق مطلوب' });
  }

  const info = db
    .prepare('INSERT INTO teams (name, leader_id) VALUES (?, ?)')
    .run(name.trim(), req.user.id);

  // Add leader as team member with role 'leader'
  db.prepare(
    'INSERT INTO team_members (team_id, user_id, role, status, joined_at) VALUES (?, ?, ?, ?, ?)'
  ).run(info.lastInsertRowid, req.user.id, 'leader', 'accepted', new Date().toISOString());

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(info.lastInsertRowid);
  return res.json({ team });
});

// GET /api/teams - Get user's team (if any)
router.get('/', requireAuth, (req, res) => {
  // Check if user is a leader
  const teamAsLeader = db
    .prepare('SELECT * FROM teams WHERE leader_id = ?')
    .get(req.user.id);

  if (teamAsLeader) {
    return res.json({ team: teamAsLeader, role: 'leader' });
  }

  // Check if user is a member
  const membership = db
    .prepare("SELECT * FROM team_members WHERE user_id = ? AND status = 'accepted'")
    .get(req.user.id);

  if (membership) {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(membership.team_id);
    return res.json({ team, role: 'member' });
  }

  return res.json({ team: null, role: null });
});

// POST /api/teams/invite - Invite a member by email
router.post('/invite', requireAuth, (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
  }

  // Get user's team
  const team = db.prepare('SELECT * FROM teams WHERE leader_id = ?').get(req.user.id);
  if (!team) {
    return res.status(404).json({ error: 'ليس لديك فريق لدعوة أعضاء.' });
  }

  // Find user by email
  const invitedUser = db.prepare('SELECT id, display_name FROM users WHERE email = ?').get(email.trim());
  if (!invitedUser) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  // Check if user is already in the team
  const existingMember = db
    .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(team.id, invitedUser.id);
  
  if (existingMember) {
    if (existingMember.status === 'accepted') {
      return res.status(400).json({ error: 'هذا المستخدم عضو بالفعل في الفريق.' });
    } else if (existingMember.status === 'pending') {
      return res.status(400).json({ error: 'تم إرسال دعوة بالفعل لهذا المستخدم.' });
    }
  }

  // Check if invited user is already in another team
  const otherTeam = db
    .prepare(`
      SELECT t.* FROM teams t
      INNER JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ? AND tm.status = 'accepted'
    `)
    .get(invitedUser.id);
  
  if (otherTeam) {
    return res.status(400).json({ error: 'هذا المستخدم عضو بالفعل في فريق آخر.' });
  }

  // Create invitation
  const info = db
    .prepare('INSERT INTO team_members (team_id, user_id, role, status) VALUES (?, ?, ?, ?)')
    .run(team.id, invitedUser.id, 'member', 'pending');

  // Create notification
  db.prepare(
    'INSERT INTO notifications (user_id, type, message, metadata) VALUES (?, ?, ?, ?)'
  ).run(
    invitedUser.id,
    'team_invite',
    `دعوة للانضمام إلى فريق "${team.name}"`,
    JSON.stringify({ team_id: team.id, from_user_id: req.user.id, team_name: team.name, inviter_name: req.user.display_name || req.user.email })
  );

  return res.json({ message: 'تم إرسال الدعوة بنجاح' });
});

// GET /api/teams/invites - Pending invitations for the current user
router.get('/invites', requireAuth, (req, res) => {
  const invites = db
    .prepare(`
      SELECT tm.id AS membership_id, tm.team_id, t.name AS team_name,
             u.id AS inviter_id, u.display_name AS inviter_name, u.email AS inviter_email
      FROM team_members tm
      INNER JOIN teams t ON t.id = tm.team_id
      INNER JOIN users u ON u.id = t.leader_id
      WHERE tm.user_id = ? AND tm.status = 'pending'
      ORDER BY tm.created_at DESC
    `)
    .all(req.user.id);

  return res.json({ invites });
});

// POST /api/teams/:teamId/members/:userId/accept - Accept team invitation
router.post('/:teamId/members/:userId/accept', requireAuth, (req, res) => {
  const { teamId, userId } = req.params;

  // Verify the invitation is for the current user
  if (String(userId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  const membership = db
    .prepare("SELECT * FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'pending'")
    .get(teamId, userId);

  if (!membership) {
    return res.status(404).json({ error: 'الدعوة غير موجودة' });
  }

  // Update membership status
  db.prepare(
    'UPDATE team_members SET status = ?, joined_at = ? WHERE id = ?'
  ).run('accepted', new Date().toISOString(), membership.id);

  // Get team info
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);

  // Mark the invitation notification as read
  db.prepare(
    "UPDATE notifications SET read = 1 WHERE user_id = ? AND type = 'team_invite' AND metadata LIKE ?"
  ).run(userId, `%"team_id":${teamId}%`);

  // Notify leader
  db.prepare(
    'INSERT INTO notifications (user_id, type, message, metadata) VALUES (?, ?, ?, ?)'
  ).run(
    team.leader_id,
    'invite_accepted',
    `قام ${req.user.display_name || req.user.email} بقبول دعوة الانضمام إلى الفريق`,
    JSON.stringify({ team_id: teamId, user_id: userId, member_name: req.user.display_name || req.user.email })
  );

  return res.json({ message: 'تم قبول الدعوة بنجاح' });
});

// POST /api/teams/:teamId/members/:userId/reject - Reject team invitation
router.post('/:teamId/members/:userId/reject', requireAuth, (req, res) => {
  const { teamId, userId } = req.params;

  // Verify the invitation is for the current user
  if (String(userId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  const membership = db
    .prepare("SELECT * FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'pending'")
    .get(teamId, userId);

  if (!membership) {
    return res.status(404).json({ error: 'الدعوة غير موجودة' });
  }

  // Update membership status
  db.prepare(
    'UPDATE team_members SET status = ? WHERE id = ?'
  ).run('rejected', membership.id);

  // Get team info
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);

  // Mark the invitation notification as read
  db.prepare(
    "UPDATE notifications SET read = 1 WHERE user_id = ? AND type = 'team_invite' AND metadata LIKE ?"
  ).run(userId, `%"team_id":${teamId}%`);

  // Notify leader
  db.prepare(
    'INSERT INTO notifications (user_id, type, message, metadata) VALUES (?, ?, ?, ?)'
  ).run(
    team.leader_id,
    'invite_rejected',
    `قام ${req.user.display_name || req.user.email} برفض دعوة الانضمام إلى الفريق`,
    JSON.stringify({ team_id: teamId, user_id: userId, member_name: req.user.display_name || req.user.email })
  );

  return res.json({ message: 'تم رفض الدعوة' });
});

// GET /api/teams/:teamId/members - Get team members
router.get('/:teamId/members', requireAuth, (req, res) => {
  const { teamId } = req.params;

  // Verify user is a member of this team
  const membership = db
    .prepare("SELECT * FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'accepted'")
    .get(teamId, req.user.id);

  if (!membership) {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  const members = db
    .prepare(`
      SELECT tm.*, u.email, u.display_name, u.avatar_path
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.status != 'rejected'
      ORDER BY tm.created_at ASC
    `)
    .all(teamId);

  return res.json({ members });
});

// DELETE /api/teams/:teamId/members/:userId - Remove member (leader only)
router.delete('/:teamId/members/:userId', requireAuth, (req, res) => {
  const { teamId, userId } = req.params;

  // Verify user is the leader
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND leader_id = ?').get(teamId, req.user.id);
  if (!team) {
    return res.status(403).json({ error: 'فقط قائد الفريق يمكنه إزالة الأعضاء' });
  }

  // Cannot remove the leader
  if (String(userId) === String(req.user.id)) {
    return res.status(400).json({ error: 'لا يمكن إزالة قائد الفريق' });
  }

  const info = db
    .prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')
    .run(teamId, userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'العضو غير موجود' });
  }

  return res.json({ message: 'تم إزالة العضو بنجاح' });
});

// POST /api/teams/:teamId/leave - A member leaves the team (not the leader)
router.post('/:teamId/leave', requireAuth, (req, res) => {
  const { teamId } = req.params;

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) {
    return res.status(404).json({ error: 'الفريق غير موجود' });
  }

  // The leader can't leave — they must delete the team instead.
  if (String(team.leader_id) === String(req.user.id)) {
    return res.status(400).json({ error: 'قائد الفريق لا يمكنه المغادرة. احذف الفريق بدلاً من ذلك.' });
  }

  const info = db
    .prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'accepted'")
    .run(teamId, req.user.id);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'أنت لست عضواً في هذا الفريق' });
  }

  // Notify the leader.
  db.prepare(
    'INSERT INTO notifications (user_id, type, message, metadata) VALUES (?, ?, ?, ?)'
  ).run(
    team.leader_id,
    'member_left',
    `غادر ${req.user.display_name || req.user.email} الفريق`,
    JSON.stringify({ team_id: team.id, user_id: req.user.id, member_name: req.user.display_name || req.user.email })
  );

  return res.json({ message: 'لقد غادرت الفريق' });
});

// DELETE /api/teams/:teamId - Delete the whole team (leader only)
router.delete('/:teamId', requireAuth, (req, res) => {
  const { teamId } = req.params;

  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND leader_id = ?').get(teamId, req.user.id);
  if (!team) {
    return res.status(403).json({ error: 'فقط قائد الفريق يمكنه حذف الفريق' });
  }

  // Notify accepted members (other than the leader) that the team was disbanded.
  const members = db
    .prepare("SELECT user_id FROM team_members WHERE team_id = ? AND status = 'accepted' AND user_id != ?")
    .all(teamId, req.user.id);

  const notify = db.prepare(
    'INSERT INTO notifications (user_id, type, message, metadata) VALUES (?, ?, ?, ?)'
  );
  for (const m of members) {
    notify.run(
      m.user_id,
      'team_deleted',
      `تم حذف فريق "${team.name}"`,
      JSON.stringify({ team_id: team.id, team_name: team.name })
    );
  }

  // ON DELETE CASCADE clears team_members, team_tasks and team_messages.
  db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);

  return res.json({ message: 'تم حذف الفريق' });
});

export default router;
