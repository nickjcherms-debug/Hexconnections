-- 4.7: differentiated versions, peer gallery walk, public Hex Space library and a
-- translation cache. Additive only; existing rows are unchanged.
ALTER TABLE submissions ADD COLUMN variant INTEGER;
CREATE TABLE IF NOT EXISTS peer_comments (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL REFERENCES posts(id),
 target_uid TEXT NOT NULL,
 author_uid TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('glow','grow')),
 body TEXT NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS peer_comments_post ON peer_comments(post_id,target_uid);
CREATE INDEX IF NOT EXISTS peer_comments_author ON peer_comments(post_id,author_uid);
CREATE TABLE IF NOT EXISTS library (
 code TEXT PRIMARY KEY REFERENCES shares(code),
 owner_uid TEXT NOT NULL REFERENCES users(uid),
 title TEXT NOT NULL,
 subject TEXT NOT NULL,
 grade TEXT NOT NULL,
 standards TEXT NOT NULL DEFAULT '',
 summary TEXT NOT NULL DEFAULT '',
 terms INTEGER NOT NULL DEFAULT 0,
 listed INTEGER NOT NULL DEFAULT 1,
 reports INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS library_browse ON library(listed,subject,grade);
CREATE TABLE IF NOT EXISTS library_reports (
 code TEXT NOT NULL REFERENCES library(code),
 uid TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(code,uid)
);
CREATE TABLE IF NOT EXISTS translations (
 key TEXT PRIMARY KEY,
 lang TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT NOT NULL
);
