import { generateVocabulary } from './vocabulary.js';
// Cloudflare Worker. Firebase verifies accounts; every SQL query enforces ownership.
// Google access tokens are used only for the current request and never persisted.
const NOW = () => new Date().toISOString();
const enc = encodeURIComponent;
class ApiError extends Error {
  constructor(status, message, code = 'request-failed') { super(message); this.status = status; this.code = code; }
}
function fail(status, message, code) { throw new ApiError(status, message, code); }
function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
function parse(s, fallback = null) { try { return JSON.parse(s); } catch { return fallback; } }
async function input(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) fail(415, 'Send JSON data.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Request data is missing.');
  const parts = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); fail(413, 'This workspace or board is too large.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  const value = parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Invalid JSON data.');
  return value;
}
async function googleResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) fail(401, 'Reconnect Google Classroom and try again.', 'classroom-reconnect');
    if (response.status === 403) {
      const reasons=[...(data.error?.details||[]).map(d=>d.reason),...(data.error?.errors||[]).map(d=>d.reason)].filter(Boolean);
      if(reasons.some(r=>['SERVICE_DISABLED','accessNotConfigured'].includes(r))) fail(503,'Enable the Google Classroom API in the Firebase-linked Google Cloud project, then reconnect Classroom.','classroom-api-disabled');
      if(reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || reasons.includes('insufficientPermissions')) fail(403,'Reconnect Classroom and allow all the requested course, roster and assignment permissions.','classroom-scope');
      if(reasons.some(r=>/domainPolicy|orgPolicy/i.test(r))) fail(403,'Your school has blocked this integration. Ask its Google Workspace administrator to allow Hex Connections.','classroom-school-policy');
      fail(403,'Google Classroom denied this action. Check course membership, consent permissions, and school administrator settings.','classroom-permission');
    }
    if (response.status === 404) fail(404, 'The Classroom course, assignment, or submission was not found.');
    fail(502, 'Google Classroom could not complete the request. Check its assignment status before retrying.', 'classroom-error');
  }
  return data;
}
async function authenticate(request, env, net) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) fail(401, 'Sign in with Google first.', 'sign-in');
  // accounts:lookup validates the Firebase ID token with Firebase, including its signature.
  const res = await net('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + enc(env.FIREBASE_API_KEY), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
  });
  if (res.status >= 500 || res.status === 429) fail(503, 'Account verification is temporarily unavailable. Try again shortly.');
  const data = await res.json().catch(() => ({}));
  const account = data.users?.[0];
  if (!res.ok || !account?.localId || account.disabled || !account.emailVerified) fail(401, 'Sign in again with a verified Google account.', 'sign-in');
  let claims;
  try { const part=token.split('.')[1]; claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/'))); } catch { fail(401,'Invalid account token.','sign-in'); }
  if(claims.aud!==env.FIREBASE_PROJECT_ID || claims.iss!=='https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID || claims.sub!==account.localId || claims.exp<=Date.now()/1000) fail(401,'Sign in to this Firebase project.','sign-in');
  const google = account.providerUserInfo?.find(p => p.providerId === 'google.com');
  if (!google?.rawId) fail(403, 'A linked Google account is required.');
  return { uid: account.localId, email: account.email || '', name: account.displayName || account.email || '', googleSub: google.rawId };
}
async function classroomContext(request, user, net) {
  const token = request.headers.get('X-Classroom-Token');
  if (!token || token.length > 8192) fail(401, 'Connect Google Classroom first.', 'classroom-reconnect');
  const res = await net('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  const info = await googleResponse(res);
  if (info.sub !== user.googleSub || !info.email_verified) fail(403, 'Connect Classroom with the same Google account used to sign in.');
  return async function g(path, method = 'GET', body) {
    if (!path.startsWith('/courses')) throw new Error('Invalid Classroom path');
    return googleResponse(await net('https://classroom.googleapis.com/v1' + path, {
      method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    }));
  };
}
async function allPages(g, path, field) {
  let out = [], page;
  for (let i = 0; i < 100; i++) {
    const data = await g(path + (page ? (path.includes('?') ? '&' : '?') + 'pageToken=' + enc(page) : ''));
    out.push(...(data[field] || [])); page = data.nextPageToken;
    if (!page) return out;
  }
  fail(413, 'Too many Classroom records. Use a smaller course.');
}
const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const rows = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const emptyWorkspace = () => ({ version: 4, classes: [], activities: [] });
function validateWorkspace(body) {
  if (!body || !Array.isArray(body.classes) || !Array.isArray(body.activities) || body.activities.length > 100 || body.classes.length > 100) fail(400, 'Invalid workspace.');
  const acts = new Set(), classes = new Set();
  for (const c of body.classes) {
    if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 80 || classes.has(c.id) || typeof c.name !== 'string' || c.name.length > 100) fail(400, 'Invalid or duplicate class.');
    classes.add(c.id);
  }
  for (const a of body.activities) {
    if (!a || typeof a.id !== 'string' || !a.id || a.id.length > 80 || acts.has(a.id) || !Array.isArray(a.terms) || a.terms.length > 60 || typeof a.title !== 'string' || a.title.length > 250) fail(400, 'Invalid or duplicate activity.');
    const ids = new Set();
    for (const t of a.terms) {
      const id = t.id || t.n;
      if (!Number.isInteger(id) || id < 1 || id >= 1000 || ids.has(id) || typeof t.term !== 'string' || t.term.length > 100 || (t.def && (typeof t.def !== 'string' || t.def.length > 1000))) fail(400, 'Invalid activity term.');
      ids.add(id);
    }
    acts.add(a.id);
  }
  return body;
}
function boardDraft(value, act) {
  if (!value || !value.place || typeof value.place !== 'object' || Array.isArray(value.place) || !value.conns || typeof value.conns !== 'object' || Array.isArray(value.conns)) fail(400, 'Invalid board.');
  const dcKeys = ['language','details','patterns','rules','trends','unanswered','ethics','bigidea','perspectives','change','across'];
  const allowed = new Set(act.terms.map(t => String(t.id || t.n)));
  if (act.dcOn) for (const k of (act.dc || [])) { const i = dcKeys.indexOf(k); if (i >= 0) allowed.add(String(1001 + i)); }
  const occupied = new Set();
  if (Object.keys(value.place).length > 71 || Object.keys(value.conns).length > 450) fail(400, 'Board is too large.');
  const place = {};
  for (const [id,p] of Object.entries(value.place)) {
    if (!allowed.has(id) || !Array.isArray(p) || p.length !== 2 || !p.every(Number.isInteger) || Math.max(Math.abs(p[0]),Math.abs(p[1]),Math.abs(p[0]+p[1])) > 20 || occupied.has(p.join(','))) fail(400, 'Invalid board position.');
    occupied.add(p.join(',')); place[id] = p;
  }
  const conns = {};
  for (const [key,c] of Object.entries(value.conns)) {
    const pair = key.split('-');
    if (pair.length !== 2 || pair[0] === pair[1] || !pair.every(id => allowed.has(id)) || !c || typeof c.why !== 'string' || c.why.length > 600) fail(400, 'Invalid connection.');
    conns[key] = { why: c.why, at: Number.isFinite(c.at) ? c.at : 0 };
  }
  return { name: String(value.name || '').slice(0,60), place, conns, view: { orient: value.view?.orient === 'flat' ? 'flat' : 'pointy' }, _savedAt: NOW(), submittedAt: value.submittedAt || null };
}
function submissionPayload(draft, post, user) {
  const info = parse(post.body), act = info.act;
  const validConns = [];
  for (const [key,c] of Object.entries(draft.conns)) {
    const [a,b] = key.split('-').map(Number), p = draft.place[a], q = draft.place[b];
    if (!p || !q || !c.why.trim()) continue;
    if (Math.max(Math.abs(p[0]-q[0]),Math.abs(p[1]-q[1]),Math.abs(p[0]+p[1]-q[0]-q[1])) !== 1) continue;
    if (c.why.trim().split(/\s+/).length < (Number(act.minWords) || 0)) fail(400, 'One or more connection explanations are too short.');
    validConns.push({ num:validConns.length+1, a,b,why:c.why });
  }
  const used = new Set(validConns.flatMap(c=>[c.a,c.b]).filter(n=>n<1000)).size;
  const need = act.minTerms === '' || act.minTerms == null ? act.terms.length : Math.min(act.terms.length,Math.max(0,Number(act.minTerms)||0));
  if (used < need) fail(400, 'Use the required number of terms with justified connections before submitting.');
  return { activitySnapshot:act,activityId:act.id,activityTitle:act.title,classId:info.cls.id,className:info.cls.name,period:info.cls.name,
    name:user.name,email:user.email,submittedAt:NOW(),placements:draft.place,connections:validConns,termsUsed:used,
    due:info.asg.due || '',late:!!(info.asg.due && Date.now()>new Date(info.asg.due+'T23:59:59Z').getTime()) };
}
async function studentInPost(db, g, user, post) {
  if (post.status !== 'PUBLISHED') fail(404, 'This assignment is unavailable.');
  const base = '/courses/' + enc(post.course_id) + '/courseWork/' + enc(post.coursework_id);
  // The submission is the authoritative assignment membership check, including individual targeting.
  const list = await g(base + '/studentSubmissions?userId=me');
  const sub = list.studentSubmissions?.find(s=>s.userId === user.googleSub);
  if (!sub) fail(403, 'This assignment is not assigned to your Google Classroom account.');
  await run(db, `INSERT INTO submissions(post_id,uid,google_sub,classroom_submission_id,updated_at,classroom_status)
    VALUES(?,?,?,?,?,?) ON CONFLICT(post_id,uid) DO UPDATE SET classroom_submission_id=excluded.classroom_submission_id,classroom_status=excluded.classroom_status`, post.id,user.uid,user.googleSub,sub.id,NOW(),sub.state);
  return { base, sub };
}
function safePost(p) { const body=parse(p.body); return { id:p.id,title:body.act.title,className:body.cls.name,classroomUrl:p.classroom_url,maxPoints:p.max_points,courseId:p.course_id }; }

export async function handle(request, env, net = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status:405 });
    if (!['GET','POST'].includes(request.method)) fail(405,'Unsupported method.');
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) fail(403,'Use this site directly.');
    if (!env.DB || !env.FIREBASE_API_KEY) fail(503,'The site owner needs to deploy the Cloudflare backend and database.','backend-setup');
    const user = await authenticate(request,env,net), db=env.DB;
    await run(db,'INSERT INTO users(uid,email,name,created_at) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,name=excluded.name',user.uid,user.email,user.name,NOW());
    const profile = await one(db,'SELECT uid,email,name,role FROM users WHERE uid=?',user.uid);
    const path=url.pathname;
    if (path==='/api/me' && request.method==='GET') return json({profile});
    if(path==='/api/vocabulary/generate' && request.method==='POST'){
      if(profile.role!=='teacher') fail(403,'Only teacher accounts can generate vocabulary.','teacher-required');
      return json(await generateVocabulary({env,db,user,body:await input(request),fail}));
    }
    if (path==='/api/profile' && request.method==='POST') {
      const {role}=await input(request); if (!['teacher','student'].includes(role)) fail(400,'Choose teacher or student.');
      await run(db,'UPDATE users SET role=? WHERE uid=?',role,user.uid); return json({profile:{...profile,role}});
    }
    if (path==='/api/workspace') {
      if (profile.role!=='teacher') fail(403,'Switch to your teacher workspace first.');
      const existing=await one(db,'SELECT body,revision FROM workspaces WHERE owner_uid=?',user.uid);
      if (request.method==='GET') return json({workspace:existing?parse(existing.body):emptyWorkspace(),revision:existing?.revision||0});
      const b=await input(request), workspace=validateWorkspace(b.workspace);
      if (!Number.isInteger(b.revision) || b.revision<0) fail(400,'Workspace revision is missing.');
      let changed;
      if (existing) changed=await run(db,'UPDATE workspaces SET body=?,revision=revision+1,updated_at=? WHERE owner_uid=? AND revision=?',JSON.stringify(workspace),NOW(),user.uid,b.revision);
      else {
        if (b.revision!==0) fail(409,'Your workspace changed in another tab. Reload before saving.','workspace-conflict');
        changed=await run(db,'INSERT OR IGNORE INTO workspaces(owner_uid,body,revision,updated_at) VALUES(?,?,1,?)',user.uid,JSON.stringify(workspace),NOW());
      }
      if (!changed.meta.changes) fail(409,'Your workspace changed in another tab. Export a backup, then reload before saving.','workspace-conflict');
      return json({revision:b.revision+1});
    }
    if (path==='/api/submissions' && request.method==='GET') {
      const list=await rows(db,`SELECT s.*,p.activity_id,p.max_points FROM submissions s JOIN posts p ON p.id=s.post_id WHERE p.owner_uid=? AND s.payload IS NOT NULL`,user.uid);
      return json({submissions:list.map(s=>({...parse(s.payload),_postId:s.post_id,_studentUid:s.uid,_grade:s.grade,_maxPoints:s.max_points,_status:s.status,_classroomStatus:s.classroom_status}))});
    }
    if (path==='/api/my-assignments' && request.method==='GET') {
      const list=await rows(db,'SELECT p.*,s.status AS submission_status,s.grade FROM posts p JOIN submissions s ON s.post_id=p.id WHERE s.uid=? AND p.status=?',user.uid,'PUBLISHED');
      return json({assignments:list.map(p=>({...safePost(p),status:p.submission_status,grade:p.grade}))});
    }
    if (path==='/api/classroom/courses' && request.method==='GET') {
      const g=await classroomContext(request,user,net), teaching=url.searchParams.get('role')==='teacher';
      const courses=await allPages(g,'/courses?courseStates=ACTIVE&'+(teaching?'teacherId=me':'studentId=me')+'&pageSize=100','courses');
      return json({courses:courses.map(c=>({id:c.id,name:c.name,section:c.section||''}))});
    }
    if (path==='/api/classroom/find' && request.method==='POST') {
      const {courseId}=await input(request); if (typeof courseId!=='string' || courseId.length>200) fail(400,'Choose a course.');
      const g=await classroomContext(request,user,net);
      await g('/courses/'+enc(courseId)+'/students/me');
      const work=await allPages(g,'/courses/'+enc(courseId)+'/courseWork?pageSize=100','courseWork');
      const ids=new Set(work.map(w=>w.id));
      const posts=await rows(db,'SELECT * FROM posts WHERE course_id=? AND status=?',courseId,'PUBLISHED');
      return json({assignments:posts.filter(p=>ids.has(p.coursework_id)).map(safePost)});
    }
    if (path==='/api/classroom/publish' && request.method==='POST') {
      if (profile.role!=='teacher') fail(403,'Switch to your teacher workspace first.');
      const b=await input(request); if (![b.activityId,b.classId,b.courseId].every(v=>typeof v==='string'&&v.length>0&&v.length<=200)) fail(400,'Choose an activity, class and Classroom course.');
      if (typeof b.maxPoints!=='number' || !Number.isFinite(b.maxPoints) || b.maxPoints<=0 || b.maxPoints>10000) fail(400,'Points must be between 0 and 10,000.');
      const w=await one(db,'SELECT body FROM workspaces WHERE owner_uid=?',user.uid), workspace=w&&parse(w.body);
      const act=workspace?.activities.find(a=>a.id===b.activityId), cls=workspace?.classes.find(c=>c.id===b.classId), asg=act?.assign?.[b.classId];
      if (!act?.title?.trim() || !act.terms.length || !cls || !asg) fail(400,'Save a titled activity with vocabulary and assign it to this class first.');
      const g=await classroomContext(request,user,net);
      await g('/courses/'+enc(b.courseId)+'/teachers/me');
      const existing=await one(db,'SELECT * FROM posts WHERE owner_uid=? AND activity_id=? AND class_id=? AND course_id=?',user.uid,b.activityId,b.classId,b.courseId);
      if (existing && existing.status!=='PUBLISHED') fail(409,'An earlier Classroom publication is unresolved. Check Classroom before asking the site owner to reconcile it.','publish-unresolved');
      const id=existing?.id||crypto.randomUUID(), link=new URL('/#a-'+id,env.PUBLIC_ORIGIN||url.origin).href;
      const code=String(asg.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      const snapshot=JSON.stringify({act,cls,asg});
      if (!existing) await run(db,'INSERT INTO posts(id,owner_uid,activity_id,class_id,course_id,status,body,max_points,code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,user.uid,act.id,cls.id,b.courseId,'CREATING',snapshot,b.maxPoints,code,NOW());
      const coursework={title:act.title,description:(act.instructions||'Complete your Hex Connections board.')+'\nOpen the Hex Connections link, sign in and turn in your work.',materials:[{link:{url:link}}],maxPoints:b.maxPoints};
      // Due dates use explicit UTC in both Classroom and server late calculations.
      if (asg.due && /^\d{4}-\d{2}-\d{2}$/.test(asg.due)) {
        const [year,month,day]=asg.due.split('-').map(Number); coursework.dueDate={year,month,day};coursework.dueTime={hours:23,minutes:59,seconds:59};
      }
      let result;
      if (existing) {
        const mask=['title','description','materials','maxPoints','dueDate','dueTime'].join(',');
        result=await g('/courses/'+enc(b.courseId)+'/courseWork/'+enc(existing.coursework_id)+'?updateMask='+enc(mask),'PATCH',coursework);
      } else result=await g('/courses/'+enc(b.courseId)+'/courseWork','POST',{...coursework,workType:'ASSIGNMENT',state:'PUBLISHED'});
      await run(db,'UPDATE posts SET coursework_id=?,classroom_url=?,status=?,body=?,max_points=?,code=? WHERE id=? AND owner_uid=?',result.id,result.alternateLink||'', 'PUBLISHED',snapshot,b.maxPoints,code,id,user.uid);
      return json({id,url:link,classroomUrl:result.alternateLink||'',updated:!!existing});
    }
    if (path==='/api/resolve' && request.method==='POST') {
      const b=await input(request), code=String(b.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      if(code.length!==6) fail(400,'Enter a six-character class code.');
      const g=await classroomContext(request,user,net), list=await rows(db,'SELECT * FROM posts WHERE code=? AND status=?',code,'PUBLISHED');
      const hits=[];
      for(const p of list){try{await studentInPost(db,g,user,p);hits.push(p.id)}catch(e){if(e.status!==403&&e.status!==404)throw e}}
      if(hits.length!==1) fail(404,'Use the assignment link in Google Classroom. This code is unavailable or matches more than one assignment.');
      return json({id:hits[0]});
    }
    const postRoute=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)(?:\/(draft|submit|grade|reclaim))?$/);
    if(postRoute){
      const [,id,action]=postRoute, post=await one(db,'SELECT * FROM posts WHERE id=?',id);
      if(!post) fail(404,'Assignment not found.');
      const info=parse(post.body);
      if(!action && request.method==='GET') {
        const g=await classroomContext(request,user,net);
        if(post.owner_uid!==user.uid) await studentInPost(db,g,user,post);
        else await g('/courses/'+enc(post.course_id)+'/teachers/me');
        const s=await one(db,'SELECT draft,status,grade,classroom_status FROM submissions WHERE post_id=? AND uid=?',id,user.uid);
        return json({assignment:{...info,id,ownerUid:post.owner_uid},draft:parse(s?.draft),status:s?.status||'DRAFT',classroomStatus:s?.classroom_status,grade:s?.grade});
      }
      if(action==='grade' && request.method==='POST') {
        if(post.owner_uid!==user.uid) fail(403,'Only this assignment’s owner may grade it.');
        const b=await input(request);
        if(typeof b.studentUid!=='string' || typeof b.grade!=='number' || !Number.isFinite(b.grade) || b.grade<0 || b.grade>post.max_points) fail(400,'Enter a valid grade within the assignment points.');
        const s=await one(db,'SELECT * FROM submissions WHERE post_id=? AND uid=?',id,b.studentUid);
        if(!s?.payload) fail(404,'No submitted work found.');
        const g=await classroomContext(request,user,net);
        await g('/courses/'+enc(post.course_id)+'/teachers/me');
        const base='/courses/'+enc(post.course_id)+'/courseWork/'+enc(post.coursework_id)+'/studentSubmissions/'+enc(s.classroom_submission_id);
        const current=await g(base);
        if(current.state!=='TURNED_IN' && current.state!=='RETURNED') fail(409,'The student must turn in the assignment in Classroom before it can be graded.');
        await g(base+'?updateMask=draftGrade,assignedGrade','PATCH',{draftGrade:b.grade,assignedGrade:b.grade});
        if(current.state==='TURNED_IN') await g(base+':return','POST',{});
        await run(db,'UPDATE submissions SET grade=?,status=?,classroom_status=?,updated_at=? WHERE post_id=? AND uid=?',b.grade,'GRADED','RETURNED',NOW(),id,b.studentUid);
        return json({grade:b.grade});
      }
      if(action==='draft' && request.method==='POST') {
        const s=await one(db,'SELECT uid FROM submissions WHERE post_id=? AND uid=?',id,user.uid);
        if(!s) fail(403,'Open the assignment through Google Classroom first.');
        if(info.asg.open===false || post.status!=='PUBLISHED') fail(403,'This assignment is closed.');
        const b=await input(request), draft=boardDraft(b.draft,info.act);
        await run(db,'UPDATE submissions SET draft=?,updated_at=? WHERE post_id=? AND uid=?',JSON.stringify(draft),NOW(),id,user.uid);
        return json({savedAt:draft._savedAt});
      }
      if(['submit','reclaim'].includes(action) && request.method==='POST') {
        const g=await classroomContext(request,user,net), {base,sub}=await studentInPost(db,g,user,post);
        const subPath=base+'/studentSubmissions/'+enc(sub.id);
        if(action==='reclaim') {
          if(sub.state!=='TURNED_IN') fail(409,'This assignment is already open for editing.');
          await g(subPath+':reclaim','POST',{});
          await run(db,'UPDATE submissions SET status=?,classroom_status=?,grade=NULL WHERE post_id=? AND uid=?','DRAFT','RECLAIMED_BY_STUDENT',id,user.uid);
          return json({reclaimed:true});
        }
        if(info.asg.open===false) fail(403,'Your teacher has closed this assignment.');
        if(sub.state==='TURNED_IN') {
          const prior=await one(db,'SELECT payload,status FROM submissions WHERE post_id=? AND uid=?',id,user.uid);
          if(prior?.status==='SAVED_PENDING_CLASSROOM' && prior.payload){
            await run(db,'UPDATE submissions SET status=?,classroom_status=? WHERE post_id=? AND uid=?','TURNED_IN','TURNED_IN',id,user.uid);
            return json({submittedAt:parse(prior.payload).submittedAt});
          }
          fail(409,'Reclaim the assignment in Classroom before changing submitted work.','needs-reclaim');
        }
        const b=await input(request), draft=boardDraft(b.draft,info.act), payload=submissionPayload(draft,post,user);
        // Save first. If Classroom rejects turn-in, work stays safe and status says pending.
        await run(db,'UPDATE submissions SET draft=?,payload=?,status=?,updated_at=? WHERE post_id=? AND uid=?',JSON.stringify(draft),JSON.stringify(payload),'SAVED_PENDING_CLASSROOM',NOW(),id,user.uid);
        if(sub.state!=='TURNED_IN') {
          const link=new URL('/#review-'+id+'~'+enc(user.uid),env.PUBLIC_ORIGIN||url.origin).href;
          const attached=(sub.assignmentSubmission?.attachments||[]).some(a=>a.link?.url===link);
          if(!attached) await g(subPath+':modifyAttachments','POST',{addAttachments:[{link:{url:link}}]});
          await g(subPath+':turnIn','POST',{});
        }
        await run(db,'UPDATE submissions SET status=?,classroom_status=?,updated_at=? WHERE post_id=? AND uid=?','TURNED_IN','TURNED_IN',NOW(),id,user.uid);
        return json({submittedAt:payload.submittedAt});
      }
    }
    fail(404,'API route not found.');
  }catch(e){
    if(e instanceof ApiError) return json({error:e.message,code:e.code},e.status);
    // Never echo tokens, SQL, Google response bodies, or stack traces to users.
    return json({error:'The server could not complete this request. Check the Cloudflare database binding and migrations, or try again shortly.',code:'server-error'},500);
  }
}
export default {fetch(request,env){return handle(request,env)}};
