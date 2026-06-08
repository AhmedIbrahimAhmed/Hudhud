import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Single shared connection. The DB file lives next to this module.
const db = new Database(join(__dirname, 'hudhud.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema (idempotent — uses CREATE TABLE IF NOT EXISTS).
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Lightweight migrations for DBs created before a column existed.
const cols = db.prepare('PRAGMA table_info(articles)').all().map((c) => c.name);
if (!cols.includes('chat_json')) {
  db.exec("ALTER TABLE articles ADD COLUMN chat_json TEXT NOT NULL DEFAULT '[]'");
}

const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
if (!taskCols.includes('due_time')) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_time TEXT NOT NULL DEFAULT ''");
}
if (!taskCols.includes('team_task_id')) {
  db.exec('ALTER TABLE tasks ADD COLUMN team_task_id INTEGER');
}
// Ensure the index exists for both fresh and migrated DBs (column now present).
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_team_task ON tasks(team_task_id)');

// Create team system tables if they don't exist (migration for existing DBs)
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
if (!tables.includes('teams')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL DEFAULT '',
      leader_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(leader_id);
  `);
}
if (!tables.includes('team_members')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role        TEXT    NOT NULL DEFAULT 'member',
      status      TEXT    NOT NULL DEFAULT 'pending',
      joined_at   TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_unique ON team_members(team_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);
  `);
}
if (!tables.includes('notifications')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      read        INTEGER NOT NULL DEFAULT 0,
      metadata    TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
  `);
}
if (!tables.includes('team_tasks')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by INTEGER NOT NULL REFERENCES users(id),
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      file_url    TEXT,
      status      TEXT    NOT NULL DEFAULT 'pending',
      comments    TEXT    NOT NULL DEFAULT '',
      due_date    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_team_tasks_team ON team_tasks(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_tasks_assigned ON team_tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_team_tasks_status ON team_tasks(status);
  `);
}

// Migrate existing team_tasks table to add comments column and update status values
if (tables.includes('team_tasks')) {
  const teamTaskCols = db.prepare('PRAGMA table_info(team_tasks)').all().map((c) => c.name);
  if (!teamTaskCols.includes('comments')) {
    db.exec("ALTER TABLE team_tasks ADD COLUMN comments TEXT NOT NULL DEFAULT ''");
  }
  if (!teamTaskCols.includes('due_time')) {
    db.exec("ALTER TABLE team_tasks ADD COLUMN due_time TEXT NOT NULL DEFAULT ''");
  }
  if (!teamTaskCols.includes('file_name')) {
    db.exec('ALTER TABLE team_tasks ADD COLUMN file_name TEXT');
  }
  if (!teamTaskCols.includes('file_type')) {
    db.exec('ALTER TABLE team_tasks ADD COLUMN file_type TEXT');
  }
  // Update old 'assigned' status to 'pending'
  db.exec("UPDATE team_tasks SET status = 'pending' WHERE status = 'assigned'");
}

// Create contributions table if it doesn't exist (migration for existing DBs)
if (!tables.includes('contributions')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contributions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date        TEXT    NOT NULL,
      count       INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contributions_user_date ON contributions(user_id, date);
  `);
}

// Create team_message_reads table if it doesn't exist (migration for existing DBs)
if (!tables.includes('team_message_reads')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_message_reads (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_message_reads_user ON team_message_reads(user_id);
  `);
}

export default db;
