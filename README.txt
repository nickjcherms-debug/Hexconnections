HEX CONNECTIONS — TEACHER & STUDENT ACCOUNTS
===========================================

This is the expanded Cloudflare Workers version of Hex Connections.
Your Firebase web configuration for hex-connections-a5214 is already included.
Your supplied D1 database ID is configured in wrangler.jsonc. The schema still
needs to be applied and the Worker deployed; live connectivity has not been tested.

WHAT IS INCLUDED
- Separate Teacher and Student Google sign-in choices.
- Public registration: a Google account creates its own profile on first use.
- Persistent profiles, with a switch between teacher and student views.
- A private workspace for each teacher; no fixed teacher email allowlist.
- Google Classroom course selection and assignment publishing/updating.
- Student assignment access verified against Classroom submissions.
- Account-specific drafts saved to Cloudflare D1, with browser-local fallback.
- Student turn-in with a protected link to the submitted board in Classroom.
- Teacher board review and explicit grade return to Classroom.
- Server-side ownership checks and validation of student boards.

No automatic AI grading was added. Teachers decide each grade before returning it.
All Google Classroom actions run interactively after the user connects Classroom.
There is no background polling, refresh-token storage, or unattended grade sync.

START HERE
Read DEPLOYMENT.txt. This requires a Cloudflare Worker AND its D1 database.
Uploading only public/index.html will not enable profile accounts or saved work.

PROJECT CONTENTS
public/index.html          Website and Firebase login/board editor
src/worker.js              Authenticated API and Classroom integration
migrations/0001_initial.sql Database tables and indexes
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

Due dates use 23:59 UTC, shown in the teacher interface. CSV imports remain local
teacher backups; authenticated online submissions are the cloud record.

An interrupted first Classroom publication stays marked CREATING and will not
be blindly retried. Check Classroom to avoid duplicate assignments, then reconcile
the corresponding posts row in D1 before retrying (details in DEPLOYMENT.txt).
