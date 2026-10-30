CREATE TABLE IF NOT EXISTS project_groups (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL REFERENCES posts(id),
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 max_members INTEGER NOT NULL CHECK(max_members BETWEEN 2 AND 8),
 draft TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS project_groups_post ON project_groups(post_id);
CREATE TABLE IF NOT EXISTS project_group_members (
 group_id TEXT NOT NULL REFERENCES project_groups(id),
 post_id TEXT NOT NULL REFERENCES posts(id),
 uid TEXT NOT NULL REFERENCES users(uid),
 joined_at TEXT NOT NULL,
 PRIMARY KEY(group_id,uid),
 UNIQUE(post_id,uid)
);
