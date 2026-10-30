import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const script=html.match(/<script id="hx-main">([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.textContent='';this.style={};this.dataset={};}
 appendChild(n){this.children.push(n);n.parentNode=this;return n}
 prepend(n){this.children.unshift(n)}
 insertBefore(n,before){const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,n)}
 replaceChildren(){this.children=[];this.textContent=''}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(k,v){this.listeners[k]=v}
 querySelectorAll(selector){
  const result=[];const visit=n=>{for(const c of n.children||[]){if(selector.startsWith('.')&&(c.className||c.attrs?.class||'').split(' ').includes(selector.slice(1)))result.push(c);visit(c)}};visit(this);return result;
 }
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 focus(){}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this)}
}
function make(){
 const root=new Element('div'),store=new Map();
 const nodes={root,'hx-data':{textContent:'{"classes":[],"activities":[]}'},'hx-auth-config':{textContent:html.match(/id="hx-auth-config">([\s\S]*?)<\/script>/)[1]},'hx-main':{textContent:script},'hx-style':{textContent:''}};
 function search(n,id){return n.attrs?.id===id?n:(n.children||[]).map(c=>search(c,id)).find(Boolean)}
 const document={getElementById:id=>nodes[id]||search(root,id)||search(document.body,id)||null,createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),createTextNode:t=>({textContent:t}),addEventListener(){},body:new Element('body'),querySelector(){return null}};
 const location={hash:'',protocol:'https:',hostname:'hexconnections.com',origin:'https://hexconnections.com',pathname:'/'};
 let hash='';Object.defineProperty(location,'hash',{get(){return hash},set(value){hash=value?(value.startsWith('#')?value:'#'+value):''}});
 const context={document,location,window:{addEventListener(){},innerWidth:1000},setTimeout(){},clearTimeout(){},console,TextDecoder,Uint8Array,Blob,URL,AbortController,DOMException,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
 vm.createContext(context);
 const hooks=`globalThis.hx={GA,PX,AUTH_CONFIG,caps,renderGoogleGate,chooseAccountRole,route,loadPlatform,lsGet,lsSet,googleTeacher,classroomReady,buildDocument,clearAccountView,boardCells,boardOf,onBoardLimit,connectClassroom,setupPane,GROUP,adoptGroup,queueCloudDraft,flushCloudDraft,submit,
 setReady(fn){checkReady=fn},setStudent(s){ST=s},setStudentRender(fn){renderStudentShell=fn},setUpdate(fn){updateStudent=fn},setOpenAssignment(fn){openPlatformAssignment=fn},
 getData(){return DATA},setData(w){DATA=w},setView(fn){viewSubmission=fn},
 setWork(w){TW=w;TS.rows={};TS.sel=w.activities[0].id},setRenderTeacher(fn){renderTeacher=fn},
 setApi(fn){platformApi=fn},setTeacher(fn){startTeacher=fn;teacherDashboard=fn}};`;
 vm.runInContext(script.replace(/route\(\);\nbootGoogle\(\);\n\}\)\(\);\s*$/,hooks+'})();'),context);
 const h=context.hx;
 function flatten(n=root){return [n,...(n.children||[]).flatMap(flatten)]}
 const text=()=>[...flatten(),...flatten(document.body)].map(n=>n.textContent).join(' ');
 return {h,root,location,text,flatten,store,body:document.body};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('configured public login screen offers explicit teacher and student Google choices',()=>{
 const {h,text,flatten}=make();h.GA.ready=true;h.GA.auth={};h.renderGoogleGate();
 assert.equal(h.AUTH_CONFIG.firebase.projectId,'hex-connections-a5214');
 assert.match(text(),/Teacher · Sign in with Google/);assert.match(text(),/Student · Sign in with Google/);
 h.GA.sdk={GoogleAuthProvider:class {setCustomParameters(){}},signInWithPopup:()=>Promise.resolve()};
 flatten().find(n=>n.textContent==='Teacher · Sign in with Google').listeners.click();assert.equal(h.PX.loginRole,'teacher');
});
test('first Google login creates the selected profile and loads its teacher workspace',async()=>{
 const {h,location}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loginRole='teacher';const calls=[];
 h.setApi(async(path,body)=>{calls.push({path,body});if(path==='me')return {profile:{role:null}};if(path==='register')return {profile:{role:body.role},created:true};if(path==='workspace')return {workspace:{version:4,classes:[],activities:[]},revision:0};throw new Error(path)});
 let renders=0;h.setTeacher(()=>renders++);h.loadPlatform();await tick();
 assert.equal(h.PX.profile.role,'teacher');assert.equal(h.PX.loaded,true);assert.equal(location.hash,'#teacher');assert.equal(renders,1);assert.equal(calls.find(c=>c.path==='register').body.role,'teacher');
});
test('student profiles cannot open the teacher workspace without selecting a separate teacher view',()=>{
 const {h,location,text}=make();h.GA.ready=true;h.GA.user={uid:'student',displayName:'Student'};h.PX.loaded=true;h.PX.profile={role:'student'};location.hash='#teacher';
 let teacher=0;h.setTeacher(()=>teacher++);h.route();assert.equal(teacher,0);assert.equal(h.googleTeacher(),false);assert.match(text(),/How will you use Hex Connections/);
});
test('Classroom consent is tracked for the selected role and expires',()=>{
 const {h}=make();h.PX.token='token';h.PX.tokenUntil=Date.now()+10000;h.PX.tokenRole='teacher';
 assert.equal(h.classroomReady('teacher'),true);assert.equal(h.classroomReady('student'),false);h.PX.tokenUntil=Date.now()-1;assert.equal(h.classroomReady('teacher'),false);
});
test('account switches clear Classroom credentials and user data from memory',()=>{
 const {h}=make();h.PX.token='private-token';h.PX.loaded=true;h.PX.profile={role:'teacher'};h.PX.activePost='private-post';h.clearAccountView();
 assert.equal(h.PX.token,null);assert.equal(h.PX.profile,null);assert.equal(h.PX.activePost,null);assert.equal(h.PX.loaded,false);
});
test('browser draft storage is separated by Firebase identity',()=>{
 const {h}=make();h.GA.user={uid:'student-a'};h.lsSet('board',{name:'A'});h.GA.user={uid:'student-b'};assert.equal(h.lsGet('board'),null);h.GA.user={uid:'student-a'};assert.equal(h.lsGet('board').name,'A');
});
test('workspace loading failure never opens an unprotected teacher editor',async()=>{
 const {h,location,text}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};location.hash='#teacher';h.setApi(async()=>{throw new Error('Backend is not deployed')});let teacher=0;h.setTeacher(()=>teacher++);h.loadPlatform();await tick();assert.equal(teacher,0);assert.equal(h.PX.loaded,false);assert.match(text(),/Backend is not deployed/);
});

test('expanded board starts with 61 cells and offers more room for large vocabulary sets',()=>{
 const {h}=make();const act={terms:Array.from({length:30},(_,i)=>({id:i+1,term:'Term '+i}))};
 assert.equal(h.boardCells({terms:[]},{},'pointy').list.length,61);
 assert.equal(h.boardCells(act,{},'pointy').list.length,127);
 const roomy=h.boardCells(act,{},'pointy').list.length;
 assert.ok(h.boardCells({...act,board:{size:'expansive'}},{},'pointy').list.length>roomy);
 assert.equal(h.boardCells({...act,board:{shape:'open'}},{},'pointy').list.length,61);
 assert.equal(h.onBoardLimit(20,0),true);assert.equal(h.onBoardLimit(21,0),false);
});
test('Classroom is ready only after a real course-access check succeeds',async()=>{
 const {h}=make();h.GA.user={uid:'teacher',email:'teacher@example.org'};
 h.GA.sdk={GoogleAuthProvider:class {addScope(){}setCustomParameters(){}static credentialFromResult(){return {accessToken:'new-token'}}},reauthenticateWithPopup:async()=>({})};
 let after=0,resolve;h.setApi(()=>new Promise(r=>resolve=r));h.connectClassroom('teacher',()=>after++);await tick();assert.equal(h.classroomReady('teacher'),false);assert.equal(after,0);
 resolve({courses:[]});await tick();assert.equal(h.classroomReady('teacher'),true);assert.equal(after,1);
});
test('failed Classroom verification clears the temporary token and reports the reason',async()=>{
 const {h,text}=make();h.GA.user={uid:'teacher',email:'teacher@example.org'};
 h.GA.sdk={GoogleAuthProvider:class {addScope(){}setCustomParameters(){}static credentialFromResult(){return {accessToken:'new-token'}}},reauthenticateWithPopup:async()=>({})};
 h.setApi(async()=>{throw new Error('Enable the Google Classroom API')});let after=0;h.connectClassroom('teacher',()=>after++);await tick();
 assert.equal(h.PX.token,null);assert.equal(h.classroomReady('teacher'),false);assert.equal(after,0);assert.match(text(),/Enable the Google Classroom API/);
});
test('AI suggestions stay in review until selected and then persist as vocabulary rows',async()=>{
 const {h,root,body,flatten,text}=make();h.GA.user={uid:'teacher'};h.PX.profile={role:'teacher'};h.caps.standalone=true;
 const act={id:'act',title:'Memory',terms:[],assign:{}};h.setWork({classes:[],activities:[act]});h.setRenderTeacher(()=>{});
 const pane=h.setupPane(act);root.appendChild(pane);
 const find=label=>[...flatten(),...flatten(body)].find(n=>n.textContent===label);
 find('✦ Generate with AI').listeners.click();
 const nodes=[...flatten(body)];for(const [id,value] of [['g-topic','Memory'],['g-grade','11-12'],['g-subject','Psychology'],['g-count','5'],['g-style','student'],['g-notes','']])nodes.find(n=>n.attrs?.id===id).value=value;
 h.setApi(async(path,b)=>{assert.equal(path,'vocabulary/generate');assert.equal(b.topic,'Memory');return {terms:[{term:'Encoding',definition:'Converting information into a form that can be stored.'}]}});
 find('Generate terms').listeners.click();await tick();assert.match(text(),/Pick the terms to add/);assert.equal(act.terms.length,0);
 find('Add to table').listeners.click();assert.equal(act.terms[0].term,'Encoding');assert.ok(Number.isInteger(act.terms[0].id));
});

test('teacher workspace survives visiting an assignment on a device with no local working copy',async()=>{
 const {h,location}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};
 const workspace={version:4,classes:[{id:'class-a'},{id:'class-b'}],activities:[{id:'first'},{id:'second'}]};
 h.setApi(async path=>path==='me'?{profile:{role:'teacher'}}:{workspace,revision:3});
 let restored;h.setTeacher(()=>{restored=h.getData()});h.loadPlatform();await tick();assert.equal(restored.activities.length,2);
 h.setData({version:4,classes:[{id:'class-a'}],activities:[{id:'first'}]});
 location.hash='#teacher';h.route();assert.equal(restored.activities.length,2);assert.equal(restored.classes.length,2);
});
test('Classroom review link uses the submission snapshot after the original activity was removed',async()=>{
 const {h,location}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loaded=true;h.PX.profile={role:'teacher'};
 const snapshot={id:'removed',title:'Original assignment',terms:[]};const p={_postId:'post',_studentUid:'student',activityId:'removed',activitySnapshot:snapshot};
 h.setApi(async path=>path==='submissions'?{submissions:[p]}:path==='workspace'?{workspace:{activities:[]}}:{assignments:[]});
 let reviewed=null;h.setView((a,submission)=>{reviewed={a,submission}});location.hash='#review-post~student';h.route();await tick();
 assert.ok(reviewed);assert.equal(reviewed.a.title,'Original assignment');assert.equal(reviewed.submission._studentUid,'student');
});

test('explicit signup screen offers teacher/student Google account creation',()=>{
 const {h,text,flatten}=make();h.GA.ready=true;h.GA.auth={};h.renderGoogleGate();
 flatten().find(n=>n.textContent==='New here? Create an account').listeners.click();
 assert.match(text(),/Create your Hex Connections account/);assert.match(text(),/Create teacher account with Google/);assert.match(text(),/Create student account with Google/);
 h.GA.sdk={GoogleAuthProvider:class {setCustomParameters(){}},signInWithPopup:()=>Promise.resolve()};
 flatten().find(n=>n.textContent==='Create student account with Google').listeners.click();
 assert.equal(h.PX.signupRequested,true);assert.equal(h.PX.loginRole,'student');
});
test('Google signup creates a student website profile and opens its dashboard',async()=>{
 const {h,text}=make();h.GA.ready=true;h.GA.user={uid:'new-student',displayName:'New student'};h.PX.loginRole='student';h.PX.signupRequested=true;const calls=[];
 h.setApi(async(path,body)=>{calls.push(path);if(path==='me')return {profile:{role:null}};if(path==='register')return {profile:{role:body.role},created:true};if(path==='student/dashboard')return {active:[],submitted:[],needsClassroom:true};throw new Error(path)});
 h.loadPlatform();await tick();assert.equal(h.PX.profile.role,'student');assert.equal(h.PX.loaded,true);assert.equal(calls.filter(p=>p==='register').length,1);assert.match(text(),/Your assignments/);
});
test('signup with an existing Google account preserves its existing website profile',async()=>{
 const {h}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loginRole='student';h.PX.signupRequested=true;
 h.setTeacher(()=>{});const calls=[];
 h.setApi(async(path)=>{calls.push(path);if(path==='me'||path==='register')return {profile:{role:'teacher'},created:false};if(path==='workspace')return {workspace:{version:4,classes:[],activities:[]},revision:1};throw new Error(path)});
 h.loadPlatform();await tick();assert.equal(h.PX.profile.role,'teacher');assert.ok(calls.includes('register'));assert.ok(!calls.includes('profile'));
});

test('teacher login lands on a classroom dashboard rather than the activity editor',async()=>{
 const {h,location,text}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loaded=true;h.PX.profile={role:'teacher'};h.PX.token='token';h.PX.tokenRole='teacher';h.PX.tokenUntil=Date.now()+10000;
 h.setApi(async path=>path==='teacher/dashboard'?{assignments:[{id:'post',courseId:'course',courseName:'Psychology',className:'Period 1',title:'Memory',status:'PUBLISHED',open:true,submissions:2,turnedIn:1}]}:{courses:[{id:'course',name:'Psychology'}]});
 location.hash='#teacher';h.route();await tick();assert.match(text(),/Your classrooms/);assert.match(text(),/Psychology/);assert.match(text(),/View classroom/);assert.doesNotMatch(text(),/Vocabulary/);
 location.hash='#teacher/class-course';h.route();await tick();assert.match(text(),/Classroom assignments/);assert.match(text(),/Memory/);assert.match(text(),/View submissions & groups/);assert.match(text(),/Create assignment for this classroom/);assert.match(text(),/← All classrooms/);
});
test('student dashboard lists active and completed assignments and always offers an add-code box',async()=>{
 const {h,text}=make();h.GA.ready=true;h.GA.user={uid:'student'};h.PX.loaded=true;h.PX.profile={role:'student'};
 h.setApi(async path=>{assert.equal(path,'student/dashboard');return {active:[{id:'a',title:'Memory',className:'Psychology',classroomStatus:'NEW'}],submitted:[{id:'b',title:'Learning',className:'Psychology',classroomStatus:'TURNED_IN'}],needsClassroom:false}});
 h.route();await tick();assert.match(text(),/Active assignments/);assert.match(text(),/Memory/);assert.match(text(),/Submitted and returned/);assert.match(text(),/Add an assignment or group code/);
});
test('a student can join a shared project from the dashboard group-code box',async()=>{
 const {h,text,flatten,location}=make();h.GA.ready=true;h.GA.user={uid:'student'};h.PX.loaded=true;h.PX.profile={role:'student'};h.PX.token='token';h.PX.tokenRole='student';h.PX.tokenUntil=Date.now()+10000;
 let joined=false,opened=null;h.setOpenAssignment(id=>opened=id);
 h.setApi(async(path,body)=>{if(path==='student/dashboard')return {active:[],submitted:[],needsClassroom:false};if(path==='groups/join'){joined=body.code==='ABCDEF123456';return {postId:'post'}}throw new Error(path)});
 h.route();await tick();flatten().find(n=>n.attrs?.['aria-label']==='Assignment or group code').value='ABCD-EF12-3456';flatten().find(n=>n.textContent==='Add code').listeners.click();await tick();assert.equal(joined,true);assert.equal(location.hash,'#a-post');assert.equal(opened,'post');
});
test('shared-board saves use the group endpoint and acknowledge the returned revision',async()=>{
 const {h}=make();h.GA.user={uid:'student'};h.PX.activePost='post';h.setStudentRender(()=>{});
 const group={id:'group',name:'Team',revision:0,members:[],draft:{place:{},conns:{}}};const state=h.adoptGroup(group,'post');
 const board={act:{id:'act'},cls:{id:'class'},d:{name:'Student',place:{1:[0,0]},conns:{}},preview:false};h.setStudent(board);
 h.setApi(async(path,b)=>{assert.equal(path,'posts/post/group/draft');assert.equal(b.revision,0);assert.deepEqual(Object.keys(b.base.place),[]);return {group:{...group,revision:1,draft:b.draft}}});
 h.queueCloudDraft();await h.flushCloudDraft();assert.equal(state.revision,1);assert.equal(board.d._groupUnsaved,false);
});
test('shared-board conflicts keep the student’s local edits and offer a safe reload',async()=>{
 const {h,text}=make();h.GA.user={uid:'student'};h.PX.activePost='post';h.setStudentRender(()=>{});
 h.adoptGroup({id:'group',name:'Team',revision:0,members:[],draft:{place:{},conns:{}}},'post');
 const board={act:{id:'act'},cls:{id:'class'},d:{name:'Student',place:{1:[0,0]},conns:{}},preview:false};h.setStudent(board);
 h.setApi(async()=>{const e=new Error('A teammate changed this tile');e.code='group-conflict';throw e});
 h.queueCloudDraft();await assert.rejects(h.flushCloudDraft());assert.equal(board.d.place[1][0],0);assert.equal(board.d._groupUnsaved,true);assert.match(text(),/Load shared board/);
});

test('teacher assignment page renders submission controls and the create-group action',async()=>{
 const {h,location,text,flatten}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loaded=true;h.PX.profile={role:'teacher'};
 h.setApi(async path=>path==='teacher/dashboard'?{assignments:[{id:'post',title:'Memory',courseName:'Psychology',submissions:1}]}:path.startsWith('submissions')?{submissions:[{name:'Alex',_status:'TURNED_IN',_grade:null}]}:{groups:[]});
 location.hash='#teacher/post-post';h.route();await tick();assert.match(text(),/Psychology · 1 submissions/);assert.match(text(),/Refresh submissions/);assert.match(text(),/Create group/);assert.match(text(),/View board & grade/);
 flatten().find(n=>n.textContent==='Create group').listeners.click();assert.match(text(),/Create a project group/);assert.match(text(),/Create shared board/);
});

test('group turn-in waits for the shared save and sends its acknowledged revision',async()=>{
 const {h}=make();h.GA.user={uid:'student'};h.PX.activePost='post';h.PX.token='token';h.PX.tokenRole='student';h.PX.tokenUntil=Date.now()+10000;h.setReady(()=>true);h.setStudentRender(()=>{});h.setUpdate(()=>{});
 const group={id:'group',name:'Team',revision:1,members:[],draft:{place:{},conns:{}}};h.adoptGroup(group,'post');h.setStudent({act:{id:'act'},cls:{id:'class'},d:{name:'Student',place:{1:[0,0]},conns:{}},preview:false});
 const calls=[];let acknowledge;
 h.setApi(async(path,b)=>{calls.push(path);if(path.endsWith('/group/draft'))return new Promise(resolve=>acknowledge=()=>resolve({group:{...group,revision:2,draft:b.draft}}));assert.equal(b.groupRevision,2);return {submittedAt:'2026-10-30T00:00:00Z'}});
 h.submit();await tick();assert.equal(calls.length,1);assert.match(calls[0],/group\/draft$/);acknowledge();await tick();assert.equal(calls[1],'posts/post/submit');assert.equal(h.PX.submitting,false);
});
