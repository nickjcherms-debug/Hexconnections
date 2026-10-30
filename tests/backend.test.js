import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle} from '../src/worker.js';
const project='hex-connections-a5214';
const aiTerms=Array.from({length:5},(_,i)=>({term:'Concept '+(i+1),definition:'A clear definition for this concept.'}));
const aiRequest={topic:'Memory',subject:'Psychology',grade:'11-12',count:5,style:'student',notes:'',existing:[]};
function harness(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0002_ai_usage.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0003_group_boards.sql',import.meta.url),'utf8'));
 const DB = {
  prepare(query) {
   return {
    bind(...args) {
     const stmt=sql.prepare(query);
     return {
      async first(){return stmt.get(...args)||null},
      async all(){return {results:stmt.all(...args)}},
      async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}
     };
    }
   };
  }
 };
 const state={googleCalls:[],postCount:0,subState:'NEW',failTurnIn:false,failCreate:false,subAttachments:[],unassigned:false};
 const token=uid=>'x.'+Buffer.from(JSON.stringify({aud:project,iss:'https://securetoken.google.com/'+project,sub:uid,exp:Date.now()/1000+3600})).toString('base64url')+'.test';
 const net=async(raw,options={})=>{
  const url=new URL(raw),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
  if(url.hostname==='identitytoolkit.googleapis.com'){
   let claims;try{claims=JSON.parse(Buffer.from(body.idToken.split('.')[1],'base64url'))}catch{return Response.json({}, {status:400})}
   if(body.idToken.endsWith('.invalid'))return Response.json({}, {status:400});
   return Response.json({users:[{localId:claims.sub,email:claims.sub+'@example.org',displayName:'Name '+claims.sub,emailVerified:true,providerUserInfo:[{providerId:'google.com',rawId:'g-'+claims.sub}]}]});
  }
  const uid=(options.headers.Authorization||'').replace('Bearer access-','');
  if(url.pathname==='/oauth2/v3/userinfo')return Response.json({sub:'g-'+uid,email_verified:true});
  state.googleCalls.push({url:url.pathname,query:url.search,method,body,uid});
  if(state.classroomError)return Response.json(state.classroomError,{status:403});
  if(url.pathname.endsWith('/teachers/me'))return Response.json(uid==='teacher'?{userId:'g-teacher'}:{error:{}},{status:uid==='teacher'?200:403});
  if(url.pathname.endsWith('/students/me'))return Response.json(uid.startsWith('student')?{userId:'g-'+uid}:{},{status:uid.startsWith('student')?200:403});
  if(url.pathname==='/v1/courses')return Response.json({courses:[{id:'course-1',name:'Psychology'}]});
  if(url.pathname==='/v1/courses/course-1/courseWork' && method==='POST'){
   state.postCount++;if(state.failCreate)return Response.json({}, {status:500});
   state.coursework={...body,id:'cw-1',alternateLink:'https://classroom.google.com/c/test/a/test'};return Response.json(state.coursework);
  }
  if(url.pathname==='/v1/courses/course-1/courseWork' && method==='GET')return Response.json({courseWork:[{id:'cw-1'}]});
  if(url.pathname==='/v1/courses/course-1/courseWork/cw-1' && method==='PATCH'){
   const mask=url.searchParams.get('updateMask').split(',');
   const writable=['title','description','state','dueDate','dueTime','maxPoints','scheduledTime','submissionModificationMode','topicId','gradingPeriodId','learningGoals'];
   if(mask.some(key=>!writable.includes(key)))return Response.json({error:{status:'INVALID_ARGUMENT'}},{status:400});
   for(const key of mask){if(body[key]===undefined)delete state.coursework[key];else state.coursework[key]=body[key]}
   return Response.json(state.coursework);
  }
  const sub={id:'sub-1',userId:'g-student',state:state.subState,assignmentSubmission:{attachments:state.subAttachments}};
  if(url.pathname.endsWith('/studentSubmissions'))return Response.json({studentSubmissions:uid.startsWith('student')&&!state.unassigned?[{...sub,userId:'g-'+uid}]:[]});
  if(url.pathname.endsWith('/studentSubmissions/sub-1')&&method==='GET')return Response.json(sub);
  if(url.pathname.endsWith(':modifyAttachments')){state.subAttachments.push(...body.addAttachments);return Response.json({})}
  if(url.pathname.endsWith(':turnIn')){if(state.failTurnIn)return Response.json({}, {status:500});state.subState='TURNED_IN';return Response.json({})}
  if(url.pathname.endsWith(':reclaim')){state.subState='RECLAIMED_BY_STUDENT';return Response.json({})}
  if(url.pathname.endsWith(':return')){state.subState='RETURNED';return Response.json({})}
  if(url.pathname.endsWith('/studentSubmissions/sub-1')&&method==='PATCH')return Response.json({...sub,...body});
  throw new Error('Unhandled mock request '+method+' '+url);
 };
 const env={DB,FIREBASE_API_KEY:'configured',FIREBASE_PROJECT_ID:project,PUBLIC_ORIGIN:'https://hexconnections.com',ASSETS:{fetch:()=>new Response('asset')}};
 async function call(uid,path,body,options={}){
  const headers={};if(uid)headers.Authorization='Bearer '+(options.token||token(uid));
  if(options.access!==false&&uid)headers['X-Classroom-Token']='access-'+(options.accessUid||uid);
  if(body!==undefined)headers['Content-Type']='application/json';
  if(options.origin)headers.Origin=options.origin;
  const res=await handle(new Request('https://hexconnections.com/api/'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}),env,net);
  return {status:res.status,body:await res.json()};
 }
 const workspace={version:4,classes:[{id:'class-1',name:'Period 1'}],activities:[{id:'activity-1',title:'Psychology connections',terms:[{id:1,term:'Learning'},{id:2,term:'Memory'}],assign:{'class-1':{code:'ABC123',open:true,due:'2026-12-01'}},minWords:2}]};
 const draft={name:'Not trusted',place:{1:[0,0],2:[1,0]},conns:{'1-2':{why:'Both relate to experience.',at:1}},view:{}};
 async function publish(){await call('teacher','profile',{role:'teacher'});assert.equal((await call('teacher','workspace',{workspace,revision:0})).status,200);const r=await call('teacher','classroom/publish',{activityId:'activity-1',classId:'class-1',courseId:'course-1',maxPoints:100});assert.equal(r.status,200);return r.body.id}
 return {sql,state,env,call,workspace,draft,publish,token};
}
test('Firebase authentication, external origins and project identity are enforced',async()=>{
 const h=harness();assert.equal((await h.call(null,'me')).status,401);assert.equal((await h.call('a','me',undefined,{token:'invalid'})).status,401);assert.equal((await h.call('a','me',undefined,{origin:'https://attacker.example'})).status,403);
 const other='x.'+Buffer.from(JSON.stringify({aud:'another-project',iss:'https://securetoken.google.com/another-project',sub:'a',exp:Date.now()/1000+1000})).toString('base64url')+'.test';assert.equal((await h.call('a','me',undefined,{token:other})).status,401);
 assert.equal((await h.call('a','me')).body.profile.role,null);
});
test('public teacher/student profiles persist and teacher data stays isolated',async()=>{
 const h=harness();assert.equal((await h.call('teacher','profile',{role:'teacher'})).status,200);assert.equal((await h.call('student','profile',{role:'student'})).status,200);
 assert.equal((await h.call('student','workspace')).status,403);assert.equal((await h.call('teacher','workspace',{workspace:h.workspace,revision:0})).status,200);
 await h.call('teacher2','profile',{role:'teacher'});assert.deepEqual((await h.call('teacher2','workspace')).body.workspace.activities,[]);
 assert.equal((await h.call('teacher','workspace',{workspace:h.workspace,revision:0})).status,409);
 assert.equal((await h.call('teacher','workspace',{workspace:h.workspace,revision:1})).body.revision,2);
});
test('Classroom consent and matching Google identity are required',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 assert.equal((await h.call('teacher','classroom/courses?role=teacher',undefined,{access:false})).status,401);
 assert.equal((await h.call('teacher','classroom/courses?role=teacher',undefined,{accessUid:'other'})).status,403);
 assert.equal((await h.call('teacher','classroom/courses?role=teacher')).status,200);
});
test('only an actual Classroom teacher can publish; updates reuse the same post',async()=>{
 const h=harness();await h.call('teacher2','profile',{role:'teacher'});await h.call('teacher2','workspace',{workspace:h.workspace,revision:0});
 const b={activityId:'activity-1',classId:'class-1',courseId:'course-1',maxPoints:100};
 assert.equal((await h.call('teacher2','classroom/publish',b)).status,403);
 const id=await h.publish();const updated=await h.call('teacher','classroom/publish',b);assert.equal(updated.body.id,id);assert.equal(updated.body.updated,true);assert.equal(h.state.postCount,1);
 assert.equal((await h.call('teacher','classroom/publish',{...b,activityId:'not-owned'})).status,400);
});
test('ambiguous Classroom creation is not retried automatically',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});await h.call('teacher','workspace',{workspace:h.workspace,revision:0});h.state.failCreate=true;
 const b={activityId:'activity-1',classId:'class-1',courseId:'course-1',maxPoints:100};assert.equal((await h.call('teacher','classroom/publish',b)).status,502);
 assert.equal((await h.call('teacher','classroom/publish',b)).status,409);assert.equal(h.state.postCount,1);
});
test('assignment access requires an actual student submission, not a chosen student role',async()=>{
 const h=harness(),id=await h.publish();await h.call('intruder','profile',{role:'student'});
 assert.equal((await h.call('intruder','posts/'+id)).status,403);assert.equal((await h.call('student','posts/'+id)).status,200);
 assert.equal((await h.call('student','my-assignments')).body.assignments.length,1);assert.equal((await h.call('intruder','my-assignments')).body.assignments.length,0);
});
test('drafts sync only for the enrolled student; malformed boards are rejected',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','posts/'+id);
 assert.equal((await h.call('intruder','posts/'+id+'/draft',{draft:h.draft})).status,403);
 assert.equal((await h.call('student','posts/'+id+'/draft',{draft:{...h.draft,place:{1:[0,0],2:[0,0]}}})).status,400);
 assert.equal((await h.call('student','posts/'+id+'/draft',{draft:h.draft})).status,200);
 assert.deepEqual((await h.call('student','posts/'+id)).body.draft.place,h.draft.place);
});
test('student turn-in attaches a protected board link and keeps authenticated identity',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','posts/'+id);
 assert.equal((await h.call('student','posts/'+id+'/submit',{draft:{...h.draft,conns:{}}})).status,400);
 const r=await h.call('student','posts/'+id+'/submit',{draft:h.draft});assert.equal(r.status,200);
 const row=h.sql.prepare('SELECT * FROM submissions WHERE post_id=?').get(id);assert.equal(row.status,'TURNED_IN');assert.equal(JSON.parse(row.payload).name,'Name student');
 assert.match(h.state.subAttachments[0].link.url,/#review-/);
 assert.equal((await h.call('student','posts/'+id+'/submit',{draft:{...h.draft,name:'rewrite'}})).status,409);
 assert.equal((await h.call('intruder','submissions')).body.submissions.length,0);
});
test('failed turn-in preserves work and explicitly reports pending Classroom status',async()=>{
 const h=harness(),id=await h.publish();h.state.failTurnIn=true;
 const r=await h.call('student','posts/'+id+'/submit',{draft:h.draft});assert.equal(r.status,502);
 const row=h.sql.prepare('SELECT * FROM submissions WHERE post_id=?').get(id);assert.equal(row.status,'SAVED_PENDING_CLASSROOM');assert.ok(row.payload);
 h.state.failTurnIn=false;assert.equal((await h.call('student','posts/'+id+'/submit',{draft:h.draft})).status,200);assert.equal(h.state.subAttachments.length,1);
});
test('grade writes require assignment ownership, valid bounds and teacher membership',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','posts/'+id+'/submit',{draft:h.draft});
 assert.equal((await h.call('intruder','posts/'+id+'/grade',{studentUid:'student',grade:99})).status,403);
 assert.equal((await h.call('teacher','posts/'+id+'/grade',{studentUid:'student',grade:101})).status,400);
 assert.equal((await h.call('teacher','posts/'+id+'/grade',{studentUid:'student',grade:95})).status,200);
 const patch=h.state.googleCalls.find(c=>c.query.includes('updateMask=draftGrade')&&c.method==='PATCH');assert.deepEqual(patch.body,{draftGrade:95,assignedGrade:95});
 assert.equal(h.state.subState,'RETURNED');assert.equal(h.sql.prepare('SELECT grade FROM submissions WHERE post_id=?').get(id).grade,95);
});
test('reclaim and resubmission preserve the Classroom state workflow',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','posts/'+id+'/submit',{draft:h.draft});
 assert.equal((await h.call('student','posts/'+id+'/reclaim',{})).status,200);assert.equal(h.state.subState,'RECLAIMED_BY_STUDENT');
 assert.equal((await h.call('student','posts/'+id+'/submit',{draft:h.draft})).status,200);
 await h.call('teacher','posts/'+id+'/grade',{studentUid:'student',grade:80});
 assert.equal((await h.call('student','posts/'+id+'/submit',{draft:h.draft})).status,200);
});
test('student course discovery and code resolution use Classroom permissions',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','me');
 assert.equal((await h.call('student','classroom/find',{courseId:'course-1'})).body.assignments[0].id,id);
 assert.equal((await h.call('student','resolve',{code:'ABC-123'})).body.id,id);
 assert.equal((await h.call('intruder','resolve',{code:'ABC123'})).status,404);
});

test('AI generation requires an authenticated teacher and an enabled binding',async()=>{
 const h=harness();assert.equal((await h.call(null,'vocabulary/generate',aiRequest)).status,401);
 await h.call('student','profile',{role:'student'});assert.equal((await h.call('student','vocabulary/generate',aiRequest)).status,403);
 await h.call('teacher','profile',{role:'teacher'});const r=await h.call('teacher','vocabulary/generate',aiRequest);assert.equal(r.status,503);assert.equal(r.body.code,'ai-setup');
});
test('AI returns validated reviewable terms without changing the teacher workspace',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});await h.call('teacher','workspace',{workspace:h.workspace,revision:0});
 let invoked=0;h.env.AI={async run(model,settings){invoked++;assert.equal(model,'@cf/meta/llama-3.2-3b-instruct');assert.equal(settings.stream,false);return {response:JSON.stringify({terms:aiTerms})}}};
 assert.equal((await h.call('teacher','vocabulary/generate',{...aiRequest,count:500})).status,400);assert.equal(invoked,0);
 const r=await h.call('teacher','vocabulary/generate',aiRequest);assert.equal(r.status,200);assert.equal(r.body.terms.length,5);assert.equal(r.body.remaining.teacher,9);assert.ok(new Date(r.body.resetAt)>new Date());
 assert.equal((await h.call('teacher','workspace')).body.workspace.activities[0].terms.length,2);
});
test('AI strips duplicate suggestions, including existing vocabulary',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 h.env.AI={async run(){return {response:'```json\n'+JSON.stringify({terms:[aiTerms[0],aiTerms[0],aiTerms[1]]})+'\n```'}}};
 const r=await h.call('teacher','vocabulary/generate',{...aiRequest,existing:[aiTerms[1].term.toUpperCase()]});assert.equal(r.status,200);assert.deepEqual(r.body.terms,[aiTerms[0]]);
});
test('AI enforces atomic per-teacher limits even with concurrent requests',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});let calls=0;
 h.env.AI={async run(){calls++;return {response:JSON.stringify({terms:aiTerms})}}};
 const results=await Promise.all(Array.from({length:12},()=>h.call('teacher','vocabulary/generate',aiRequest)));
 assert.equal(results.filter(r=>r.status===200).length,10);assert.equal(results.filter(r=>r.body.code==='ai-user-limit').length,2);assert.equal(calls,10);
});
test('AI site limit prevents additional provider calls and refunds rejected user reservations',async()=>{
 const h=harness();h.env.AI_DAILY_SITE_LIMIT='1';let calls=0;h.env.AI={async run(){calls++;return {response:JSON.stringify({terms:aiTerms})}}};
 await h.call('teacher','profile',{role:'teacher'});await h.call('teacher2','profile',{role:'teacher'});
 assert.equal((await h.call('teacher','vocabulary/generate',aiRequest)).status,200);
 const r=await h.call('teacher2','vocabulary/generate',aiRequest);assert.equal(r.status,429);assert.equal(r.body.code,'ai-site-limit');assert.equal(calls,1);
 assert.equal(h.sql.prepare('SELECT used FROM ai_daily_usage WHERE scope=?').get('user:teacher2').used,0);
});
test('malformed AI output and provider exhaustion fail safely without paid fallback',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});let calls=0;
 h.env.AI={async run(){calls++;return {response:'not JSON'}}};assert.equal((await h.call('teacher','vocabulary/generate',aiRequest)).body.code,'ai-output');
 h.env.AI.run=async()=>{calls++;throw new Error('Neuron quota exceeded: private details')};const r=await h.call('teacher','vocabulary/generate',aiRequest);assert.equal(r.status,429);assert.equal(r.body.code,'ai-provider-limit');assert.doesNotMatch(r.body.error,/private details/);assert.equal(calls,2);
});
test('AI missing migration reports setup rather than attempting generation',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});h.sql.exec('DROP TABLE ai_daily_usage');let calls=0;
 h.env.AI={async run(){calls++}};assert.equal((await h.call('teacher','vocabulary/generate',aiRequest)).body.code,'ai-setup');assert.equal(calls,0);
});
test('expanded board coordinates survive save and submission; positions beyond radius 20 are rejected',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','posts/'+id);
 const bigger={...h.draft,place:{1:[19,0],2:[20,0]}};assert.equal((await h.call('student','posts/'+id+'/draft',{draft:bigger})).status,200);
 assert.equal((await h.call('student','posts/'+id+'/submit',{draft:bigger})).status,200);
 assert.equal((await h.call('student','posts/'+id+'/draft',{draft:{...h.draft,place:{1:[20,0],2:[21,0]}}})).status,400);
});
test('Classroom errors distinguish disabled API, missing scopes and school policy',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 for(const [reason,code] of [['SERVICE_DISABLED','classroom-api-disabled'],['ACCESS_TOKEN_SCOPE_INSUFFICIENT','classroom-scope'],['domainPolicy','classroom-school-policy']]){
  h.state.classroomError={error:{details:[{reason}]}};
  const r=await h.call('teacher','classroom/courses?role=teacher');assert.equal(r.body.code,code);
 }
});

test('Classroom republishing changes supported fields while preserving the assignment attachment',async()=>{
 const h=harness();await h.publish();const originalLink=h.state.coursework.materials[0].link.url;
 const changed=structuredClone(h.workspace);changed.activities[0].title='Updated assignment';changed.activities[0].assign['class-1'].due='';
 assert.equal((await h.call('teacher','workspace',{workspace:changed,revision:1})).status,200);
 const r=await h.call('teacher','classroom/publish',{activityId:'activity-1',classId:'class-1',courseId:'course-1',maxPoints:80});
 assert.equal(r.status,200);assert.equal(h.state.coursework.title,'Updated assignment');assert.equal(h.state.coursework.maxPoints,80);
 assert.equal(h.state.coursework.materials[0].link.url,originalLink);assert.equal(h.state.coursework.dueDate,undefined);assert.equal(h.state.coursework.dueTime,undefined);assert.equal(h.state.postCount,1);
});
test('board saves reject reversed duplicate pairs instead of counting one connection twice',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','posts/'+id);
 const invalid={...h.draft,conns:{...h.draft.conns,'2-1':{why:'Same relationship in reverse.',at:2}}};
 assert.equal((await h.call('student','posts/'+id+'/draft',{draft:invalid})).status,400);
 assert.equal((await h.call('student','posts/'+id+'/submit',{draft:invalid})).status,400);
});

test('Google registration creates teacher and student website profiles without duplicate accounts',async()=>{
 const h=harness();assert.equal((await h.call(null,'register',{role:'teacher'})).status,401);
 const teacher=await h.call('new-teacher','register',{role:'teacher'});assert.equal(teacher.status,201);assert.equal(teacher.body.profile.role,'teacher');assert.equal(teacher.body.profile.email,'new-teacher@example.org');
 const again=await h.call('new-teacher','register',{role:'student'});assert.equal(again.status,200);assert.equal(again.body.created,false);assert.equal(again.body.profile.role,'teacher');
 const student=await h.call('new-student','register',{role:'student',uid:'new-teacher'});assert.equal(student.status,201);assert.equal(student.body.profile.uid,'new-student');assert.equal(student.body.profile.role,'student');
 assert.equal(h.sql.prepare('SELECT count(*) AS n FROM users').get().n,2);
 assert.equal((await h.call('new-student','register',{role:'admin'})).status,400);
});
test('simultaneous Google registration requests choose one profile without overwriting it',async()=>{
 const h=harness();const results=await Promise.all([h.call('new-user','register',{role:'teacher'}),h.call('new-user','register',{role:'student'})]);
 assert.equal(results.filter(r=>r.body.created).length,1);assert.equal(results[0].body.profile.role,results[1].body.profile.role);assert.equal(h.sql.prepare('SELECT count(*) AS n FROM users').get().n,1);
});

async function createGroup(h,id,size=4){const r=await h.call('teacher','posts/'+id+'/groups',{name:'Project team',maxMembers:size});assert.equal(r.status,201);return r.body.group}
async function joinGroup(h,uid,group){const r=await h.call(uid,'groups/join',{code:group.code});assert.equal(r.status,200);return r.body.group}
test('teacher dashboard lists issued assignments and submission totals for the owner only',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','posts/'+id+'/submit',{draft:h.draft});
 const r=await h.call('teacher','teacher/dashboard');assert.equal(r.status,200);assert.equal(r.body.assignments.length,1);assert.equal(r.body.assignments[0].id,id);assert.equal(r.body.assignments[0].turnedIn,1);
 await h.call('teacher2','profile',{role:'teacher'});assert.equal((await h.call('teacher2','teacher/dashboard')).body.assignments.length,0);
 await h.call('student','profile',{role:'student'});assert.equal((await h.call('student','teacher/dashboard')).status,403);
 assert.equal((await h.call('teacher2','submissions?postId='+id)).body.submissions.length,0);
});
test('student dashboard discovers active assignments before the student has opened them',async()=>{
 const h=harness(),id=await h.publish();await h.call('student','profile',{role:'student'});
 const cached=await h.call('student','student/dashboard',undefined,{access:false});assert.equal(cached.body.active.length,0);assert.equal(cached.body.needsClassroom,true);
 const connected=await h.call('student','student/dashboard');assert.equal(connected.body.active[0].id,id);assert.equal(connected.body.needsClassroom,false);
 await h.call('student','posts/'+id+'/submit',{draft:h.draft});const done=await h.call('student','student/dashboard');assert.equal(done.body.active.length,0);assert.equal(done.body.submitted.length,1);
 const w=structuredClone(h.workspace);w.activities[0].assign['class-1'].open=false;await h.call('teacher','workspace',{workspace:w,revision:1});await h.call('teacher','classroom/publish',{activityId:'activity-1',classId:'class-1',courseId:'course-1',maxPoints:100});
 const closed=await h.call('student','student/dashboard');assert.equal(closed.body.active.length+closed.body.submitted.length,0);
});
test('teachers create assignment-scoped groups; unauthorized users cannot list their codes',async()=>{
 const h=harness(),id=await h.publish(),g=await createGroup(h,id);
 assert.match(g.code,/^[A-F0-9]{12}$/);assert.equal(g.members.length,0);
 assert.equal((await h.call('student','posts/'+id+'/groups')).status,403);
 assert.equal((await h.call('intruder','posts/'+id+'/groups',{name:'Wrong',maxMembers:4})).status,403);
 const owner=await h.call('teacher','posts/'+id+'/groups');assert.equal(owner.body.groups[0].code,g.code);assert.equal(owner.body.activity.id,'activity-1');
});
test('group code requires real Classroom assignment membership and joining is idempotent',async()=>{
 const h=harness(),id=await h.publish(),g=await createGroup(h,id);
 assert.equal((await h.call('intruder','groups/join',{code:g.code})).status,403);
 assert.equal((await h.call('student','groups/join',{code:'FFFFFFFFFFFF'})).status,404);
 await joinGroup(h,'student',g);await joinGroup(h,'student',g);
 assert.equal((await h.call('student','posts/'+id+'/group')).body.group.members.length,1);
 assert.equal((await h.call('student','posts/'+id)).body.group.id,g.id);
 assert.equal((await h.call('intruder','posts/'+id+'/group')).status,403);
});
test('group capacity and one-group-per-assignment are enforced during simultaneous joins',async()=>{
 const h=harness(),id=await h.publish(),g=await createGroup(h,id,2);await joinGroup(h,'student',g);
 const r=await Promise.all([h.call('student2','groups/join',{code:g.code}),h.call('student3','groups/join',{code:g.code})]);assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===409).length,1);
 const g2=await createGroup(h,id);assert.equal((await h.call('student','groups/join',{code:g2.code})).status,409);
 assert.equal((await h.call('teacher','posts/'+id+'/groups')).body.groups.find(x=>x.id===g.id).members.length,2);
});
test('group board merges independent concurrent tile edits and rejects conflicting edits',async()=>{
 const h=harness(),id=await h.publish(),g=await createGroup(h,id);await joinGroup(h,'student',g);await joinGroup(h,'student2',g);
 const base={place:{},conns:{}};
 const first=await h.call('student','posts/'+id+'/group/draft',{base,draft:{place:{1:[0,0]},conns:{}},revision:0});assert.equal(first.status,200);
 const second=await h.call('student2','posts/'+id+'/group/draft',{base,draft:{place:{2:[1,0]},conns:{}},revision:0});assert.equal(second.status,200);assert.deepEqual(second.body.group.draft.place,{1:[0,0],2:[1,0]});assert.equal(second.body.group.revision,2);
 const conflict=await h.call('student2','posts/'+id+'/group/draft',{base,draft:{place:{1:[0,1]},conns:{}},revision:0});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'group-conflict');
 const current=await h.call('student','posts/'+id+'/group');assert.deepEqual(current.body.group.draft.place,{1:[0,0],2:[1,0]});
 assert.equal((await h.call('intruder','posts/'+id+'/group/draft',{base,draft:base,revision:0})).status,403);
});
test('independent group edits cannot merge two tiles into the same cell',async()=>{
 const h=harness(),id=await h.publish(),g=await createGroup(h,id);await joinGroup(h,'student',g);await joinGroup(h,'student2',g);
 const base={place:{},conns:{}};await h.call('student','posts/'+id+'/group/draft',{base,draft:{place:{1:[0,0]},conns:{}},revision:0});
 const r=await h.call('student2','posts/'+id+'/group/draft',{base,draft:{place:{2:[0,0]},conns:{}},revision:0});assert.equal(r.status,409);assert.equal(r.body.code,'group-conflict');
});
test('group submission uses the shared board snapshot and only submits the current student',async()=>{
 const h=harness(),id=await h.publish(),g=await createGroup(h,id);await joinGroup(h,'student',g);await joinGroup(h,'student2',g);
 const saved=await h.call('student','posts/'+id+'/group/draft',{base:g.draft,draft:h.draft,revision:0});assert.equal(saved.status,200);
 const stale=await h.call('student','posts/'+id+'/submit',{draft:h.draft,groupRevision:0});assert.equal(stale.status,409);assert.equal(stale.body.code,'group-not-saved');
 const submitted=await h.call('student','posts/'+id+'/submit',{draft:{place:{},conns:{}},groupRevision:saved.body.group.revision});assert.equal(submitted.status,200);
 const row=h.sql.prepare('SELECT payload FROM submissions WHERE post_id=? AND uid=?').get(id,'student'),snapshot=JSON.parse(row.payload);
 assert.deepEqual(snapshot.placements,h.draft.place);assert.equal(snapshot.group.id,g.id);assert.equal(snapshot.group.revision,1);
 assert.equal(h.sql.prepare('SELECT payload FROM submissions WHERE post_id=? AND uid=?').get(id,'student2').payload,null);
});
test('individual boards still open if group migration is pending; group controls explain setup',async()=>{
 const h=harness(),id=await h.publish();h.sql.exec('DROP TABLE project_group_members; DROP TABLE project_groups');
 const normal=await h.call('student','posts/'+id);assert.equal(normal.status,200);assert.equal(normal.body.group,null);
 const groups=await h.call('teacher','posts/'+id+'/groups');assert.equal(groups.status,503);assert.equal(groups.body.code,'group-setup');
});

test('leaving a group preserves its board and lets the student join another team',async()=>{
 const h=harness(),id=await h.publish(),g=await createGroup(h,id),other=await createGroup(h,id);await joinGroup(h,'student',g);
 await h.call('student','posts/'+id+'/group/draft',{base:g.draft,draft:h.draft,revision:0});
 assert.equal((await h.call('student','posts/'+id+'/group/leave',{})).status,200);assert.equal((await h.call('student','posts/'+id+'/group')).status,403);
 const owner=await h.call('teacher','posts/'+id+'/groups');assert.deepEqual(owner.body.groups.find(x=>x.id===g.id).draft.place,h.draft.place);
 assert.equal((await h.call('student','groups/join',{code:other.code})).status,200);
});
