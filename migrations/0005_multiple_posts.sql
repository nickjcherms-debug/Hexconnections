-- 4.2: a Hex Space can be posted to the same class more than once, each posting being
-- its own assignment with its own code and dates. Rebuild posts without the old
-- UNIQUE(owner_uid,activity_id,class_id,course_id) constraint. Every row keeps its id,
-- so submissions and group boards that reference posts(id) stay linked.
-- Run as one file (D1 applies it as a single transaction). Foreign-key checks are
-- deferred to the end; re-inserting the rows into the new posts table satisfies them.
PRAGMA defer_foreign_keys = true;
CREATE TABLE posts_copy_v5 AS SELECT * FROM posts;
DROP TABLE posts;
CREATE TABLE posts (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL REFERENCES users(uid),
 activity_id TEXT NOT NULL, class_id TEXT NOT NULL, course_id TEXT NOT NULL,
 coursework_id TEXT, classroom_url TEXT, status TEXT NOT NULL,
 body TEXT NOT NULL, max_points REAL NOT NULL, code TEXT NOT NULL,
 created_at TEXT NOT NULL
);
INSERT INTO posts(id,owner_uid,activity_id,class_id,course_id,coursework_id,classroom_url,status,body,max_points,code,created_at)
 SELECT id,owner_uid,activity_id,class_id,course_id,coursework_id,classroom_url,status,body,max_points,code,created_at FROM posts_copy_v5;
DROP TABLE posts_copy_v5;
CREATE INDEX IF NOT EXISTS posts_course ON posts(course_id,status);
CREATE INDEX IF NOT EXISTS posts_owner ON posts(owner_uid);
CREATE INDEX IF NOT EXISTS posts_code ON posts(code,status);
CREATE INDEX IF NOT EXISTS posts_activity ON posts(owner_uid,activity_id,class_id);
