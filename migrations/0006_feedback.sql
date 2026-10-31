-- 4.5: teacher feedback on a student's board: a 0-2 score and a comment per
-- connection, an overall comment, and whether it was returned for revision.
ALTER TABLE submissions ADD COLUMN feedback TEXT;
