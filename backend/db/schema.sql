-- Hudhud Toolkit — PostgreSQL schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL  PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL DEFAULT '',
  bio           TEXT    NOT NULL DEFAULT '',
  avatar_path   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id          SERIAL  PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',
  -- final text after the user applied approved suggestions
  cleaned_text TEXT   NOT NULL DEFAULT '',
  -- JSON snapshot of the last processing result (corrections + stats)
  result_json TEXT    NOT NULL DEFAULT '{}',
  -- JSON array of the AI assistant conversation for this session
  chat_json   TEXT    NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id);

CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL  PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL DEFAULT '',
  notes       TEXT    NOT NULL DEFAULT '',
  -- calendar day this task belongs to, as 'YYYY-MM-DD' (empty = unscheduled)
  due_date    TEXT    NOT NULL DEFAULT '',
  -- time of day as 'HH:MM' 24h (empty = no specific time / all-day)
  due_time    TEXT    NOT NULL DEFAULT '',
  -- 'low' | 'medium' | 'high'
  priority    TEXT    NOT NULL DEFAULT 'medium',
  done        INTEGER NOT NULL DEFAULT 0,
  -- when this personal task mirrors an assigned team task, links back to it
  team_task_id INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(user_id, due_date);

-- Team system tables
CREATE TABLE IF NOT EXISTS teams (
  id          SERIAL  PRIMARY KEY,
  name        TEXT    NOT NULL DEFAULT '',
  leader_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(leader_id);

CREATE TABLE IF NOT EXISTS team_members (
  id          SERIAL  PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL DEFAULT 'member', -- 'leader' | 'member'
  status      TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected'
  joined_at   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_unique ON team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL  PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL, -- 'team_invite' | 'invite_accepted' | 'invite_rejected' | 'task_assigned'
  message     TEXT    NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  metadata    TEXT    NOT NULL DEFAULT '{}', -- JSON: { team_id, from_user_id, task_id, etc. }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS team_tasks (
  id          SERIAL  PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  file_url    TEXT, -- Cloudinary URL for uploaded file
  file_name   TEXT, -- Original filename of the attachment
  file_type   TEXT, -- MIME type of the attachment
  status      TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed'
  comments    TEXT    NOT NULL DEFAULT '', -- Comments from assigned member
  due_date    TEXT,
  due_time    TEXT    NOT NULL DEFAULT '', -- 'HH:MM' 24h (empty = no specific time)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_tasks_team ON team_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_assigned ON team_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_team_tasks_status ON team_tasks(status);

CREATE TABLE IF NOT EXISTS team_messages (
  id          SERIAL  PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT    NOT NULL DEFAULT '',
  file_url    TEXT, -- Cloudinary URL for an attached file (optional)
  file_name   TEXT, -- Original filename of the attachment
  file_type   TEXT, -- MIME type of the attachment
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_team ON team_messages(team_id, id);

CREATE TABLE IF NOT EXISTS team_message_reads (
  id          SERIAL  PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES team_messages(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_message_reads_user ON team_message_reads(user_id);

CREATE TABLE IF NOT EXISTS contributions (
  id          SERIAL  PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL, -- 'YYYY-MM-DD'
  count       INTEGER NOT NULL DEFAULT 1, -- number of contributions on that day
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contributions_user_date ON contributions(user_id, date);
