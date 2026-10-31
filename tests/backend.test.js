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
 sql.exec(readFileSync(new URL('../migrations/0004_shares.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0005_multiple_posts.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0006_feedback.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0007_classroom_tools.sql',import.meta.url),'utf8'));
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
   const emailOnly=/^(mail|unverified)/.test(claims.sub);
   if(claims.sub.startsWith('ms'))return Response.json({users:[{localId:claims.sub,email:claims.sub+'@school.example',displayName:'Name '+claims.sub,emailVerified:false,providerUserInfo:[{providerId:'microsoft.com',rawId:'m-'+claims.sub}]}]});
   return Response.json({users:[{localId:claims.sub,email:claims.sub+'@example.org',displayName:'Name '+claims.sub,emailVerified:!claims.sub.startsWith('unverified'),providerUserInfo:emailOnly?[{providerId:'password',rawId:claims.sub+'@example.org'}]:[{providerId:'google.com',rawId:'g-'+claims.sub}]}]});
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
  if(url.pathname==='/v1/courses/course-1/courseWork/cw-1' && method==='GET')return Response.json(state.coursework||{});
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

// ---------------- 4.0: folders, teacher-made (code-only) classes and share links ----------------
const manualWorkspace=(extra={})=>({version:4,folders:[{id:'f1',name:'Biology',parent:null},{id:'f2',name:'Unit 3',parent:'f1'}],
 classes:[{id:'club',name:'Science club'},{id:'p2',name:'Period 2',classroomId:'course-1'}],
 activities:[{id:'act-m',title:'Cells',folder:'f2',terms:[{id:1,term:'Nucleus',def:'Control center'},{id:2,term:'Membrane',def:'Boundary'}],assign:{club:{code:'CLUB23',open:true,due:''}},minWords:2,dcOn:true,dc:['patterns'],board:{shape:'wide',size:'roomy',orient:'flat',rotate:true}}],...extra});
async function manualSetup(h,ws=manualWorkspace()){
 await h.call('teacher','profile',{role:'teacher'});
 assert.equal((await h.call('teacher','workspace',{workspace:ws,revision:0})).status,200);
 const r=await h.call('teacher','manual/publish',{activityId:'act-m',classId:'club'},{access:false});
 assert.equal(r.status,200);return r.body.id;
}
test('workspace folders must form a tree and activities must point to real folders',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 const bad=async ws=>(await h.call('teacher','workspace',{workspace:ws,revision:0})).status;
 assert.equal(await bad(manualWorkspace({folders:[{id:'a',name:'A',parent:'b'},{id:'b',name:'B',parent:'a'}]})),400);
 assert.equal(await bad(manualWorkspace({folders:[{id:'a',name:'A',parent:'missing'}]})),400);
 assert.equal(await bad(manualWorkspace({folders:[{id:'a',name:'  ',parent:null}]})),400);
 const ws=manualWorkspace();ws.activities[0].folder='nope';assert.equal(await bad(ws),400);
 assert.equal(await bad(manualWorkspace()),200);
 assert.deepEqual((await h.call('teacher','workspace')).body.workspace.folders.map(f=>f.name),['Biology','Unit 3']);
});
test('teacher-made classes post without Classroom and students join with the class code',async()=>{
 const h=harness(),id=await manualSetup(h);
 assert.equal(h.state.googleCalls.length,0);
 await h.call('kid','profile',{role:'student'},{access:false});
 assert.equal((await h.call('kid','posts/'+id,undefined,{access:false})).status,403);
 const joined=await h.call('kid','resolve',{code:'club-23'},{access:false});assert.equal(joined.status,200);assert.equal(joined.body.id,id);
 const open=await h.call('kid','posts/'+id,undefined,{access:false});assert.equal(open.status,200);assert.equal(open.body.assignment.act.title,'Cells');
 assert.equal((await h.call('kid','posts/'+id+'/draft',{draft:h.draft},{access:false})).status,200);
 const sub=await h.call('kid','posts/'+id+'/submit',{draft:h.draft},{access:false});assert.equal(sub.status,200);
 assert.equal((await h.call('kid','posts/'+id+'/submit',{draft:h.draft},{access:false})).status,409);
 assert.equal((await h.call('kid','student/dashboard',undefined,{access:false})).body.submitted.length,1);
 assert.equal((await h.call('kid','posts/'+id+'/grade',{studentUid:'kid',grade:5},{access:false})).status,403);
 const g=await h.call('teacher','posts/'+id+'/grade',{studentUid:'kid',grade:90},{access:false});assert.equal(g.status,200);
 assert.equal(h.sql.prepare('SELECT grade FROM submissions WHERE post_id=? AND uid=?').get(id,'kid').grade,90);
 assert.equal((await h.call('kid','posts/'+id+'/reclaim',{},{access:false})).status,200);
 assert.equal((await h.call('teacher','teacher/dashboard',undefined,{access:false})).body.assignments[0].manual,true);
 assert.equal(h.state.googleCalls.length,0);
});
test('closed or unknown class codes do not grant access; reposting keeps the same assignment',async()=>{
 const h=harness(),id=await manualSetup(h);
 assert.equal((await h.call('kid','resolve',{code:'ZZZZZZ'},{access:false})).status,404);
 const ws=manualWorkspace();ws.activities[0].assign.club.open=false;
 assert.equal((await h.call('teacher','workspace',{workspace:ws,revision:1})).status,200);
 const again=await h.call('teacher','manual/publish',{activityId:'act-m',classId:'club'},{access:false});assert.equal(again.body.id,id);assert.equal(again.body.updated,true);
 assert.equal((await h.call('kid','resolve',{code:'CLUB23'},{access:false})).status,403);
 await h.call('teacher2','profile',{role:'teacher'});await h.call('teacher2','workspace',{workspace:manualWorkspace(),revision:0});
 assert.equal((await h.call('teacher2','manual/publish',{activityId:'act-m',classId:'club'},{access:false})).status,409);
});
test('group codes for teacher-made classes work without Classroom',async()=>{
 const h=harness(),id=await manualSetup(h);
 const grp=await h.call('teacher','posts/'+id+'/groups',{name:'Team A',maxMembers:2},{access:false});assert.equal(grp.status,201);
 const j=await h.call('kid','groups/join',{code:grp.body.group.code},{access:false});assert.equal(j.status,200);assert.equal(j.body.postId,id);
 assert.equal((await h.call('kid','posts/'+id,undefined,{access:false})).body.group.name,'Team A');
});
test('share links copy only the activity template and only to teacher accounts',async()=>{
 const h=harness();await manualSetup(h);
 const created=await h.call('teacher','shares',{activityId:'act-m'},{access:false});assert.equal(created.status,201);
 const code=created.body.share.code;assert.match(code,/^[A-Z2-9]{10}$/);
 const again=await h.call('teacher','shares',{activityId:'act-m'},{access:false});assert.equal(again.body.share.code,code);assert.equal(again.body.updated,true);
 await h.call('kid','profile',{role:'student'},{access:false});
 assert.equal((await h.call('kid','shares/'+code,undefined,{access:false})).status,403);
 await h.call('teacher2','profile',{role:'teacher'});
 const preview=await h.call('teacher2','shares/'+code.toLowerCase(),undefined,{access:false});assert.equal(preview.status,200);
 assert.equal(preview.body.share.sharedBy,'Name teacher');assert.equal(preview.body.share.mine,false);
 const act=preview.body.activity;assert.equal(act.title,'Cells');assert.deepEqual(act.dc,['patterns']);assert.equal(act.board.shape,'wide');
 for(const k of ['assign','folder','id'])assert.equal(act[k],undefined);
 const copy=await h.call('teacher2','shares/'+code+'/copy',{},{access:false});assert.equal(copy.status,200);assert.equal(copy.body.activity.terms.length,2);
 assert.equal((await h.call('teacher','shares',undefined,{access:false})).body.shares[0].copies,1);
 assert.equal((await h.call('teacher2','shares/'+code+'/revoke',{},{access:false})).status,404);
 assert.equal((await h.call('teacher','shares/'+code+'/revoke',{},{access:false})).status,200);
 assert.equal((await h.call('teacher2','shares/'+code,undefined,{access:false})).status,404);
 assert.equal((await h.call('teacher','shares',{activityId:'act-m'},{access:false})).body.share.code,code);
 assert.equal((await h.call('teacher2','shares/'+code,undefined,{access:false})).status,200);
 assert.equal((await h.call('teacher2','shares',{activityId:'missing'},{access:false})).status,404);
});

// ---------------- 4.1: email accounts, locked account types, removing classes ----------------
test('verified email + password accounts can use the site; unverified ones are asked to confirm',async()=>{
 const h=harness();
 const un=await h.call('unverified1','me',undefined,{access:false});assert.equal(un.status,401);assert.equal(un.body.code,'email-unverified');
 const reg=await h.call('mailteacher','register',{role:'teacher'},{access:false});assert.equal(reg.status,201);assert.equal(reg.body.profile.role,'teacher');
 const id=await manualSetup({...h,call:(uid,...rest)=>h.call(uid==='teacher'?'mailteacher':uid,...rest)});
 await h.call('mailkid','register',{role:'student'},{access:false});
 assert.equal((await h.call('mailkid','resolve',{code:'CLUB23'},{access:false})).status,200);
 assert.equal((await h.call('mailkid','posts/'+id,undefined,{access:false})).status,200);
 const cls=await h.call('mailteacher','classroom/courses?role=teacher');assert.equal(cls.status,403);assert.equal(cls.body.code,'google-link-required');
 assert.equal(h.state.googleCalls.length,0);
});
test('account type is chosen once and a student can never make itself a teacher',async()=>{
 const h=harness();
 assert.equal((await h.call('kid','register',{role:'student'},{access:false})).status,201);
 const sw=await h.call('kid','profile',{role:'teacher'},{access:false});assert.equal(sw.status,403);assert.equal(sw.body.code,'role-locked');
 assert.equal((await h.call('kid','register',{role:'teacher'},{access:false})).body.profile.role,'student');
 assert.equal((await h.call('kid','me',undefined,{access:false})).body.profile.role,'student');
 for(const [path,body] of [['workspace',undefined],['teacher/dashboard',undefined],['shares',undefined],['manual/publish',{activityId:'a',classId:'b'}],['manual/close-class',{classId:'b'}]]){
  const r=await h.call('kid',path,body,{access:false});assert.equal(r.status,403,path);assert.equal(r.body.code,'teacher-required',path);
 }
 assert.equal((await h.call('kid','profile',{role:'student'},{access:false})).status,200);
});
test('removing a code-only class turns off its code but keeps student work',async()=>{
 const h=harness(),id=await manualSetup(h);
 await h.call('kid','profile',{role:'student'},{access:false});
 assert.equal((await h.call('kid','resolve',{code:'CLUB23'},{access:false})).status,200);
 assert.equal((await h.call('kid','posts/'+id+'/submit',{draft:h.draft},{access:false})).status,200);
 assert.equal((await h.call('teacher2','manual/close-class',{classId:'club'},{access:false})).status,403);
 await h.call('teacher2','profile',{role:'teacher'},{access:false});
 assert.equal((await h.call('teacher2','manual/close-class',{classId:'club'},{access:false})).body.closed,0);
 assert.equal((await h.call('teacher','manual/close-class',{classId:'club'},{access:false})).body.closed,1);
 await h.call('kid2','profile',{role:'student'},{access:false});
 assert.equal((await h.call('kid2','resolve',{code:'CLUB23'},{access:false})).status,403);
 const subs=await h.call('teacher','submissions?postId='+id,undefined,{access:false});assert.equal(subs.body.submissions.length,1);
});
test('imported classes may keep a link to their Google Classroom course, but only a classroom.google.com address',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 const ws=link=>({version:4,classes:[{id:'gc-1',name:'Psychology',classroomId:'course-1',classroomUrl:link}],activities:[]});
 assert.equal((await h.call('teacher','workspace',{workspace:ws('https://evil.example/c/1'),revision:0})).status,400);
 assert.equal((await h.call('teacher','workspace',{workspace:ws('https://classroom.google.com/c/MTIz'),revision:0})).status,200);
 const courses=await h.call('teacher','classroom/courses?role=teacher');assert.equal(courses.status,200);assert.equal(courses.body.courses[0].link,'');
});

// ---------------- 4.2: each posting is its own assignment with start and due dates ----------------
import {zonedTime,postDates} from '../src/postings.js';
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
test('dates are whole days in the teacher’s time zone, including daylight-saving changes',()=>{
 const f=(s,m)=>{const e=new Error(m);e.status=s;throw e};
 assert.equal(new Date(zonedTime('2026-11-03',23,59,59,'America/Los_Angeles')).toISOString(),'2026-11-04T07:59:59.000Z');
 assert.equal(new Date(zonedTime('2026-10-30',23,59,59,'America/Los_Angeles')).toISOString(),'2026-10-31T06:59:59.000Z');
 assert.equal(new Date(zonedTime('2026-11-02',0,0,0,'America/New_York')).toISOString(),'2026-11-02T05:00:00.000Z');
 const d=postDates({start:'2026-11-02',due:'2026-11-06',tz:'America/Los_Angeles'},f);assert.equal(d.startAt,'2026-11-02T08:00:00.000Z');assert.equal(d.dueAt,'2026-11-07T07:59:59.000Z');
 assert.throws(()=>postDates({start:'2026-11-06',due:'2026-11-02',tz:'UTC'},f),/on or after/);
 assert.throws(()=>postDates({due:'2026-02-30',tz:'UTC'},f),/valid due date/);
 assert.throws(()=>postDates({due:'2026-11-02',tz:'Mars/Base'},f),/time zone/);
});
test('the same Hex Space can be posted to the same class several times, each with its own code and dates',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 assert.equal((await h.call('teacher','workspace',{workspace:manualWorkspace(),revision:0})).status,200);
 const one=await h.call('teacher','posts/new',{activityId:'act-m',classId:'club',due:day(7),tz:'America/Los_Angeles'},{access:false});
 assert.equal(one.status,201);assert.equal(one.body.code.length,6);
 const two=await h.call('teacher','posts/new',{activityId:'act-m',classId:'club',title:'Cells — round 2',start:day(10),due:day(14),tz:'America/Los_Angeles'},{access:false});
 assert.equal(two.status,201);assert.notEqual(two.body.code,one.body.code);assert.notEqual(two.body.id,one.body.id);
 const dash=(await h.call('teacher','teacher/dashboard',undefined,{access:false})).body.assignments;
 assert.equal(dash.length,2);assert.ok(dash.some(a=>a.title==='Cells — round 2'&&a.start===day(10)&&a.due===day(14)));
 assert.equal((await h.call('teacher','posts/new',{activityId:'act-m',classId:'club',due:day(-1),tz:'UTC'},{access:false})).status,400);
 await h.call('kid','profile',{role:'student'},{access:false});
 const joined=await h.call('kid','resolve',{code:one.body.code},{access:false});assert.equal(joined.status,200);assert.equal(joined.body.id,one.body.id);
 const early=await h.call('kid','resolve',{code:two.body.code},{access:false});assert.equal(early.status,403);assert.equal(early.body.code,'not-started');assert.match(early.body.error,/opens on/);
 assert.equal(h.state.googleCalls.length,0);
});
test('teachers change dates, close, reopen and refresh a posting; late work is flagged by the due date',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 await h.call('teacher','workspace',{workspace:manualWorkspace(),revision:0});
 const p=(await h.call('teacher','posts/new',{activityId:'act-m',classId:'club',due:day(5),tz:'UTC'},{access:false})).body;
 await h.call('kid','profile',{role:'student'},{access:false});await h.call('kid','resolve',{code:p.code},{access:false});
 assert.equal((await h.call('kid','posts/'+p.id+'/edit',{due:day(9)},{access:false})).status,403);
 const later=await h.call('teacher','posts/'+p.id+'/edit',{start:day(3),tz:'UTC'},{access:false});assert.equal(later.status,200);assert.equal(later.body.due,day(5));
 const blocked=await h.call('kid','posts/'+p.id,undefined,{access:false});assert.equal(blocked.status,403);assert.equal(blocked.body.code,'not-started');
 assert.equal((await h.call('teacher','posts/'+p.id+'/edit',{start:'',due:day(-2),tz:'UTC'},{access:false})).status,200);
 assert.equal((await h.call('kid','posts/'+p.id,undefined,{access:false})).status,200);
 const sub=await h.call('kid','posts/'+p.id+'/submit',{draft:h.draft},{access:false});assert.equal(sub.status,200);
 const rows=(await h.call('teacher','submissions?postId='+p.id,undefined,{access:false})).body.submissions;assert.equal(rows[0].late,true);
 assert.equal((await h.call('teacher','posts/'+p.id+'/edit',{open:false},{access:false})).status,200);
 await h.call('kid2','profile',{role:'student'},{access:false});
 assert.equal((await h.call('kid2','resolve',{code:p.code},{access:false})).status,403);
 const ws=manualWorkspace();ws.activities[0].terms.push({id:3,term:'Ribosome',def:'Makes proteins'});
 await h.call('teacher','workspace',{workspace:ws,revision:1});
 const fresh=await h.call('teacher','posts/'+p.id+'/edit',{open:true,refresh:true,title:'Cells quiz'},{access:false});assert.equal(fresh.status,200);
 const post=h.sql.prepare('SELECT body FROM posts WHERE id=?').get(p.id);const info=JSON.parse(post.body);
 assert.equal(info.act.terms.length,3);assert.equal(info.act.title,'Cells quiz');assert.equal(info.asg.open,true);assert.equal(info.asg.code,p.code);
});
test('Classroom postings are scheduled in Classroom until the start date and carry the due date',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 await h.call('teacher','workspace',{workspace:manualWorkspace(),revision:0});
 const r=await h.call('teacher','posts/new',{activityId:'act-m',classId:'p2',start:day(4),due:day(8),tz:'America/Los_Angeles',maxPoints:20});
 assert.equal(r.status,201);assert.equal(r.body.scheduled,true);
 const cw=h.state.coursework;assert.equal(cw.state,'DRAFT');assert.equal(cw.scheduledTime,r.body.startAt);assert.equal(cw.maxPoints,20);
 const due=new Date(r.body.dueAt);assert.deepEqual(cw.dueDate,{year:due.getUTCFullYear(),month:due.getUTCMonth()+1,day:due.getUTCDate()});assert.equal(cw.dueTime.hours,due.getUTCHours());
 assert.ok(cw.materials[0].link.url.endsWith('/#a-'+r.body.id));
 const now=await h.call('teacher','posts/'+r.body.id+'/edit',{start:'',due:'',tz:'America/Los_Angeles'});assert.equal(now.status,200);
 assert.equal(h.state.coursework.state,'PUBLISHED');assert.equal(h.state.coursework.dueDate,undefined);
 const edits=h.state.googleCalls.filter(c=>c.method==='PATCH');assert.match(edits.at(-1).query,/state/);
});
test('a Classroom posting Google refuses leaves no stuck pending assignment',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});
 await h.call('teacher','workspace',{workspace:manualWorkspace(),revision:0});
 h.state.classroomError={error:{status:'PERMISSION_DENIED',details:[{reason:'insufficientPermissions'}]}};
 const realTeacher=await h.call('teacher','posts/new',{activityId:'act-m',classId:'p2',tz:'UTC'});assert.equal(realTeacher.status,403);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM posts').get().n,0);
});

// ---------------- 4.5: feedback, progress, account export and deletion ----------------
test('teachers score each connection, comment, and return work for revision; students see it',async()=>{
 const h=harness(),id=await manualSetup(h);
 await h.call('kid','profile',{role:'student'},{access:false});await h.call('kid','resolve',{code:'CLUB23'},{access:false});
 assert.equal((await h.call('teacher','posts/'+id+'/feedback',{studentUid:'kid',scores:{1:2}},{access:false})).status,404);
 assert.equal((await h.call('kid','posts/'+id+'/submit',{draft:h.draft},{access:false})).status,200);
 assert.equal((await h.call('kid','posts/'+id+'/feedback',{studentUid:'kid',scores:{1:2}},{access:false})).status,403);
 assert.equal((await h.call('teacher','posts/'+id+'/feedback',{studentUid:'kid',scores:{1:3}},{access:false})).status,400);
 const fb=await h.call('teacher','posts/'+id+'/feedback',{studentUid:'kid',scores:{1:1},comments:{1:'Say how experience changes memory.'},overall:'Good start.',revise:true},{access:false});
 assert.equal(fb.status,200);
 const view=(await h.call('kid','posts/'+id,undefined,{access:false})).body;
 assert.equal(view.feedback.scores['1'],1);assert.equal(view.feedback.comments['1'],'Say how experience changes memory.');assert.equal(view.feedback.revise,true);assert.equal(view.status,'DRAFT');
 assert.equal((await h.call('kid','posts/'+id+'/submit',{draft:h.draft},{access:false})).status,200);
 const subs=(await h.call('teacher','submissions?postId='+id,undefined,{access:false})).body.submissions;assert.equal(subs[0]._feedback.overall,'Good start.');
});
test('Present mode progress lists each student’s placed terms and connections, for the owner only',async()=>{
 const h=harness(),id=await manualSetup(h);
 await h.call('kid','profile',{role:'student'},{access:false});await h.call('kid','resolve',{code:'CLUB23'},{access:false});
 await h.call('kid','posts/'+id+'/draft',{draft:h.draft},{access:false});
 const r=await h.call('teacher','posts/'+id+'/progress',undefined,{access:false});assert.equal(r.status,200);
 assert.equal(r.body.terms,2);assert.equal(r.body.students[0].placed,2);assert.equal(r.body.students[0].connections,1);assert.equal(r.body.act.terms.length,2);
 assert.equal((await h.call('kid','posts/'+id+'/progress',undefined,{access:false})).status,403);
 await h.call('teacher2','profile',{role:'teacher'},{access:false});assert.equal((await h.call('teacher2','posts/'+id+'/progress',undefined,{access:false})).status,404);
});
test('users can export their data and delete their account and everything it owns',async()=>{
 const h=harness(),id=await manualSetup(h);
 await h.call('kid','profile',{role:'student'},{access:false});await h.call('kid','resolve',{code:'CLUB23'},{access:false});
 await h.call('kid','posts/'+id+'/submit',{draft:h.draft},{access:false});
 const ex=await h.call('kid','account/export',undefined,{access:false});assert.equal(ex.status,200);assert.equal(ex.body.myWork.length,1);
 const tx=await h.call('teacher','account/export',undefined,{access:false});assert.equal(tx.body.workspace.activities.length,1);assert.equal(tx.body.postings.length,1);
 assert.equal((await h.call('kid','account/delete',{confirm:'nope'},{access:false})).status,400);
 assert.equal((await h.call('kid','account/delete',{confirm:'DELETE'},{access:false})).status,200);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM submissions WHERE uid=?').get('kid').n,0);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM users WHERE uid=?').get('kid').n,0);
 await h.call('kid2','profile',{role:'student'},{access:false});await h.call('kid2','resolve',{code:'CLUB23'},{access:false});
 const del=await h.call('teacher','account/delete',{confirm:'DELETE'},{access:false});assert.equal(del.status,200);assert.equal(del.body.postings,1);
 for(const t of ['posts','submissions','workspaces','shares'])assert.equal(h.sql.prepare('SELECT count(*) n FROM '+t).get().n,0,t);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM users WHERE uid=?').get('teacher').n,0);
});

// ---------------- 4.7 ----------------
const threeTerms=()=>manualWorkspace({activities:[{id:'act-m',title:'Cells',terms:[{id:1,term:'Nucleus',def:'Control center'},{id:2,term:'Membrane',def:'Boundary'},{id:3,term:'Ribosome',def:'Builds proteins'}],minWords:2,minTerms:'',starters:true,reflect:true}]});
const kidJoin=async(h,uid,code)=>{await h.call(uid,'profile',{role:'student'},{access:false});return (await h.call(uid,'resolve',{code},{access:false})).body.id};
test('differentiated versions: students see their version’s terms, teachers move students, and work is trimmed to fit',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});await h.call('teacher','workspace',{workspace:threeTerms(),revision:0});
 assert.equal((await h.call('teacher','posts/new',{activityId:'act-m',classId:'club',tz:'UTC',versions:[{name:'Core',terms:[1,2,3]},{name:'Support',terms:[]}]},{access:false})).status,400);
 const p=await h.call('teacher','posts/new',{activityId:'act-m',classId:'club',tz:'UTC',versions:[{name:'Core',terms:[1,2,3]},{name:'Support',terms:[1,2,99],starters:true,minWords:1}]},{access:false});
 assert.equal(p.status,201);const id=p.body.id;
 await kidJoin(h,'kid',p.body.code);
 let v=(await h.call('kid','posts/'+id,undefined,{access:false})).body;
 assert.equal(v.assignment.act.terms.length,3);assert.equal(v.assignment.asg.versions,undefined,'version names stay with the teacher');
 assert.equal((await h.call('kid','posts/'+id+'/version',{studentUid:'kid',version:1},{access:false})).status,403);
 const mv=await h.call('teacher','posts/'+id+'/version',{studentUids:['kid'],version:1},{access:false});assert.equal(mv.body.changed,1);assert.equal(mv.body.name,'Support');
 v=(await h.call('kid','posts/'+id,undefined,{access:false})).body;
 assert.deepEqual(v.assignment.act.terms.map(t=>t.id),[1,2]);assert.equal(v.assignment.act.minWords,1);
 const board={name:'x',place:{1:[0,0],2:[1,0],3:[0,1]},conns:{'1-2':{why:'Boundary protects control.',at:1},'1-3':{why:'Both inside cell.',at:2}},view:{},
  reflection:{proud:'  The membrane link  ',hard:'Ribosomes'},history:[[0,1,0,0],[900,2,1,0],[1500,'1-2'],[2000,3,0,1],[2100,'bad'],['x',1,0,0],[2500,2,null,null],[2600,2,1,0]],startedAt:'2026-10-30T10:00:00Z'};
 assert.equal((await h.call('kid','posts/'+id+'/submit',{draft:board},{access:false})).status,200);
 const sub=(await h.call('teacher','submissions?postId='+id,undefined,{access:false})).body.submissions[0];
 assert.deepEqual(Object.keys(sub.placements),['1','2'],'term 3 is not in this version');
 assert.equal(sub.connections.length,1);assert.equal(sub.version,'Support');
 assert.deepEqual(sub.reflection,{proud:'The membrane link',hard:'Ribosomes'});
 assert.deepEqual(sub.history,[[0,1,0,0],[900,2,1,0],[1500,'1-2'],[2500,2,null,null],[2600,2,1,0]]);
 const pr=(await h.call('teacher','posts/'+id+'/progress',undefined,{access:false})).body;
 assert.equal(pr.students[0].variant,1);assert.deepEqual(pr.versions,[{name:'Core',terms:3},{name:'Support',terms:2}]);
 const ed=await h.call('teacher','posts/'+id+'/edit',{versions:null},{access:false});assert.equal(ed.status,200);assert.equal(ed.body.versions,null);
 assert.equal((await h.call('kid','posts/'+id,undefined,{access:false})).body.assignment.act.terms.length,3);
});
test('gallery walk: anonymous boards for students who turned in, glow/grow comments, teacher moderation',async()=>{
 const h=harness(),id=await manualSetup(h);
 for(const k of ['kidA','kidB','kidC'])await kidJoin(h,k,'CLUB23');
 for(const k of ['kidA','kidB'])assert.equal((await h.call(k,'posts/'+id+'/submit',{draft:h.draft},{access:false})).status,200);
 assert.equal((await h.call('kidA','posts/'+id+'/gallery',undefined,{access:false})).body.code,'gallery-closed');
 assert.equal((await h.call('kidA','posts/'+id+'/gallery/open',{open:true},{access:false})).status,404);
 assert.equal((await h.call('teacher','posts/'+id+'/gallery/open',{open:true},{access:false})).body.open,true);
 assert.equal((await h.call('kidC','posts/'+id+'/gallery',undefined,{access:false})).body.code,'gallery-turn-in');
 assert.equal((await h.call('stranger','posts/'+id+'/gallery',undefined,{access:false})).status,404);
 const g=await h.call('kidA','posts/'+id+'/gallery',undefined,{access:false});assert.equal(g.status,200);
 const raw=JSON.stringify(g.body);for(const leak of ['kidA','kidB','Name ','example.org'])assert.ok(!raw.includes(leak),'gallery leaks '+leak);
 assert.deepEqual(g.body.boards.map(b=>b.label),['Board A','Board B']);
 const own=g.body.boards.find(b=>b.mine),other=g.body.boards.find(b=>!b.mine);
 assert.equal((await h.call('kidA','posts/'+id+'/gallery/comment',{board:own.board,kind:'glow',text:'Nice work here'},{access:false})).status,400);
 assert.equal((await h.call('kidA','posts/'+id+'/gallery/comment',{board:other.board,kind:'meh',text:'Nice work here'},{access:false})).status,400);
 const c=await h.call('kidA','posts/'+id+'/gallery/comment',{board:other.board,kind:'grow',text:'Say how memory changes.'},{access:false});assert.equal(c.status,201);
 const tv=(await h.call('teacher','posts/'+id+'/gallery',undefined,{access:false})).body;
 const tc=tv.boards.find(b=>b.board===other.board).comments[0];assert.equal(tc.author,'Name kidA');assert.equal(tv.boards.find(b=>b.board===other.board).name,'Name kidB');
 let kb=(await h.call('kidB','posts/'+id+'/gallery',undefined,{access:false})).body.boards.find(b=>b.mine);assert.equal(kb.comments[0].text,'Say how memory changes.');assert.equal(kb.comments[0].author,undefined);
 assert.equal((await h.call('teacher','posts/'+id+'/gallery/hide',{id:tc.id},{access:false})).body.hidden,true);
 kb=(await h.call('kidB','posts/'+id+'/gallery',undefined,{access:false})).body.boards.find(b=>b.mine);assert.equal(kb.comments.length,0);
 await h.call('teacher','posts/'+id+'/gallery/open',{open:false},{access:false});
 assert.equal((await h.call('kidA','posts/'+id+'/gallery',undefined,{access:false})).status,403);
 assert.equal((await h.call('kidA','account/delete',{confirm:'DELETE'},{access:false})).status,200);
 assert.equal(h.sql.prepare('SELECT count(*) n FROM peer_comments').get().n,0);
});
test('the public library lists shared Hex Spaces, searches them, and hides ones reported by three teachers',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});await h.call('teacher','workspace',{workspace:threeTerms(),revision:0});
 const sh=await h.call('teacher','shares',{activityId:'act-m'},{access:false});const code=sh.body.share.code;
 assert.equal((await h.call('teacher','library',{code,subject:'Cooking',grade:'6-8'},{access:false})).status,400);
 assert.equal((await h.call('teacher','library',{code,subject:'Science',grade:'6-8',standards:'MS-LS1-2',summary:'Cell parts and jobs'},{access:false})).status,201);
 await h.call('t2','profile',{role:'teacher'},{access:false});
 assert.equal((await h.call('t2','library',{code,subject:'Science',grade:'6-8'},{access:false})).status,404);
 let list=(await h.call('t2','library?q=ribosome',undefined,{access:false})).body.items;assert.equal(list.length,1,'term text is searchable');assert.equal(list[0].sharedBy,'Name teacher');
 assert.equal((await h.call('t2','library?subject=Math',undefined,{access:false})).body.items.length,0);
 assert.equal((await h.call('t2','library?q=ls1-2',undefined,{access:false})).body.items.length,1);
 await h.call('kid','profile',{role:'student'},{access:false});assert.equal((await h.call('kid','library',undefined,{access:false})).status,403);
 assert.equal((await h.call('teacher','library/'+code+'/report',{reason:'x'},{access:false})).status,400);
 for(const t of ['t2','t3','t3','t4']){await h.call(t,'profile',{role:'teacher'},{access:false});assert.equal((await h.call(t,'library/'+code+'/report',{reason:'Wrong definitions'},{access:false})).status,200)}
 assert.equal((await h.call('t5','library',undefined,{access:false})).status,403);
 await h.call('t5','profile',{role:'teacher'},{access:false});
 assert.equal((await h.call('t5','library',undefined,{access:false})).body.items.length,0,'three different reports hide it');
 assert.equal((await h.call('teacher','library/mine',undefined,{access:false})).body.items[0].hiddenByReports,true);
 assert.equal((await h.call('teacher','library/'+code+'/unlist',{},{access:false})).body.listed,false);
});
test('translation caches each text, limits use and works for any signed-in user',async()=>{
 const h=harness();let calls=0;h.env.AI={run:async(model,inp)=>{calls++;assert.equal(model,'@cf/meta/m2m100-1.2b');return {translated_text:'ES:'+inp.text}}};
 await h.call('kid','profile',{role:'student'},{access:false});
 assert.equal((await h.call('kid','translate',{lang:'xx',texts:['a']},{access:false})).status,400);
 const r=await h.call('kid','translate',{lang:'es',texts:['Nucleus','Control center','Nucleus','']},{access:false});
 assert.deepEqual(r.body.translations,['ES:Nucleus','ES:Control center','ES:Nucleus','']);assert.equal(calls,2);
 await h.call('kid','translate',{lang:'es',texts:['Nucleus']},{access:false});assert.equal(calls,2,'cached');
 h.env.AI={run:async()=>{throw new Error('down')}};
 assert.equal((await h.call('kid','translate',{lang:'es',texts:['New words']},{access:false})).status,503);
});
test('site owner stats, public config and Microsoft accounts',async()=>{
 const h=harness();h.env.OWNER_EMAILS='Teacher@example.org, other@x.org';h.env.CF_ANALYTICS_TOKEN='abc123';
 const cfg=await h.call(null,'config');assert.equal(cfg.status,200);assert.equal(cfg.body.analyticsToken,'abc123');
 await h.call('teacher','profile',{role:'teacher'});assert.equal((await h.call('teacher','me')).body.owner,true);
 const st=await h.call('teacher','owner/stats',undefined,{access:false});assert.equal(st.status,200);assert.equal(st.body.teachers,1);
 assert.equal((await h.call('t2','owner/stats',undefined,{access:false})).status,404);assert.equal((await h.call('t2','me')).body.owner,false);
 const ms=await h.call('msTeacher','me',undefined,{access:false});assert.equal(ms.status,200,'Microsoft accounts need no email-verification step');
 assert.equal((await h.call('msTeacher','profile',{role:'teacher'},{access:false})).status,200);
});
test('student supports chosen when posting: definitions are removed for students, switches can change later',async()=>{
 const h=harness();await h.call('teacher','profile',{role:'teacher'});await h.call('teacher','workspace',{workspace:threeTerms(),revision:0});
 const p=await h.call('teacher','posts/new',{activityId:'act-m',classId:'club',tz:'UTC',options:{defs:false,starters:false,gallery:false,bogus:true}},{access:false});
 assert.equal(p.status,201);const id=p.body.id;await kidJoin(h,'kid',p.body.code);
 let a=(await h.call('kid','posts/'+id,undefined,{access:false})).body.assignment.act;
 assert.ok(a.terms.every(t=>t.def===''),'definitions never reach the student');assert.equal(a.showDefs,false);assert.equal(a.starters,false);assert.equal(a.readAloud,true);assert.equal(a.reflect,true);
 assert.equal((await h.call('teacher','posts/'+id,undefined,{access:false})).body.assignment.act.terms[0].def,'Control center','teacher still sees them');
 assert.equal((await h.call('teacher','posts/'+id+'/gallery/open',{open:true},{access:false})).body.code,'gallery-off');
 const ed=await h.call('teacher','posts/'+id+'/edit',{options:{defs:true,gallery:true}},{access:false});
 assert.deepEqual(ed.body.options,{defs:true,starters:false,readAloud:true,translate:true,reflect:true,gallery:true});
 a=(await h.call('kid','posts/'+id,undefined,{access:false})).body.assignment.act;assert.equal(a.terms[0].def,'Control center');
 assert.equal((await h.call('teacher','posts/'+id+'/gallery/open',{open:true},{access:false})).status,200);
 assert.equal((await h.call('kid','posts/'+id+'/submit',{draft:{name:'',place:{1:[0,0],2:[1,0],3:[0,1]},conns:{'1-2':{why:'Two words.',at:1},'1-3':{why:'Two more.',at:2}},view:{}}},{access:false})).status,200);
 const sub=(await h.call('teacher','submissions?postId='+id,undefined,{access:false})).body.submissions[0];assert.equal(sub.activitySnapshot.terms[0].def,'Control center');
});
