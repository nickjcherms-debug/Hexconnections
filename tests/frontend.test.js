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
 const context={document,location,window:{addEventListener(){},innerWidth:1000},setTimeout(){},clearTimeout(){},console,TextDecoder,Uint8Array,Blob,URL,AbortController,DOMException,sessionStorage:(()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})(),localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
 vm.createContext(context);
 const hooks=`globalThis.hx={GA,PX,AUTH_CONFIG,caps,renderGoogleGate,chooseAccountRole,route,loadPlatform,lsGet,lsSet,googleTeacher,classroomReady,buildDocument,clearAccountView,boardCells,boardOf,onBoardLimit,connectClassroom,setupPane,GROUP,adoptGroup,queueCloudDraft,flushCloudDraft,submit,
 setReady(fn){checkReady=fn},setStudent(s){ST=s},setStudentRender(fn){renderStudentShell=fn},setUpdate(fn){updateStudent=fn},setOpenAssignment(fn){openPlatformAssignment=fn},
 getData(){return DATA},setData(w){DATA=w},setView(fn){viewSubmission=fn},
 setWork(w){TW=w;TS.rows={};TS.sel=w.activities[0].id},setRenderTeacher(fn){renderTeacher=fn},
 setApi(fn){platformApi=fn},setTeacher(fn){startTeacher=fn;teacherDashboard=fn},
 v4:{openPostDialog,studentCard:a=>studentAssignmentCard(a),setPosts(v){PX.posts=v},keyToPath,pathToKey,navItems:()=>navItems(),startPage,renderHome,hexSpaceSidebar,newFolder,deleteFolder,moveActivity,folderById,childFolders,folderActs,canMoveFolder,syncClassroomClasses,importClassroomClasses,sharePreview,copyShared,postManual,codesPane,TS,getTW(){return TW},startTeacher(){startTeacher()},renderTeacher(){renderTeacher()},setSave(fn){saveWorkspaceCloud=fn},setTS(o){Object.assign(TS,o)}}};`;
 vm.runInContext(script.replace(/startPage\(\);\nroute\(\);\nbootGoogle\(\);\n\}\)\(\);\s*$/,hooks+'})();'),context);
 const h=context.hx;
 function flatten(n=root){return [n,...(n.children||[]).flatMap(flatten)]}
 const text=()=>[...flatten(),...flatten(document.body)].map(n=>n.textContent).join(' ');
 return {h,root,location,text,flatten,store,body:document.body};
}
const tick=()=>new Promise(r=>setImmediate(r));
const kids=n=>[n,...(n.children||[]).flatMap(kids)];
const btnWith=(flatten,label)=>flatten().find(n=>n.tagName==='button'&&kids(n).some(c=>c!==n&&c.textContent===label));
test('the login page offers Google and email + password, and remembers no role for returning users',()=>{
 const {h,text,flatten,location}=make();h.GA.ready=true;h.GA.auth={};location.hash='#signin';h.renderGoogleGate();
 assert.equal(h.AUTH_CONFIG.firebase.projectId,'hex-connections-a5214');
 assert.match(text(),/Log in to Hex Connections/);assert.match(text(),/Continue with Google/);assert.match(text(),/or use your email/);assert.match(text(),/Forgot password\?/);
 h.GA.sdk={GoogleAuthProvider:class {setCustomParameters(){}},signInWithPopup:()=>Promise.resolve()};
 h.PX.loginRole='teacher';btnWith(flatten,'Continue with Google').listeners.click();assert.equal(h.PX.loginRole,null);assert.equal(h.PX.signupRequested,false);
});
test('first Google login creates the selected profile and loads its teacher workspace',async()=>{
 const {h,location}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loginRole='teacher';const calls=[];
 h.setApi(async(path,body)=>{calls.push({path,body});if(path==='me')return {profile:{role:null}};if(path==='register')return {profile:{role:body.role},created:true};if(path==='workspace')return {workspace:{version:4,classes:[],activities:[]},revision:0};throw new Error(path)});
 let renders=0;h.setTeacher(()=>renders++);h.loadPlatform();await tick();
 assert.equal(h.PX.profile.role,'teacher');assert.equal(h.PX.loaded,true);assert.equal(location.hash,'#teacher');assert.equal(renders,1);assert.equal(calls.find(c=>c.path==='register').body.role,'teacher');
});
test('student accounts are sent away from every teacher page and never see teacher menu items',async()=>{
 for(const page of ['#teacher','#teacher/editor','#teacher/new','#teacher/shared','#teacher/class-g1','#new']){
  const {h,location,text}=make();h.GA.ready=true;h.GA.user={uid:'student',displayName:'Student'};h.PX.loaded=true;h.PX.profile={role:'student'};location.hash=page;
  h.setApi(async path=>{if(path==='student/dashboard')return {active:[],submitted:[],needsClassroom:false};throw new Error(path)});
  let teacher=0;h.setTeacher(()=>teacher++);h.route();await tick();
  assert.equal(teacher,0,page);assert.equal(h.googleTeacher(),false);assert.equal(location.hash,'',page);
  assert.match(text(),/That page is for teacher accounts/);assert.doesNotMatch(text(),/Hex Space|Shared links|Classes /);
 }
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

test('create-account page requires choosing teacher or student before Google sign-up',()=>{
 const {h,text,flatten,location}=make();h.GA.ready=true;h.GA.auth={};location.hash='#signup';h.renderGoogleGate();
 assert.match(text(),/Create your Hex Connections account/);assert.match(text(),/can’t be changed later/);
 h.GA.sdk={GoogleAuthProvider:class {setCustomParameters(){}},signInWithPopup:()=>Promise.resolve()};
 btnWith(flatten,'Continue with Google').listeners.click();assert.match(text(),/Choose Teacher or Student first/);assert.equal(h.PX.signupRequested,false);
 btnWith(flatten,'Student').listeners.click();btnWith(flatten,'Continue with Google').listeners.click();
 assert.equal(h.PX.signupRequested,true);assert.equal(h.PX.loginRole,'student');
});
test('email sign-up creates the account, saves the chosen type and asks for email confirmation',async()=>{
 const {h,text,flatten,location,store}=make();h.GA.ready=true;h.GA.auth={};location.hash='#signup';
 const made=[];h.GA.sdk={GoogleAuthProvider:class {setCustomParameters(){}},
  createUserWithEmailAndPassword:async(a,e,p)=>{made.push(['create',e,p]);const user={uid:'u9',email:e,emailVerified:false,providerData:[{providerId:'password'}]};h.GA.user=user;return {user}},
  updateProfile:async(u,o)=>{made.push(['name',o.displayName]);u.displayName=o.displayName},sendEmailVerification:async()=>{made.push(['verify'])}};
 h.renderGoogleGate();btnWith(flatten,'Teacher').listeners.click();
 const byId=id=>flatten().find(n=>n.attrs?.id===id);
 byId('lg-name').value='Ms. Rivera';byId('lg-email').value='rivera@school.org';byId('lg-pass').value='longpassword';
 flatten().find(n=>n.tagName==='form').listeners.submit({preventDefault(){}});for(let i=0;i<4;i++)await tick();
 assert.equal(JSON.stringify(made),JSON.stringify([['create','rivera@school.org','longpassword'],['name','Ms. Rivera'],['verify']]));
 assert.equal(JSON.parse(store.get('hx-signup-role')).role,'teacher');assert.equal(h.PX.needsVerify,true);assert.match(text(),/Check your email/);assert.match(text(),/rivera@school\.org/);
});
test('short passwords and missing names are caught before creating an account',()=>{
 const {h,text,flatten,location}=make();h.GA.ready=true;h.GA.auth={};location.hash='#signup';let created=0;
 h.GA.sdk={createUserWithEmailAndPassword:async()=>{created++}};h.renderGoogleGate();btnWith(flatten,'Student').listeners.click();
 const byId=id=>flatten().find(n=>n.attrs?.id===id);
 byId('lg-name').value='Ava';byId('lg-email').value='ava@school.org';byId('lg-pass').value='short';
 flatten().find(n=>n.tagName==='form').listeners.submit({preventDefault(){}});assert.match(text(),/at least 8 characters/);assert.equal(created,0);
});
test('Google signup creates a student website profile and opens its dashboard',async()=>{
 const {h,text}=make();h.GA.ready=true;h.GA.user={uid:'new-student',displayName:'New student'};h.PX.loginRole='student';h.PX.signupRequested=true;const calls=[];
 h.setApi(async(path,body)=>{calls.push(path);if(path==='me')return {profile:{role:null}};if(path==='register')return {profile:{role:body.role},created:true};if(path==='student/dashboard')return {active:[],submitted:[],needsClassroom:true};throw new Error(path)});
 h.loadPlatform();await tick();assert.equal(h.PX.profile.role,'student');assert.equal(h.PX.loaded,true);assert.equal(calls.filter(p=>p==='register').length,1);assert.match(text(),/Your assignments/);
});
test('signup with an existing account keeps its locked account type',async()=>{
 const {h}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loginRole='student';h.PX.signupRequested=true;
 h.setTeacher(()=>{});const calls=[];
 h.setApi(async(path)=>{calls.push(path);if(path==='me'||path==='register')return {profile:{role:'teacher'},created:false};if(path==='workspace')return {workspace:{version:4,classes:[],activities:[]},revision:1};throw new Error(path)});
 h.loadPlatform();await tick();await tick();assert.equal(h.PX.profile.role,'teacher');assert.ok(!calls.includes('register'));assert.ok(!calls.includes('profile'));
});
test('an unverified email account is shown the confirm-your-email step, and a saved sign-up type registers after',async()=>{
 const {h,text,store}=make();h.GA.ready=true;h.GA.user={uid:'u9',email:'r@school.org',providerData:[{providerId:'password'}]};
 h.setApi(async()=>{const e=new Error('Verify');e.code='email-unverified';throw e});h.loadPlatform();await tick();await tick();
 assert.equal(h.PX.needsVerify,true);assert.match(text(),/Check your email/);assert.match(text(),/I’ve confirmed my email/);
 store.set('hx-signup-role',JSON.stringify({uid:'u9',email:'r@school.org',role:'student'}));const calls=[];
 h.setApi(async(path,body)=>{calls.push([path,body&&body.role]);if(path==='me')return {profile:{role:null}};if(path==='register')return {profile:{role:'student'},created:true};return {active:[],submitted:[]}});
 h.PX.needsVerify=false;h.PX.loading=false;h.loadPlatform();for(let i=0;i<4;i++)await tick();
 assert.equal(JSON.stringify(calls.slice(0,2)),JSON.stringify([['me',null],['register','student']]));assert.equal(h.PX.profile.role,'student');
});

test('teacher login lands on a classroom dashboard rather than the activity editor',async()=>{
 const {h,location,text}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loaded=true;h.PX.profile={role:'teacher'};h.PX.token='token';h.PX.tokenRole='teacher';h.PX.tokenUntil=Date.now()+10000;h.PX.teacherData={version:4,classes:[{id:'gc-course',name:'Psychology',classroomId:'course'}],activities:[]};
 h.setApi(async path=>path==='teacher/dashboard'?{assignments:[{id:'post',courseId:'course',courseName:'Psychology',className:'Period 1',title:'Memory',status:'PUBLISHED',open:true,submissions:2,turnedIn:1}]}:{courses:[{id:'course',name:'Psychology'}]});
 location.hash='#teacher';h.route();await tick();assert.match(text(),/Your classes/);assert.match(text(),/Psychology/);assert.match(text(),/Open class/);assert.doesNotMatch(text(),/Vocabulary/);
 location.hash='#teacher/class-course';h.route();await tick();assert.match(text(),/Class assignments/);assert.match(text(),/Memory/);assert.match(text(),/View submissions & groups/);assert.match(text(),/New Hex Space for this class/);assert.match(text(),/← All classes/);
});
test('student dashboard lists active and completed assignments and always offers an add-code box',async()=>{
 const {h,text}=make();h.GA.ready=true;h.GA.user={uid:'student'};h.PX.loaded=true;h.PX.profile={role:'student'};
 h.setApi(async path=>{assert.equal(path,'student/dashboard');return {active:[{id:'a',title:'Memory',className:'Psychology',classroomStatus:'NEW'}],submitted:[{id:'b',title:'Learning',className:'Psychology',classroomStatus:'TURNED_IN'}],needsClassroom:false}});
 h.route();await tick();assert.match(text(),/Active assignments/);assert.match(text(),/Memory/);assert.match(text(),/Submitted and returned/);assert.match(text(),/Enter a class code/);
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

// ---------------- 4.0: homepage, code entry, folders, classes and sharing ----------------
test('signed-out visitors land on a homepage that explains hexagonal thinking and Depth and Complexity',()=>{
 const {h,text}=make();h.GA.ready=true;h.GA.auth={};h.route();
 const t=text();
 assert.match(t,/What is hexagonal thinking\?/);assert.match(t,/Depth and Complexity icons/);
 for(const name of ['Language of the Discipline','Details','Patterns','Rules','Trends','Unanswered Questions','Ethics','Big Idea','Multiple Perspectives','Change Over Time','Across Disciplines'])assert.ok(t.includes(name),name);
 assert.match(t,/Sandra Kaplan/);assert.match(t,/Enter a class code/);assert.match(t,/New Hex Space/);
 assert.doesNotMatch(t,/Save file \(CSV\)|Open saved file|Upload student files/);
});
test('the class-code page remembers the code through Google sign-in as a student',()=>{
 const {h,flatten,location}=make();h.GA.ready=true;let popups=0;
 h.GA.auth={};h.GA.sdk={GoogleAuthProvider:class {setCustomParameters(){}},signInWithPopup:()=>{popups++;return Promise.resolve()}};
 location.hash='#code';h.route();
 const input=flatten().find(n=>n.attrs?.id==='hx-code');input.value='abc-234';
 flatten().find(n=>n.textContent==='Continue with Google').listeners.click();
 assert.equal(popups,1);assert.equal(h.PX.loginRole,'student');
 h.GA.user={uid:'kid'};h.PX.loaded=true;h.PX.profile={role:'student'};h.setApi(async()=>({active:[],submitted:[],needsClassroom:true}));
 h.route();assert.equal(location.hash,'#c-ABC234');
});
test('teacher-only New Hex Space appears for teachers but not in a student’s menu',()=>{
 const t1=make();t1.h.GA.ready=true;t1.h.GA.user={uid:'s'};t1.h.PX.loaded=true;t1.h.PX.profile={role:'student'};t1.location.hash='#home';t1.h.route();
 assert.doesNotMatch(t1.text(),/New Hex Space/);assert.match(t1.text(),/Enter a class code/);
 const t2=make();t2.h.GA.ready=true;t2.h.GA.user={uid:'t'};t2.h.PX.loaded=true;t2.h.PX.profile={role:'teacher'};t2.location.hash='#home';t2.h.route();
 assert.match(t2.text(),/\+ New Hex Space/);
});
function teacherWork(h){
 h.GA.user={uid:'t'};h.PX.profile={role:'teacher'};h.PX.loaded=true;
 h.setWork({version:4,folders:[{id:'bio',name:'Biology',parent:null},{id:'u3',name:'Unit 3',parent:'bio'}],classes:[{id:'club',name:'Science club'}],activities:[{id:'a1',title:'Cells',folder:'u3',terms:[{n:1,id:1,term:'Nucleus'}],assign:{}},{id:'a2',title:'Loose',terms:[],assign:{}}]});
 h.setRenderTeacher(()=>{});
}
test('folders nest, move Hex Spaces and never delete Hex Spaces when removed',()=>{
 const {h,text,flatten:f0,body}=make();const flatten=()=>[...f0(),...f0(body)];teacherWork(h);const v=h.v4,TW=v.getTW();
 assert.equal(v.childFolders(null).map(f=>f.name).join(),'Biology');assert.equal(v.folderActs('u3').map(a=>a.id).join(),'a1');
 assert.equal(v.canMoveFolder('bio','u3'),false);assert.equal(v.canMoveFolder('u3',null),true);
 v.moveActivity(TW.activities[1],'bio');assert.equal(TW.activities[1].folder,'bio');
 v.newFolder('u3');flatten().find(n=>n.attrs?.id==='hx-prompt').value='Labs';flatten().find(n=>n.textContent==='Create folder').listeners.click();
 const labs=TW.folders.find(f=>f.name==='Labs');assert.equal(labs.parent,'u3');
 v.deleteFolder(v.folderById('u3'));assert.match(text(),/move to “Biology”/);flatten().find(n=>n.textContent==='Delete folder').listeners.click();
 assert.equal(v.folderById('u3'),null);assert.equal(TW.activities.find(a=>a.id==='a1').folder,'bio');assert.equal(labs.parent,'bio');assert.equal(TW.activities.length,2);
 const side=v.hexSpaceSidebar();const all=[];(function walk(n){all.push(n);(n.children||[]).forEach(walk)})(side);
 assert.ok(all.some(n=>n.textContent==='+ Folder'));assert.ok(all.some(n=>n.textContent==='Import from Classroom'));
});
test('imported Google Classroom courses join the class list once, beside teacher-made classes',()=>{
 const {h}=make();teacherWork(h);const v=h.v4,TW=v.getTW();
 assert.equal(v.syncClassroomClasses([{id:'g1',name:'Biology',section:'P2'},{id:'g2',name:'Chemistry'}]),2);
 assert.equal(v.syncClassroomClasses([{id:'g1',name:'Biology',section:'P2'}]),0);
 assert.equal(JSON.stringify(TW.classes.map(c=>[c.name,c.classroomId||null])),JSON.stringify([['Science club',null],['Biology · P2','g1'],['Chemistry','g2']]));
});
test('code-only classes are posted without Google Classroom and show the class code',async()=>{
 const {h,text}=make();teacherWork(h);const v=h.v4,TW=v.getTW();TW.activities[0].assign={club:{code:'CLUB23',open:true,due:''}};
 const calls=[];v.setSave(async()=>{calls.push('save');return {revision:2}});
 h.setApi(async(path,body,withClassroom)=>{calls.push(path);assert.equal(withClassroom,undefined);assert.equal(JSON.stringify(body),JSON.stringify({activityId:'a1',classId:'club'}));return {id:'post',code:'CLUB23',updated:false}});
 v.postManual(TW.activities[0],TW.classes[0]);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,['save','manual/publish']);assert.match(text(),/Posted for Science club/);assert.match(text(),/CLU-B23/);
});
test('a shared Hex Space previews for teachers and copies into a chosen folder',async()=>{
 const {h,text,flatten,location}=make();teacherWork(h);const v=h.v4,TW=v.getTW();let saved=0;v.setSave(async()=>{saved++;return {revision:3}});
 const template={title:'Water cycle',instructions:'',minTerms:null,minWords:3,dcOn:true,dc:['patterns'],board:{shape:'wide',size:'roomy',orient:'pointy',rotate:true},terms:[{n:1,id:4,term:'Evaporation',def:'Liquid to gas'},{n:2,id:9,term:'Rain',def:'Falling water'}]};
 h.setApi(async(path)=>{if(path==='shares/ABCDEFGHJK')return {share:{code:'ABCDEFGHJK',sharedBy:'Ms. Lee',mine:false},activity:template};if(path==='shares/ABCDEFGHJK/copy')return {activity:template,sharedBy:'Ms. Lee',code:'ABCDEFGHJK'};throw new Error(path)});
 v.sharePreview('ABCDEFGHJK');await new Promise(r=>setImmediate(r));
 assert.match(text(),/Water cycle/);assert.match(text(),/Shared by Ms\. Lee/);assert.match(text(),/Evaporation/);assert.match(text(),/Copy to my Hex Space/);
 await v.copyShared('ABCDEFGHJK','bio');await new Promise(r=>setImmediate(r));
 const copy=TW.activities.find(a=>a.title==='Water cycle');assert.ok(copy);assert.equal(copy.folder,'bio');assert.equal(JSON.stringify(copy.assign),'{}');assert.equal(copy.terms.map(t=>t.id).join(),'4,9');assert.equal(copy.idSeq,9);
 assert.equal(saved,1);assert.equal(location.hash,'#teacher/edit-'+copy.id);
});
test('students see a teacher-profile message instead of a shared Hex Space',()=>{
 const {h,text,location}=make();h.GA.ready=true;h.GA.user={uid:'s'};h.PX.loaded=true;h.PX.profile={role:'student'};location.hash='#share-ABCDEFGHJK';h.route();
 assert.match(text(),/Teacher account needed/);assert.doesNotMatch(text(),/Copy to my Hex Space/);
});

test('imported Classroom classes stay in the Your classes list without reconnecting Classroom',async()=>{
 const {h,text,location}=make();h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loaded=true;h.PX.profile={role:'teacher'};
 h.PX.teacherData={version:4,folders:[],classes:[{id:'gc-g1',name:'Biology · P2',classroomId:'g1'},{id:'club',name:'Science club'}],activities:[]};
 const calls=[];h.setApi(async path=>{calls.push(path);if(path==='teacher/dashboard')return {assignments:[]};throw new Error(path)});
 location.hash='#teacher';h.route();await tick();
 assert.ok(!calls.some(p=>p.startsWith('classroom/')));
 assert.match(text(),/Biology · P2/);assert.match(text(),/Science club/);assert.match(text(),/Google Classroom/);assert.match(text(),/Code only/);assert.match(text(),/Connect Google Classroom and import classes/);
 location.hash='#teacher/class-g1';h.route();await tick();assert.match(text(),/Biology · P2/);assert.match(text(),/New Hex Space for this class/);
});
function teacherAt(make,data){
 const t=make();const {h}=t;h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loaded=true;h.PX.profile={role:'teacher'};h.PX.revision=4;
 h.PX.token='token';h.PX.tokenRole='teacher';h.PX.tokenUntil=Date.now()+10000;h.PX.teacherData=data;return t;
}
const settle=async()=>{for(let i=0;i<8;i++)await tick()};
const boxFor=(t,id)=>[...t.flatten(),...t.flatten(t.body)].find(n=>n.attrs?.id===id);
const clickText=(t,label)=>[...t.flatten(),...t.flatten(t.body)].find(n=>n.textContent===label).listeners.click({});
test('teachers choose which Google Classroom classes to import; nothing is imported automatically',async()=>{
 const t=teacherAt(make,{version:4,folders:[],classes:[{id:'club',name:'Science club'}],activities:[]});const {h,text,location}=t;
 const saves=[];h.setApi(async(path,body)=>{
  if(path==='classroom/courses?role=teacher')return {courses:[{id:'g1',name:'Biology',section:'P2',link:'https://classroom.google.com/c/g1'},{id:'g2',name:'Chemistry',link:'https://classroom.google.com/c/g2'},{id:'g3',name:'Physics',link:'https://evil.example/x'}]};
  if(path==='teacher/dashboard')return {assignments:[]};
  if(path==='workspace'&&body){saves.push(body);return {revision:body.revision+1}}
  throw new Error(path)});
 location.hash='#teacher';h.route();await settle();
 assert.equal(saves.length,0);assert.doesNotMatch(text(),/Chemistry/);
 h.v4.importClassroomClasses();await settle();
 assert.match(text(),/Choose classes to import/);assert.match(text(),/Biology · P2/);assert.match(text(),/Physics/);
 boxFor(t,'imp-g2').checked=true;clickText(t,'Import selected');await settle();
 assert.equal(saves.length,1);assert.equal(saves[0].revision,4);
 assert.equal(JSON.stringify(saves[0].workspace.classes.map(c=>[c.name,c.classroomId||null])),JSON.stringify([['Science club',null],['Chemistry','g2']]));
 assert.equal(saves[0].workspace.classes[1].classroomUrl,'https://classroom.google.com/c/g2');
 assert.ok(t.flatten().some(n=>n.attrs?.href==='https://classroom.google.com/c/g2'&&n.textContent==='Open in Google Classroom ↗'));
 assert.match(text(),/1 class imported/);assert.match(text(),/Chemistry/);assert.doesNotMatch(text(),/Physics/);
});
test('resync updates renamed Classroom classes and offers to remove ones no longer in Classroom',async()=>{
 const t=teacherAt(make,{version:4,folders:[],classes:[{id:'gc-g1',name:'Biology',classroomId:'g1'},{id:'gc-g9',name:'Old elective',classroomId:'g9'}],activities:[{id:'a1',title:'Cells',terms:[],assign:{'gc-g9':{code:'ABC234',open:true,due:''}}}]});const {h,text}=t;
 const saves=[];h.setApi(async(path,body)=>{
  if(path==='classroom/courses?role=teacher')return {courses:[{id:'g1',name:'Biology',section:'Period 3'}]};
  if(path==='teacher/dashboard')return {assignments:[]};
  if(path==='workspace'&&body){saves.push(body);return {revision:5}}
  throw new Error(path)});
 h.v4.importClassroomClasses();await settle();
 assert.match(text(),/Import or resync classes/);assert.match(text(),/Biology → Biology · Period 3/);assert.match(text(),/No longer active in Google Classroom/);
 boxFor(t,'drop-gc-g9').checked=true;clickText(t,'Save changes');await settle();
 const ws=saves[0].workspace;assert.equal(JSON.stringify(ws.classes.map(c=>c.name)),JSON.stringify(['Biology · Period 3']));
 assert.equal(JSON.stringify(ws.activities[0].assign),'{}');assert.match(text(),/1 renamed, 1 removed/);
});
test('teachers can remove imported and code-only classes; a code-only class code stops working',async()=>{
 const t=teacherAt(make,{version:4,folders:[],classes:[{id:'gc-g1',name:'Biology',classroomId:'g1'},{id:'club',name:'Science club'}],activities:[{id:'a1',title:'Cells',terms:[],assign:{club:{code:'CLUB23',open:true,due:''},'gc-g1':{code:'ABC234',open:true,due:''}}}]});const {h,text,location}=t;
 const calls=[];h.setApi(async(path,body)=>{calls.push(path);
  if(path==='teacher/dashboard')return {assignments:[]};
  if(path==='classroom/courses?role=teacher')return {courses:[]};
  if(path==='manual/close-class')return {closed:1};
  if(path==='workspace'&&body)return {revision:5};
  throw new Error(path)});
 location.hash='#teacher';h.route();await settle();
 const removeBtn=t.flatten().find(n=>n.attrs?.['aria-label']==='Remove class Science club');assert.ok(removeBtn);removeBtn.listeners.click();
 assert.match(text(),/Remove Science club\?/);assert.match(text(),/class code stops working/);
 t.flatten(t.body).find(n=>n.textContent==='Remove class').listeners.click({target:{}});await settle();
 assert.ok(calls.includes('manual/close-class'));assert.equal(JSON.stringify(h.PX.teacherData.classes.map(c=>c.id)),JSON.stringify(['gc-g1']));
 assert.equal(Object.keys(h.PX.teacherData.activities[0].assign).join(),'gc-g1');
 t.flatten().find(n=>n.attrs?.['aria-label']==='Remove class Biology').listeners.click();assert.match(text(),/Nothing is deleted in Google Classroom/);
 t.flatten(t.body).find(n=>n.textContent==='Remove class').listeners.click({target:{}});await settle();
 assert.equal(h.PX.teacherData.classes.length,0);assert.equal(calls.filter(p=>p==='manual/close-class').length,1);
});
test('the bare site address opens the homepage, and the menu offers Log in',()=>{
 const {h,text,location,flatten}=make();h.GA.ready=true;location.hash='';h.v4.startPage();assert.equal(location.hash,'#home');h.route();
 assert.match(text(),/The benefits of hexagonal thinking/);assert.match(text(),/Ways to use it in class/);assert.match(text(),/A shared language for thinking/);assert.match(text(),/Patterns/);
 const login=flatten().filter(n=>n.textContent==='Log in');assert.ok(login.some(n=>n.attrs?.href==='#signin'));
 location.hash='#teacher';h.v4.startPage();assert.equal(location.hash,'#teacher');
});

test('logged-out visits to private pages show the homepage and resume after login',()=>{
 const {h,text,location}=make();h.GA.ready=true;h.GA.user=null;location.hash='#teacher/editor';h.route();
 assert.equal(location.hash,'#home');assert.match(text(),/Log in to open that page/);assert.match(text(),/The benefits of hexagonal thinking/);
 location.hash='#code';h.route();assert.match(text(),/Enter your class code/);
});
test('menus share one layout: Home first, then role-specific tabs',()=>{
 const labels=(h)=>h.v4.navItems().map(i=>i.label).join('|');
 let {h}=make();h.GA.ready=true;assert.equal(labels(h),'Home|How it works|Depth & Complexity|Enter a class code|Log in|New Hex Space');
 ({h}=make());h.GA.user={uid:'t'};h.PX.profile={role:'teacher'};assert.equal(labels(h),'Home|Classes|Hex Space|Shared links|+ New Hex Space');
 ({h}=make());h.GA.user={uid:'s'};h.PX.profile={role:'student'};assert.equal(labels(h),'Home|My assignments|Enter a class code');
});
test('clean page addresses map both ways and old # links still resolve',()=>{
 const {h}=make();const v=h.v4;
 const pairs=[['#home','/'],['#signin','/login'],['#signup','/signup'],['#code','/code'],['#c-ABC234','/code/ABC234'],['#share-K7MQ2PXRT4','/share/K7MQ2PXRT4'],['#teacher','/teacher/classes'],['#teacher/class-g1','/teacher/classes/g1'],['#teacher/post-p1','/teacher/assignments/p1'],['#teacher/editor','/teacher/hex-space'],['#teacher/edit-a1','/teacher/hex-space/a1'],['#teacher/new','/teacher/hex-space/new'],['#teacher/shared','/teacher/shared'],['','/student/assignments'],['#a-p1','/student/assignments/p1'],['#review-p1~u%201','/teacher/review/p1/u%201']];
 for(const [key,path] of pairs){assert.equal(v.keyToPath(key),path,key);assert.equal(v.pathToKey(path),key,path)}
 assert.equal(v.pathToKey('/teacher'),'#teacher');assert.equal(v.pathToKey('/nope/x'),'#home');assert.equal(v.keyToPath('#how'),null);
 assert.equal(v.pathToKey('/teacher/classes/manual%3Aclub'),'#teacher/class-manual%3Aclub');
});

test('saving online refreshes the browser copy so imported classes survive reopening the editor',async()=>{
 const t=teacherAt(make,{version:4,folders:[],classes:[],activities:[{id:'a1',title:'Cells',terms:[{n:1,id:1,term:'Nucleus',def:''}],assign:{}}]});const {h,store}=t;
 h.v4.setSave;let saved=null;
 h.setApi(async(path,body)=>{if(path==='classroom/courses?role=teacher')return {courses:[{id:'g1',name:'Biology',link:'https://classroom.google.com/c/g1'}]};if(path==='teacher/dashboard')return {assignments:[]};if(path==='workspace'&&body){saved=body.workspace;return {revision:body.revision+1}}if(path==='submissions')return {submissions:[]};if(path==='shares')return {shares:[]};throw new Error(path)});
 const key=[...store.keys()].find(k=>k.includes('hx-teacher-work'));
 h.v4.importClassroomClasses();await settle();boxFor(t,'imp-g1').checked=true;clickText(t,'Import selected');await settle();
 assert.equal(saved.classes.length,1);
 const local=[...store.entries()].find(([k])=>k.includes('hx-teacher-work'));assert.ok(local,'browser copy written');assert.equal(JSON.parse(local[1]).classes[0].classroomId,'g1');
});

const dayOff=n=>{const d=new Date(Date.now()+n*86400000);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
test('posting asks for start and due dates and the same Hex Space can be posted to a class again',async()=>{
 const t=make();const {h,text}=t;teacherWork(h);const v=h.v4,TW=v.getTW();
 const sent=[];let saves=0;v.setSave(async()=>{saves++;return {revision:2}});
 let posts=[];h.setApi(async(path,body)=>{
  if(path==='posts/new'){sent.push(body);const p={id:'p'+sent.length,activityId:body.activityId,classId:body.classId,className:'Science club',title:body.title,code:'ABC23'+sent.length,manual:true,start:body.start,due:body.due,startAt:'',dueAt:'',open:true,status:'PUBLISHED',submissions:0,turnedIn:0};posts.push(p);return {...p,url:'x'}}
  if(path==='teacher/dashboard')return {assignments:posts};throw new Error(path)});
 v.setPosts([]);
 const pane=v.codesPane(TW.activities[0]);const all=n=>[n,...(n.children||[]).flatMap(all)];
 all(pane).find(n=>n.textContent==='Post to a class').listeners.click();
 assert.match(text(),/Start date/);assert.match(text(),/Due date \(optional\)/);assert.match(text(),/time zone/);
 const byId=id=>[...t.flatten(t.body)].find(n=>n.attrs?.id===id);
 assert.equal(byId('pd-start').value,dayOff(0));
 byId('pd-due').value=dayOff(7);t.flatten(t.body).find(n=>n.textContent==='Post').listeners.click();await settle();
 assert.equal(sent.length,1);assert.equal(saves,1);assert.equal(sent[0].classId,'club');assert.equal(sent[0].start,dayOff(0));assert.equal(sent[0].due,dayOff(7));assert.ok(sent[0].tz);
 assert.match(text(),/ABC-231/);
 v.openPostDialog(TW.activities[0]);byId('pd-name').value='Cells — round 2';byId('pd-start').value=dayOff(10);byId('pd-due').value=dayOff(3);
 t.flatten(t.body).filter(n=>n.textContent==='Post').at(-1).listeners.click();await settle();
 assert.match(text(),/on or after the start date/);assert.equal(sent.length,1);
 byId('pd-due').value=dayOff(14);t.flatten(t.body).filter(n=>n.textContent==='Post').at(-1).listeners.click();await settle();
 assert.equal(sent.length,2);assert.equal(sent[1].classId,'club');assert.equal(sent[1].title,'Cells — round 2');
 const pane2=v.codesPane(TW.activities[0]);const words=all(pane2).map(n=>n.textContent).join(' ');
 assert.match(words,/Cells — round 2/);assert.match(words,/ABC-232/);assert.match(words,/Edit dates & details/);
});
test('students see a scheduled assignment as "Opens …" instead of an open button',()=>{
 const {h}=make();const all=n=>[n,...(n.children||[]).flatMap(all)];
 const future=new Date(Date.now()+3*86400000).toISOString();
 const card=h.v4.studentCard({id:'p1',title:'Cells',className:'Science club',start:dayOff(3),startAt:future,due:dayOff(9),dueAt:''});
 const words=all(card).map(n=>n.textContent).join(' ');assert.match(words,/Opens /);assert.doesNotMatch(words,/Open assignment/);
 const open=h.v4.studentCard({id:'p2',title:'Cells',className:'Science club',start:dayOff(-1),startAt:new Date(Date.now()-86400000).toISOString(),due:dayOff(9)});
 assert.match(all(open).map(n=>n.textContent).join(' '),/Open assignment/);
});
