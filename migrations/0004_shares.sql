-- Share links: a teacher shares a copy of one activity (vocabulary, Depth & Complexity
-- choices and board settings). Classes, codes and student work are never included.
CREATE TABLE IF NOT EXISTS shares (
 code TEXT PRIMARY KEY,
 owner_uid TEXT NOT NULL REFERENCES users(uid),
 activity_id TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 copies INTEGER NOT NULL DEFAULT 0,
 revoked INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(owner_uid, activity_id)
);
CREATE INDEX IF NOT EXISTS shares_owner ON shares(owner_uid);
