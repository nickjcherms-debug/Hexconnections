PRAGMA foreign_keys = ON;
CREATE TABLE users (
 uid TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
 role TEXT CHECK(role IN ('teacher','student')), created_at TEXT NOT NULL
);
CREATE TABLE workspaces (
 owner_uid TEXT PRIMARY KEY REFERENCES users(uid), body TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE posts (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL REFERENCES users(uid),
 activity_id TEXT NOT NULL, class_id TEXT NOT NULL, course_id TEXT NOT NULL,
 coursework_id TEXT, classroom_url TEXT, status TEXT NOT NULL,
 body TEXT NOT NULL, max_points REAL NOT NULL, code TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(owner_uid,activity_id,class_id,course_id)
);
CREATE INDEX posts_course ON posts(course_id,status);
CREATE INDEX posts_owner ON posts(owner_uid);
CREATE INDEX posts_code ON posts(code,status);
CREATE TABLE submissions (
 post_id TEXT NOT NULL REFERENCES posts(id), uid TEXT NOT NULL REFERENCES users(uid),
 google_sub TEXT NOT NULL, classroom_submission_id TEXT NOT NULL,
 draft TEXT, payload TEXT, status TEXT NOT NULL DEFAULT 'DRAFT', grade REAL,
 classroom_status TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(post_id,uid)
);
CREATE INDEX submissions_uid ON submissions(uid);
