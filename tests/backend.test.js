import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle} from '../src/worker.js';
const project='hex-connections-a5214';
function harness(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
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
  if(url.pathname.endsWith('/teachers/me'))return Response.json(uid==='teacher'?{userId:'g-teacher'}:{error:{}},{status:uid==='teacher'?200:403});
  if(url.pathname.endsWith('/students/me'))return Response.json(uid==='student'?{userId:'g-student'}:{},{status:uid==='student'?200:403});
  if(url.pathname==='/v1/courses')return Response.json({courses:[{id:'course-1',name:'Psychology'}]});
  if(url.pathname==='/v1/courses/course-1/courseWork' && method==='POST'){
   state.postCount++;if(state.failCreate)return Response.json({}, {status:500});
   return Response.json({id:'cw-1',alternateLink:'https://classroom.google.com/c/test/a/test'});
  }
  if(url.pathname==='/v1/courses/course-1/courseWork' && method==='GET')return Response.json({courseWork:[{id:'cw-1'}]});
  if(url.pathname==='/v1/courses/course-1/courseWork/cw-1' && method==='PATCH')return Response.json({id:'cw-1',alternateLink:'https://classroom.google.com/c/test/a/test'});
  const sub={id:'sub-1',userId:'g-student',state:state.subState,assignmentSubmission:{attachments:state.subAttachments}};
  if(url.pathname.endsWith('/studentSubmissions'))return Response.json({studentSubmissions:uid==='student'&&!state.unassigned?[sub]:[]});
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
