HEX CONNECTIONS — TEACHER & STUDENT ACCOUNTS
===========================================

This is the expanded Cloudflare Workers version of Hex Connections.
Your Firebase web configuration for hex-connections-a5214 is already included.
Your supplied D1 database ID is configured in wrangler.jsonc. The schema still
needs to be applied and the Worker deployed; live connectivity has not been tested.

WHAT IS INCLUDED
- A homepage explaining hexagonal thinking and Depth and Complexity icons, with
  Enter a class code and New Hex Space (teachers) as the main actions.
- Teacher Hex Space with nested folders (drag and drop, rename, move, delete).
- Google Classroom courses imported as classes, plus code-only manual classes.
- Share links that let other teachers copy a Hex Space into their own.
- Separate Teacher and Student Google sign-in choices.
- Teacher classroom dashboard with issued assignments, submissions and grading.
- Student active-assignment dashboard with assignment/group code entry.
- Code-based shared group boards with conflict-aware saving and individual turn-in.
- Public registration: a Google account creates its own profile on first use.
- Persistent profiles, with a switch between teacher and student views.
- A private workspace for each teacher; no fixed teacher email allowlist.
- Google Classroom course selection and assignment publishing/updating.
- Student assignment access verified against Classroom submissions.
- Account-specific drafts saved to Cloudflare D1, with browser-local fallback.
- Student turn-in with a protected link to the submitted board in Classroom.
- Teacher board review and explicit grade return to Classroom.
- Server-side ownership checks and validation of student boards.

Vocabulary generation is available to teachers through Cloudflare Workers AI
using the open-weight Llama 3.2 3B model. No ChatGPT, Claude or other personal AI
account is required. Teachers review suggestions before adding them. No automatic
AI grading was added. Teachers decide each grade before returning it.
All Google Classroom actions run interactively after the user connects Classroom.
There is no background polling, refresh-token storage, or unattended grade sync.

START HERE
Read DEPLOYMENT.txt. This requires a Cloudflare Worker AND its D1 database.
Uploading only public/index.html will not enable profile accounts or saved work.

PROJECT CONTENTS
public/index.html          Website and Firebase login/board editor
src/worker.js              Authenticated API and Classroom integration
migrations/0001_initial.sql Database tables and indexes
migrations/0002_ai_usage.sql Daily vocabulary generation request counters
migrations/0003_group_boards.sql Shared group boards
migrations/0004_shares.sql  Teacher share links
src/shares.js              Share link API (create, preview, copy, revoke)
src/dashboards.js          Teacher/student dashboard API
src/groups.js              Group board API
src/vocabulary.js          Teacher-only vocabulary generator and output validation
wrangler.jsonc             Worker configuration; add your D1 database ID
package.json               Development/deployment commands
tests/                     Backend and frontend automated checks
TESTING.txt                Verification completed and live checks still required

USING THE SITE AFTER DEPLOYMENT
Teacher: select Teacher - Sign in with Google. Create a class and an activity.
Add vocabulary, select the class under Classes & codes, then choose Publish for
that class. Connect Classroom, select your real course, and confirm publication.
Save workspace online to carry unpublished edits to another device. Republish
under Classes & codes to update each live Classroom assignment.

Student: open the Hex Connections link in Classroom, select Student - Sign in
with Google, and connect the same Classroom account. The site verifies that the
student has a submission for that specific assignment. Build the board, save,
and select Submit. Reclaim a turned-in assignment before changing a submitted
board. A returned assignment can be revised and submitted again.

Teacher review: open Submissions and Refresh online submissions. View a board,
choose Grade and return in Classroom, enter points and confirm. The application
sets both the draft and assigned grade and returns the work in Classroom.

PROFILES AND PERMISSIONS
Choosing Teacher gives someone their own workspace. It does not grant access to
another teacher's data or authorize any course in Google Classroom. Google must
confirm that the signed-in account teaches the course before publishing/grading.
Only the platform assignment owner can read its submissions or return grades.
A student must have an actual Classroom submission for that assignment, including
any individual assignment targeting, before opening its board.

DATA
Firebase Authentication stores the account. Cloudflare D1 stores profile role,
Google email/display name, teacher workspaces, assignment snapshots, drafts and
submitted boards. Browser storage keeps account-specific local backups.
Classroom access tokens remain in browser memory and in the current server
request only; they are not written to D1 or browser storage. Users reconnect
Classroom after signing out, reloading or when permission tokens expire.
No Analytics library is loaded, although your supplied configuration includes a
measurement ID. No service-account key or OAuth client secret is needed here.

LIMITS TO KNOW
The backend uses the documented Firebase account-lookup API to validate each
request. Its Firebase API key must be usable from the Worker; browser-only API
key referrer restrictions can block server lookups. Keep API restrictions
compatible with Identity Toolkit rather than disabling account validation.

Classroom turn-in and grade updates apply to coursework created through this
application's Google developer project. Existing assignments from other apps
are not silently converted or adopted. Google approval and school policies can
limit which accounts may connect Classroom.

Due dates use 23:59 UTC, shown in the teacher interface. Authenticated online
submissions are the only student record; student file save/upload was removed.

An interrupted first Classroom publication stays marked CREATING and will not
be blindly retried. Check Classroom to avoid duplicate assignments, then reconcile
the corresponding posts row in D1 before retrying (details in DEPLOYMENT.txt).

LARGER BOARDS
The starting honeycomb now has at least 61 placement cells, up from 19.
Roomy allocates about four cells per vocabulary tile; Spacious allocates six;
the new Expansive setting allocates nine. A 30-term Roomy honeycomb starts with
127 cells. The maximum radius is 20, allowing 1,261 possible positions; backend
validation accepts those same positions. Existing boards remain compatible.
Tiles and text retain their original size, and zoom/scroll remain available.
A hexagon still has six sides: extra space supports more arrangements, not more
than six simultaneous neighboring tiles per hexagon.

FREE-ALLOWANCE VOCABULARY GENERATION
Enable the AI binding and apply migration 0002 as described in DEPLOYMENT.txt.
The generator accepts a topic, grade, subject, 5-40 terms and optional notes.
It sends only these fields and the existing vocabulary to Cloudflare Workers AI.
Review the proposed terms and definitions, select which to keep, then add them.
Generated output is validated and duplicates are removed. Existing terms are
unchanged until you confirm. Student accounts cannot call the generator.

Default daily limits: 10 attempts per teacher and 50 site-wide. Limits reset at
00:00 UTC. You can lower them through AI_DAILY_TEACHER_LIMIT and
AI_DAILY_SITE_LIMIT. The code caps them at 10 and 50; raising them requires an
intentional code change. Provider errors still consume an attempt. There are
no automatic retries or paid-model fallbacks. Canceling stops waiting in the
browser; an already-started provider request may still use an allowance.

Cloudflare currently includes 10,000 Neurons per day across your Cloudflare
account. This is a finite free allowance, not unlimited free AI. On Workers Free,
exhaustion stops requests; on Workers Paid, account usage above the included
allowance may incur Cloudflare charges, including usage by your other apps.
The app's request limits are not an exact account-wide billing cap.

https://developers.cloudflare.com/workers-ai/platform/pricing/
https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/

GOOGLE WEBSITE SIGNUP
Choose New here? Create an account, then Create teacher account with Google or
Create student account with Google. Google signs the person in and /api/register
creates the selected website profile using the verified Firebase UID, name and
email. No separate website password is needed. Existing users are signed into
their existing profile instead of getting a duplicate account or losing data.
The Sign in buttons also register first-time Google users automatically.

The explicit signup flow uses the existing users table; no new schema is needed.
The complete Worker backend, original migrations and enabled Firebase Google
provider must be deployed before signup can finish successfully.

ROLE DASHBOARDS AND GROUP PROJECTS
After login, teachers see classrooms and open each classroom to view issued
assignments, student boards and grades. Assignment editor remains available.
Students see their active and submitted assignments plus Add code. Connect
Classroom to discover assigned Hex Connections activities across active courses.

Teachers create named groups (2-8 members) on the assignment submissions page.
Enrolled students enter the group code to share placements and explanations.
Changes autosave and refresh every 5 seconds. Conflicting changes preserve local
work and offer backup/reload; independent changes merge. Each student turns in
an individual Classroom snapshot of the shared board. Teachers can inspect the
current group board and review each student's submitted snapshot separately.
Students can save and leave a group without deleting its board or past work.

Apply migrations/0003_group_boards.sql to existing databases, then deploy the
complete Worker. See DEPLOYMENT.txt for exact commands and setup requirements.

VERSION 4.0.0: HOMEPAGE, FOLDERS, CLASSES AND SHARING
The bare site address always opens the homepage, signed in or not. The menu
has Log in for returning users. The homepage explains the benefits of hexagonal
thinking, ways to use it in class, and why Depth and Complexity icons help.
The site opens on a homepage that explains hexagonal thinking and the eight
Depth and three Complexity icons, with a live sample board. Enter a class code
and New Hex Space (teachers) are the main menu actions; both resume after
Google sign-in.

Teachers organize Hex Spaces in folders and subfolders (up to 8 levels). Each
Hex Space lives in one folder. Deleting a folder moves its contents up a level;
it never deletes Hex Spaces. Drag a Hex Space onto a folder or use the folder
picker in its header.

Classes come from two places: Import Classroom classes (courses you teach) and
Add a class for code-only classes. Imported courses are created as classes in
your saved Hex Space right away, so they stay under Your classes after a reload
or on another device without reconnecting Classroom. Connecting Classroom also
adds any new courses automatically. Assign a Hex Space to any class under
Classes & codes. Classroom classes publish to Google Classroom; code-only
classes are posted on this site and students join with the code.

Share creates a link another teacher can open to preview the Hex Space and copy
it into their own folders. Copies carry no classes, codes or student work.

Apply migrations/0004_shares.sql before using sharing (see DEPLOYMENT.txt).

VERSION 4.1.0: LOGIN, MENUS AND CLASSES
Log in with Google or with an email and password. New accounts choose Teacher
or Student once; the type can't be changed later. Email accounts confirm their
address by email, and can connect a Google account later for Classroom.
Everyone stays signed in on their device until they choose Sign out from the
menu under their name. Pages now have clean addresses such as
/teacher/classes and /student/assignments. Teachers choose which Google
Classroom classes to import, can resync names with Classroom, and can remove
any class. See DEPLOYMENT.txt for the one-time Firebase Email/Password step.

VERSION 4.2.0: POSTING WITH DATES
Post a Hex Space from its Post tab. Each posting chooses a class, an assignment
name, a start date and an optional due date (end of day, your time zone), and
gets its own code. Post the same Hex Space to a class again for another round.
Students can open it from the start date; late work is accepted and marked Late.

VERSION 4.3.0: MORE WAYS TO POST, FOLDERS AND EDITING
Post a Hex Space to several classes at once, or post any Hex Space from a
class page as often as you like. Create folders from the folder drop-down on a
Hex Space. Delete Hex Spaces you no longer need. After editing a posted Hex
Space, choose which postings should get the update.
