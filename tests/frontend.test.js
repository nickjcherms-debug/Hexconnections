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
 const document={getElementById:id=>nodes[id]||search(root,id)||search(document.body,id)||null,createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),createTextNode:t=>({textContent:t}),addEventListener(){},removeEventListener(){},body:new Element('body'),querySelector(){return null}};
 const location={hash:'',protocol:'https:',hostname:'hexconnections.com',origin:'https://hexconnections.com',pathname:'/'};
 let hash='';Object.defineProperty(location,'hash',{get(){return hash},set(value){hash=value?(value.startsWith('#')?value:'#'+value):''}});
 const context={document,location,window:{addEventListener(){},innerWidth:1000},setTimeout(){},clearTimeout(){},console,TextDecoder,Uint8Array,Blob,URL,AbortController,DOMException,sessionStorage:(()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})(),localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
 vm.createContext(context);
 const hooks=`globalThis.hx={GA,PX,AUTH_CONFIG,caps,renderGoogleGate,chooseAccountRole,route,loadPlatform,lsGet,lsSet,googleTeacher,classroomReady,buildDocument,clearAccountView,boardCells,boardOf,onBoardLimit,connectClassroom,setupPane,GROUP,adoptGroup,queueCloudDraft,flushCloudDraft,submit,
 setReady(fn){checkReady=fn},setStudent(s){ST=s},setStudentRender(fn){renderStudentShell=fn},setUpdate(fn){updateStudent=fn},setOpenAssignment(fn){openPlatformAssignment=fn},
 getData(){return DATA},setData(w){DATA=w},setView(fn){viewSubmission=fn},
 setWork(w){TW=w;TS.rows={};TS.sel=w.activities[0].id},setRenderTeacher(fn){renderTeacher=fn},
 setApi(fn){platformApi=fn},setTeacher(fn){startTeacher=fn;teacherDashboard=fn},
 v414:{graderBoard,rosterPanel,termPictureButton,hexList},
 v415:{gameScore,renderGames,renderGameConsole,renderPlay,drawHud,GS,GAME_CACHE,graderExtras,keyToPath,pathToKey,GUIDE,saveDraft,setST(v){ST=v},getST(){return ST}},
 v413:{duplicateHexSpace,firstSteps},
 v412:{leastConnected,reteachCallout,openGalleryDialog},
 v410:{flowGroups,flowState,setChecker(fn){checkReady=fn},getChecker(){return checkReady}},
 v49:{mergeInto,reconcileLocal,renderDirectory,blockPaste,graderExtras:(p)=>graderExtras(p,[],0),SYNC,dirFolderId},
 v48:{assignMenu,assignNudge:a=>assignNudgeBody(a),assignTo},
 v47:{supportsEditor,versionsEditor,printTileHTML,replayStates,startersFor,recordHistory,graderExtras,drawGallery,studentTools,writingHelps,hexMap,TR,CFG,renderLogin:()=>renderLogin(),getST(){return ST}},
 v4:{openGrader,insightsData,exportGrades,setDownload(fn){downloadBlob=fn},setPostState(v){PX.postState=v},accountItems:(r)=>accountItems(r,false),folderPicker:a=>folderPicker(a),deleteHexSpace:a=>deleteHexSpace(a),publishNow:()=>publishNow(),setTeacherData(v){PX.teacherData=v},openPostDialog,studentCard:a=>studentAssignmentCard(a),setPosts(v){PX.posts=v},keyToPath,pathToKey,navItems:()=>navItems(),startPage,renderHome,hexSpaceSidebar,newFolder,deleteFolder,moveActivity,folderById,childFolders,folderActs,canMoveFolder,syncClassroomClasses,importClassroomClasses,sharePreview,copyShared,postManual,codesPane,TS,getTW(){return TW},startTeacher(){startTeacher()},renderTeacher(){renderTeacher()},setSave(fn){saveWorkspaceCloud=fn},setTS(o){Object.assign(TS,o)}}};`;
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
 location.hash='#teacher/class-course';h.route();await tick();assert.match(text(),/Postings \(1\)/);assert.match(text(),/Memory/);assert.match(text(),/View submissions & groups/);assert.match(text(),/New Hex Space for this class/);assert.match(text(),/← All classes/);
});
test('student dashboard lists active and completed assignments and always offers an add-code box',async()=>{
 const {h,text}=make();h.GA.ready=true;h.GA.user={uid:'student'};h.PX.loaded=true;h.PX.profile={role:'student'};
 h.setApi(async path=>{assert.equal(path,'student/dashboard');return {active:[{id:'a',title:'Memory',className:'Psychology',classroomStatus:'NEW'}],submitted:[{id:'b',title:'Learning',className:'Psychology',classroomStatus:'TURNED_IN'}],needsClassroom:false}});
 h.route();await tick();assert.match(text(),/To do \(1\)/);assert.match(text(),/Memory/);assert.match(text(),/Turned in and returned \(1\)/);assert.match(text(),/Not started/);assert.match(text(),/Enter a class code/);
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
 location.hash='#teacher/post-post';h.route();await tick();assert.match(text(),/Psychology · No due date · 1 submission/);assert.match(text(),/Refresh/);assert.match(text(),/← Psychology/);assert.match(text(),/Create group/);assert.match(text(),/Grade next ungraded \(1\)/);assert.match(text(),/Needs grading/);
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
 let {h}=make();h.GA.ready=true;assert.equal(labels(h),'Home|Depth & Complexity|How to use|Enter a class code|Log in|New Hex Space');
 ({h}=make());h.GA.user={uid:'t'};h.PX.profile={role:'teacher'};assert.equal(labels(h),'Home|Classes|Hex Spaces|Shared links|Library|Games|How to use|+ New Hex Space');
 ({h}=make());h.GA.user={uid:'s'};h.PX.profile={role:'student'};assert.equal(labels(h),'Home|My assignments|Games|How to use|Enter a class code');
});
test('clean page addresses map both ways and old # links still resolve',()=>{
 const {h}=make();const v=h.v4;
 const pairs=[['#guide','/guide'],['#guide-gallery','/guide/gallery'],['#teacher/library','/teacher/library'],['#owner','/owner'],['#gallery-p1','/gallery/p1'],['#home','/'],['#signin','/login'],['#signup','/signup'],['#code','/code'],['#c-ABC234','/code/ABC234'],['#share-K7MQ2PXRT4','/share/K7MQ2PXRT4'],['#teacher','/teacher/classes'],['#teacher/class-g1','/teacher/classes/g1'],['#teacher/post-p1','/teacher/assignments/p1'],['#teacher/editor','/teacher/hex-space'],['#teacher/edit-a1','/teacher/hex-space/a1'],['#teacher/new','/teacher/hex-space/new'],['#teacher/shared','/teacher/shared'],['','/student/assignments'],['#a-p1','/student/assignments/p1'],['#review-p1~u%201','/teacher/review/p1/u%201']];
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
 const words=all(card).map(n=>n.textContent).join(' ');assert.match(words,/Opens /);assert.doesNotMatch(words,/ Open$/);assert.doesNotMatch(words,/Not started/);
 const open=h.v4.studentCard({id:'p2',title:'Cells',className:'Science club',start:dayOff(-1),startAt:new Date(Date.now()-86400000).toISOString(),due:dayOff(9)});
 assert.match(all(open).map(n=>n.textContent).join(' '),/Not started Open/);
});

function teacher2(h){
 h.GA.user={uid:'t'};h.PX.profile={role:'teacher'};h.PX.loaded=true;
 h.setWork({version:4,folders:[{id:'bio',name:'Biology',parent:null}],classes:[{id:'club',name:'Science club'},{id:'gc-1',name:'Period 2',classroomId:'111'},{id:'p4',name:'Period 4'}],activities:[{id:'a1',title:'Cells',folder:'bio',terms:[{n:1,id:1,term:'Nucleus'}],assign:{}},{id:'a2',title:'Atoms',terms:[{n:1,id:1,term:'Proton'}],assign:{}}]});
 h.setRenderTeacher(()=>{});
}
const everything=t=>[...t.flatten(),...t.flatten(t.body)];
test('one Post dialog posts to several classes at once, each with its own code',async()=>{
 const t=make();const {h,text}=t;teacher2(h);const v=h.v4;v.setSave(async()=>({revision:2}));v.setPosts([]);
 const sent=[];h.setApi(async(path,body,withClassroom)=>{if(path==='posts/new'){sent.push([body.classId,withClassroom]);return {id:'p'+sent.length,code:'ABC2'+sent.length+'X',title:body.title,start:body.start,due:body.due}}if(path==='teacher/dashboard')return {assignments:[]};throw new Error(path)});
 v.openPostDialog(v.getTW().activities[0]);
 const byId=id=>everything(t).find(n=>n.attrs?.id===id);
 byId('pd-c-club').checked=true;byId('pd-c-p4').checked=true;byId('pd-c-club').listeners.change();
 assert.ok(everything(t).some(n=>n.textContent==='Post to 2 classes'));
 everything(t).find(n=>n.textContent==='Post to 2 classes').listeners.click();await settle();
 assert.equal(JSON.stringify(sent),JSON.stringify([['club',false],['p4',false]]));
 assert.match(text(),/Science club/);assert.match(text(),/Period 4/);assert.match(text(),/ABC-21X/);assert.match(text(),/ABC-22X/);
});
test('a class page can post any Hex Space to that class, as many times as needed',async()=>{
 const t=make();const {h,text}=t;teacher2(h);const v=h.v4;v.setSave(async()=>({revision:2}));
 const sent=[];h.setApi(async(path,body)=>{if(path==='posts/new'){sent.push(body);return {id:'p'+sent.length,code:'XYZ23'+sent.length,title:body.title}}if(path==='teacher/dashboard')return {assignments:[]};throw new Error(path)});
 v.openPostDialog(null,null,{pickActivity:true,classIds:['p4']});
 const byId=id=>everything(t).find(n=>n.attrs?.id===id);
 assert.ok(byId('pd-act'));assert.equal(byId('pd-c-p4').checked,true);assert.ok(!byId('pd-c-club').checked);
 byId('pd-act').value='a2';byId('pd-act').listeners.change();assert.equal(byId('pd-name').value,'Atoms');
 everything(t).find(n=>n.textContent==='Post').listeners.click();await settle();
 v.openPostDialog(null,null,{pickActivity:true,classIds:['p4']});byId('pd-act').value='a2';byId('pd-act').listeners.change();byId('pd-name').value='Atoms — round 2';
 everything(t).filter(n=>n.textContent==='Post').at(-1).listeners.click();await settle();
 assert.equal(JSON.stringify(sent.map(b=>[b.activityId,b.classId,b.title])),JSON.stringify([['a2','p4','Atoms'],['a2','p4','Atoms — round 2']]));
});
test('the folder drop-down can create a folder inside another and move the Hex Space into it',()=>{
 const t=make();const {h}=t;teacher2(h);const v=h.v4,TW=v.getTW();const a=TW.activities[1];
 const picker=v.folderPicker(a);const sel=[picker,...picker.children].find(n=>n.attrs?.id==='f-folder');
 assert.ok(sel.children.some(n=>n.textContent==='+ New folder…'));
 sel.value='__new';sel.listeners.change();
 const byId=id=>everything(t).find(n=>n.attrs?.id===id);
 byId('nf-name').value='Unit 2';byId('nf-parent').value='bio';everything(t).find(n=>n.textContent==='Create folder').listeners.click();
 const f=TW.folders.find(x=>x.name==='Unit 2');assert.ok(f);assert.equal(f.parent,'bio');assert.equal(a.folder,f.id);
});
test('deleting a Hex Space saves online, can close its open postings and keeps other Hex Spaces',async()=>{
 const t=make();const {h,text}=t;teacher2(h);const v=h.v4,TW=v.getTW();
 let saved=null;v.setSave(async()=>{saved=JSON.parse(JSON.stringify(TW));return {revision:3}});
 v.setPosts([{id:'p1',activityId:'a1',title:'Cells',className:'Science club',open:true,status:'PUBLISHED',manual:true},{id:'p2',activityId:'a1',title:'Cells',className:'Period 4',open:false,status:'PUBLISHED',manual:true}]);
 const calls=[];h.setApi(async(path,body)=>{calls.push([path,body&&body.open]);if(path==='teacher/dashboard')return {assignments:[]};return {}});
 v.deleteHexSpace(TW.activities[0]);assert.match(text(),/Delete “Cells”\?/);assert.match(text(),/close its 1 open posting/);
 everything(t).find(n=>n.textContent==='Delete Hex Space').listeners.click();await settle();
 assert.equal(JSON.stringify(TW.activities.map(a=>a.id)),JSON.stringify(['a2']));assert.equal(saved.activities.length,1);
 assert.equal(JSON.stringify(calls.filter(c=>c[0].startsWith('posts/'))),JSON.stringify([['posts/p1/edit',false]]));assert.match(text(),/Deleted “Cells”/);
});
test('saving changes to a posted Hex Space offers to update its open postings',async()=>{
 const t=make();const {h,text}=t;teacher2(h);const v=h.v4,TW=v.getTW();
 v.setTeacherData(JSON.parse(JSON.stringify(TW)));TW.activities[0].terms.push({n:2,id:2,term:'Membrane'});
 v.setSave(async()=>{v.setTeacherData(JSON.parse(JSON.stringify(TW)));return {revision:3}});
 v.setPosts([{id:'p1',activityId:'a1',title:'Cells',className:'Science club',open:true,status:'PUBLISHED',manual:true},{id:'p9',activityId:'a2',title:'Atoms',className:'Period 4',open:true,status:'PUBLISHED',manual:true}]);
 const calls=[];h.setApi(async(path,body)=>{calls.push([path,body&&body.refresh]);if(path==='teacher/dashboard')return {assignments:[]};return {}});
 v.publishNow();await settle();
 assert.match(text(),/Update the posted copy too\?/);assert.match(text(),/Cells · Science club/);assert.doesNotMatch(text(),/Atoms · Period 4/);
 everything(t).find(n=>n.textContent==='Update postings').listeners.click();await settle();
 assert.equal(JSON.stringify(calls.filter(c=>c[0].startsWith('posts/'))),JSON.stringify([['posts/p1/edit',true]]));assert.match(text(),/Updated 1 posting/);
});

test('appearance menu switches theme and text size and remembers the choice',()=>{
 const t=make();const {h,store}=t;h.GA.ready=true;h.route();
 const ap=t.flatten().find(n=>n.attrs?.['aria-label']==='Appearance: theme and text size');assert.ok(ap,'appearance button in header');
 const item=label=>t.flatten().find(n=>n.textContent===label&&String(n.attrs?.class||'').includes('menu-item'));
 item('High contrast').listeners.click({});
 assert.equal(JSON.parse(store.get('hx-appearance')).theme,'contrast');
 item('Larger text').listeners.click({});assert.equal(JSON.parse(store.get('hx-appearance')).text,'large');
});

// ---------------- 4.5 ----------------
const subAct={id:'a1',title:'Cells',terms:[{n:1,id:1,term:'Nucleus',def:''},{n:2,id:2,term:'Membrane',def:''},{n:3,id:3,term:'Ribosome',def:''}],board:{shape:'hexagon',size:'roomy',orient:'pointy',rotate:true}};
const sub=(name,uid,extra={})=>({name,_studentUid:uid,_postId:'p1',_maxPoints:20,_manual:true,_status:'TURNED_IN',activitySnapshot:subAct,placements:{1:[0,0],2:[1,0],3:[1,-1]},connections:[{num:1,a:1,b:2,why:'The membrane surrounds the nucleus area'},{num:2,a:2,b:3,why:'Both are cell parts'}],termsUsed:3,...extra});
test('the grader scores each connection, fills the grade from the scores and moves to the next student',async()=>{
 const t=make();const {h,text}=t;teacherWork(h);const v=h.v4;
 const calls=[];h.setApi(async(path,body)=>{if(!/\/game$/.test(path))calls.push([path,JSON.parse(JSON.stringify(body||{}))]);return {}});
 const list=[sub('Ava','s1'),sub('Ben','s2')];v.openGrader(list,0);
 assert.match(text(),/1 of 2/);assert.match(text(),/The membrane surrounds the nucleus area/);
 const btn=(label,i=0)=>everything(t).filter(n=>n.tagName==='button'&&n.textContent===label)[i];
 btn('2 · Strong',0).listeners.click();btn('1 · Partly',1).listeners.click();
 assert.equal(everything(t).find(n=>n.attrs?.id==='gr-grade').value,15);
 everything(t).find(n=>n.attrs?.['aria-label']==='Comment on C2').value='Say how they work together.';everything(t).find(n=>n.attrs?.['aria-label']==='Comment on C2').listeners.input();
 btn('Save & next student').listeners.click();await settle();
 assert.equal(calls[0][0],'posts/p1/feedback');assert.equal(JSON.stringify(calls[0][1].scores),JSON.stringify({1:2,2:1}));assert.equal(calls[0][1].comments['2'],'Say how they work together.');
 assert.equal(calls[1][0],'posts/p1/grade');assert.equal(calls[1][1].grade,15);
 assert.match(text(),/2 of 2/);assert.match(text(),/Ben/);
});
test('returning a code-only board for revision saves feedback without a grade',async()=>{
 const t=make();const {h}=t;teacherWork(h);const v=h.v4;const calls=[];h.setApi(async(path,body)=>{if(!/\/game$/.test(path))calls.push(path);return {}});
 v.openGrader([sub('Ava','s1')],0);everything(t).find(n=>n.attrs?.id==='gr-revise').checked=true;everything(t).find(n=>n.attrs?.id==='gr-grade').value='12';
 everything(t).find(n=>n.textContent==='Save & finish').listeners.click();await settle();
 assert.equal(JSON.stringify(calls.filter(c=>c.startsWith('posts/'))),JSON.stringify(['posts/p1/feedback']));
});
test('class insights count term use, common pairs, unused terms and short reasons',()=>{
 const {h}=make();
 const d=h.v4.insightsData({terms:3,act:{terms:subAct.terms,dc:[]},students:[
  {status:'TURNED_IN',placed:3,connections:2,conns:[{pair:'1-2',why:'one two three four five six'},{pair:'2-3',why:'short'}]},
  {status:'DRAFT',placed:2,connections:1,conns:[{pair:'1-2',why:'also connects these two terms in a clear way'}]},
  {status:'DRAFT',placed:0,connections:0,conns:[]}]});
 assert.equal(d.total,3);assert.equal(d.started,2);assert.equal(d.done,1);
 assert.equal(d.top[0].a+'|'+d.top[0].b+'|'+d.top[0].n,'Nucleus|Membrane|2');
 assert.equal(JSON.stringify(d.terms.map(t=>t.n)),JSON.stringify([2,2,1]));assert.equal(d.short,1);
});
test('grades download as a spreadsheet file with rubric counts and feedback',()=>{
 const {h}=make();let file=null;h.v4.setDownload((name,text)=>{file={name,text}});
 h.v4.exportGrades({title:'Cells / Unit 3'},[sub('Ava','s1',{_grade:15,email:'ava@x.org',_feedback:{scores:{1:2,2:1},overall:'Nice, "clear" work'}})]);
 assert.equal(file.name,'Cells-Unit-3-grades.csv');const lines=file.text.split('\r\n');
 assert.match(lines[0],/^Student,Email,Status/);assert.match(lines[1],/^Ava,ava@x.org,Turned in,3,2,/);assert.match(lines[1],/,1,1,0,15,20,No,/);assert.match(lines[1],/"Nice, ""clear"" work"$/);
});
test('the privacy page is public and the account menu offers data download and deletion',()=>{
 const t=make();const {h,text,location}=t;h.GA.ready=true;location.hash='#privacy';h.route();
 assert.match(text(),/How Hex Connections handles your information/);assert.match(text(),/No ads/);assert.doesNotMatch(text(),/Log in to open that page/);
 const {h:h2}=make();h2.GA.user={uid:'t',email:'t@x'};h2.PX.profile={role:'teacher'};
 const labels=h2.v4.accountItems('teacher').map(i=>i.label||i.note).join('|');
 assert.match(labels,/Download my data\|Delete my account…\|Privacy/);assert.match(labels,/Sign out$/);
});

// ---------------- 4.7 ----------------
test('student supports in the Post dialog start from the Hex Space and are sent with the posting, with versions',async()=>{
 const t=make();const {h}=t;teacher2(h);const v=h.v4;v.setSave(async()=>({revision:2}));v.setPosts([]);
 v.getTW().activities[0].starters=false;v.getTW().activities[0].terms.push({n:2,id:2,term:'Membrane'});
 const sent=[];h.setApi(async(path,body)=>{if(path==='posts/new'){sent.push(body);return {id:'p1',code:'ABC23X',title:body.title}}if(path==='teacher/dashboard')return {assignments:[]};throw new Error(path)});
 v.openPostDialog(v.getTW().activities[0]);
 const byId=id=>everything(t).find(n=>n.attrs?.id===id);
 assert.ok(!byId('ps-starters').checked,'starters default from the Hex Space');assert.equal(byId('ps-defs').checked,true);
 byId('ps-defs').checked=false;byId('ps-translate').checked=false;
 byId('pv-on').checked=true;byId('pv-on').listeners.change();
 const chips=everything(t).filter(n=>String(n.attrs?.class||'').includes('term-chip')&&n.textContent==='Membrane');assert.equal(chips.length,2);
 chips[1].listeners.click({});
 byId('pd-c-club').checked=true;byId('pd-c-club').listeners.change();
 everything(t).find(n=>n.tagName==='button'&&n.textContent==='Post').listeners.click();await settle();
 assert.equal(sent.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(sent[0].options)),{defs:false,starters:false,readAloud:true,translate:false,reflect:true,gallery:true,noPaste:false,flow:true,lang:''});
 assert.deepEqual(JSON.parse(JSON.stringify(sent[0].versions.map(x=>x.terms))),[[1,2],[1]]);
});
test('a version with no terms is caught before posting',()=>{
 const {h}=make();const ve=h.v47.versionsEditor({terms:[{id:1,term:'A'}]});
 assert.equal(ve.value(),null);
});
test('sentence starters use both terms, or the Depth & Complexity lens',()=>{
 const {h}=make();
 h.setStudent({act:{},H:{1:{name:'Nucleus'},2:{name:'Membrane'},1003:{name:'Patterns',kind:'dc'}},d:{place:{},conns:{}}});
 const s=h.v47.startersFor(1,2);assert.ok(s.includes('Nucleus affects Membrane by '));
 assert.match(h.v47.startersFor(1003,1)[0],/^Through the lens of Patterns, Nucleus/);
});
test('the board records a build history for the teacher replay',()=>{
 const {h}=make();const d={place:{1:[0,0]},conns:{}};h.setStudent({act:{},cls:{},d,preview:false});
 h.v47.recordHistory();assert.equal(d.history,undefined,'first call only remembers the starting board');
 d.place[2]=[1,0];d.conns['1-2']={why:'Because reasons',at:1};h.v47.recordHistory();
 delete d.place[1];h.v47.recordHistory();
 assert.deepEqual(JSON.parse(JSON.stringify(d.history.map(e=>e.slice(1)))),[[2,1,0],['1-2'],[1,null,null]]);
 const st=h.v47.replayStates({history:d.history,connections:[{a:1,b:2,why:'Because reasons'}]});
 assert.equal(st.length,4);assert.deepEqual(Object.keys(st[2].conns),['1-2']);assert.equal(st[2].conns['1-2'].why,'Because reasons');assert.deepEqual(Object.keys(st[3].place),['2']);
});
test('reflection is asked before turning in and saved with the board',()=>{
 const t=make();const {h,text}=t;const d={name:'A',place:{},conns:{}};
 h.setStudent({act:{id:'a',reflect:true},cls:{id:'c'},d,preview:false});h.setReady(()=>true);
 h.submit();assert.match(text(),/Quick reflection/);
 everything(t).find(n=>n.attrs?.id==='rf-proud').value='C2 because it explains cause';
 try{everything(t).find(n=>n.tagName==='button'&&n.textContent==='Turn in').listeners.click()}catch(e){/* the platform submit needs a signed-in browser */}
 assert.equal(d.reflection.proud,'C2 because it explains cause');
 const t2=make();t2.h.setStudent({act:{id:'a',reflect:false},cls:{id:'c'},d:{name:'A',place:{},conns:{}},preview:false});t2.h.setReady(()=>true);try{t2.h.submit()}catch(e){}assert.doesNotMatch(t2.text(),/Quick reflection/);
});
test('printable tiles list every term, with or without definitions, safely escaped',()=>{
 const {h}=make();const a={title:'Cells <3',terms:[{n:1,id:1,term:'Nucleus',def:'Control center'},{n:2,id:2,term:'A&B',def:''}],dcOn:true,dc:['patterns']};
 const withDefs=h.v47.printTileHTML(a,{defs:true,lenses:true});
 assert.match(withDefs,/Nucleus/);assert.match(withDefs,/Control center/);assert.match(withDefs,/A&amp;B/);assert.match(withDefs,/Cells &lt;3/);assert.match(withDefs,/Patterns/);
 const bare=h.v47.printTileHTML(a,{defs:false,lenses:false});assert.doesNotMatch(bare,/Control center/);assert.doesNotMatch(bare,/Patterns/);
});
test('the grader shows the version, the reflection and a replay button',()=>{
 const {h}=make();const n=h.v47.graderExtras({version:'Support',reflection:{proud:'C1',hard:'C3'},history:[[0,1,0,0],[5,2,1,0]]},[],0);
 const all=kids(n).map(x=>x.textContent).join(' ');assert.match(all,/Version: Support/);assert.match(all,/Proudest/);assert.match(all,/Watch how it was built/);
 assert.doesNotMatch(kids(h.v47.graderExtras({},[],0)).map(x=>x.textContent).join(' '),/Student reflection|Watch how/);
});
test('the gallery hides names from students and lets teachers hide comments',()=>{
 const {h}=make();h.GA.user={uid:'s'};
 const act={id:'a',title:'Cells',terms:[{n:1,id:1,term:'Nucleus'},{n:2,id:2,term:'Membrane'}]};
 const board=(o)=>({board:'k'+o.label,label:o.label,mine:!!o.mine,placements:{1:[0,0],2:[1,0]},connections:[{num:1,a:1,b:2,why:'Linked'}],comments:o.comments||[],...o.extra});
 const root=make();const el=root.root;
 h.v47.drawGallery(el,'p1',{title:'Cells',open:true,act,boards:[board({label:'Board A',mine:true,comments:[{id:'c1',kind:'glow',text:'Clear!'}]}),board({label:'Board B'})]},false);
 let txt=kids(el).map(x=>x.textContent).join(' ');assert.match(txt,/Your board/);assert.match(txt,/Clear!/);assert.match(txt,/Board B/);assert.ok(kids(el).some(n=>n.tagName==='button'&&n.textContent==='🌱 Grow'));
 const el2=make().root;
 h.v47.drawGallery(el2,'p1',{title:'Cells',open:true,act,boards:[board({label:'Board A',extra:{name:'Ava'},comments:[{id:'c1',kind:'grow',text:'Say how',author:'Ben',hidden:false}]})]},true);
 txt=kids(el2).map(x=>x.textContent).join(' ');assert.match(txt,/Board A · Ava/);assert.match(txt,/Ben/);assert.ok(kids(el2).some(n=>n.tagName==='button'&&n.textContent==='Hide'));assert.ok(kids(el2).some(n=>n.textContent==='Close gallery walk'));
});
test('Microsoft sign-in appears only when the site owner turns it on',()=>{
 const t=make();const {h,text,location}=t;h.GA.ready=true;h.GA.auth={};location.hash='#signin';h.renderGoogleGate();
 assert.doesNotMatch(text(),/Continue with Microsoft/);
 h.v47.CFG.microsoft=true;h.renderGoogleGate();assert.match(text(),/Continue with Microsoft/);
});

// ---------------- 4.8 ----------------
test('a finished Hex Space can be assigned to a chosen class from the Hex Space itself',()=>{
 const t=make();const {h,text}=t;teacher2(h);const v=h.v4;v.setPosts([]);const a=v.getTW().activities[0];
 const menu=h.v48.assignMenu(a);const items=kids(menu).filter(n=>String(n.attrs?.class||'').includes('menu-item')).map(n=>n.textContent);
 assert.deepEqual(items,['Period 2 · Classroom','Period 4 · code','Science club · code','Several classes…']);
 kids(menu).find(n=>n.textContent==='Period 4 · code').listeners.click({});
 assert.match(text(),/Post a Hex Space|Post “Cells”/);
 const box=id=>everything(t).find(n=>n.attrs?.id===id);assert.equal(box('pd-c-p4').checked,true);assert.ok(!box('pd-c-club').checked);
 assert.ok(h.v48.assignNudge(a),'nudge for a ready, unassigned Hex Space');
 v.setPosts([{activityId:'a1'}]);assert.equal(h.v48.assignNudge(a),null);
 assert.equal(h.v48.assignNudge({title:'',terms:[]}),null);
});

// ---------------- 4.9 ----------------
test('merging keeps changes from both windows: folders, moves, edits and deletes',()=>{
 const {h}=make();const m=h.v49.mergeInto;
 const base={activities:[{id:'a',title:'A',folder:null},{id:'b',title:'B'},{id:'c',title:'C'}],folders:[{id:'f1',name:'Bio',parent:null}],classes:[]};
 const mine=JSON.parse(JSON.stringify(base));mine.folders.push({id:'f2',name:'Unit 3',parent:'f1'});mine.activities[0].folder='f2';mine.activities=mine.activities.filter(x=>x.id!=='c');
 const keep=mine.activities[0];
 const theirs=JSON.parse(JSON.stringify(base));theirs.activities[1].title='B edited';theirs.folders.push({id:'f3',name:'Chem',parent:null});theirs.activities.push({id:'d',title:'D'});theirs.folders=theirs.folders.filter(f=>f.id!=='f1');
 m(mine,base,theirs);
 assert.equal(JSON.stringify(mine.activities.map(a=>a.id+':'+a.title+':'+(a.folder||''))),JSON.stringify(['a:A:f2','b:B edited:','d:D:']));
 assert.ok(mine.activities[0]===keep,'open editor keeps the same object');
 assert.equal(JSON.stringify(mine.folders.map(f=>f.id+':'+(f.parent||'')).sort()),JSON.stringify(['f2:','f3:']),'f1 deleted elsewhere; its child moves to the top');
});
test('an earlier visit’s unsaved folders are merged on the next login instead of being set aside',()=>{
 const {h}=make();
 h.lsSet('hx-workspace-snap',{activities:[{id:'a',title:'A'}],folders:[],classes:[]});h.lsSet('hx-workspace-base',1);
 h.lsSet('hx-teacher-work',{activities:[{id:'a',title:'A',folder:'f9'}],folders:[{id:'f9',name:'Mine',parent:null}],classes:[]});
 h.v49.reconcileLocal({revision:2,workspace:{activities:[{id:'a',title:'A'},{id:'n',title:'New elsewhere'}],folders:[],classes:[]}});
 const w=h.lsGet('hx-teacher-work');assert.equal(w.folders[0].name,'Mine');assert.equal(w.activities[0].folder,'f9');assert.ok(w.activities.some(a=>a.id==='n'));
 assert.equal(h.lsGet('hx-workspace-base'),2);
});
test('the Hex Space page is a directory of folders and Hex Spaces with a New Hex Space button',()=>{
 const t=make();const {h,text,location}=t;teacher2(h);const v=h.v4;v.setPosts([{activityId:'a1',className:'Science club',submissions:3}]);
 location.hash='#teacher/editor';h.v49.renderDirectory();
 assert.match(text(),/My Hex Spaces/);assert.match(text(),/\+ New Hex Space/);assert.match(text(),/Biology/);assert.match(text(),/Atoms/);assert.doesNotMatch(text(),/Cells · /);
 assert.doesNotMatch(text(),/Science club/,'folder Hex Spaces are inside the folder, not listed at the top');
 location.hash='#teacher/folder-bio';h.v49.renderDirectory();assert.match(text(),/Cells/);assert.match(text(),/3 submissions/);assert.match(text(),/All Hex Spaces/);
 const s=everything(t).find(n=>n.attrs?.id==='dir-q');s.value='proton';s.listeners.input();assert.match(text(),/Atoms/);
});
test('paste blocking stops paste and drop, tells the student, and counts attempts for the teacher',()=>{
 const t=make();const {h}=t;const d={place:{},conns:{}};h.setStudent({act:{noPaste:true},cls:{},d,preview:true});
 const wrap={tagName:'div',children:[],insertBefore(n){this.children.push(n)}};const ta={tagName:'textarea',listeners:{},attrs:{},parentNode:wrap,addEventListener(k,f){this.listeners[k]=f},setAttribute(k,v){this.attrs[k]=v}};
 h.v49.blockPaste(ta);let prevented=0;ta.listeners.paste({preventDefault(){prevented++}});ta.listeners.drop({preventDefault(){prevented++}});ta.listeners.beforeinput({inputType:'insertText',preventDefault(){prevented++}});
 assert.equal(prevented,2);assert.equal(d.pasteBlocked,2);assert.equal(wrap.children[0].hidden,false);
 const g=h.v49.graderExtras({pasteAttempts:2});assert.match(kids(g).map(x=>x.textContent).join(' '),/2 paste attempts blocked/);
});

// ---------------- 4.10 ----------------
test('one connected board: groups are joined only by explained, touching connections, and turn-in waits for one group',()=>{
 const t=make();const {h}=t;const g=h.v410.flowGroups;
 const place={1:[0,0],2:[1,0],3:[2,0],1003:[0,1]};
 assert.equal(JSON.stringify(g(place,{'1-2':{why:'x'},'2-3':{why:''}})),JSON.stringify([[1,2],[3],[1003]]),'an empty explanation does not join');
 assert.equal(g(place,{'1-2':{why:'x'},'2-3':{why:'y'},'1-1003':{why:'z'}}).length,1,'a D&C hexagon is part of the flow');
 assert.equal(g({1:[0,0],2:[3,0]},{'1-2':{why:'not touching'}}).length,2,'hexagons that are apart are not joined');
 const terms=[{n:1,id:1,term:'Nucleus'},{n:2,id:2,term:'Membrane'},{n:3,id:3,term:'Ribosome'}];
 const d={name:'Ava',place:{1:[0,0],2:[1,0],3:[3,0]},conns:{'1-2':{why:'x'}}};
 h.setStudent({act:{flow:true,minTerms:2,terms},H:{1:{name:'Nucleus'},2:{name:'Membrane'},3:{name:'Ribosome'}},d});
 const check=h.v410.getChecker();assert.equal(check(),false);assert.match(t.text(),/Not linked to the rest yet: Ribosome/);
 d.place[3]=[2,0];d.conns['2-3']={why:'y'};assert.equal(check(),true);
 h.setStudent({act:{minTerms:2,terms},H:{},d:{name:'Ava',place:{1:[0,0],2:[1,0],3:[3,0]},conns:{'1-2':{why:'x'}}}});assert.equal(check(),true,'rule off: separate groups are fine');
});

// ---------------- 4.11 ----------------
test('the How to use guide is public, covers teacher and student features, and the homepage links into it',()=>{
 const t=make();const {h,text,location}=t;h.GA.ready=true;location.hash='#guide';h.route();
 for(const s of ['For teachers','For students','Gallery walk','Printable tiles','Student supports and rules','Versions for different students','Review and grade student work','Watch how it was built','Turn in, feedback and the gallery walk'])assert.ok(text().includes(s),s);
 location.hash='#home';h.route();assert.match(text(),/From vocabulary list to visible thinking/);assert.match(text(),/Read the full guide/);
 assert.ok(t.flatten().some(n=>n.attrs?.href==='#guide-gallery'),'homepage card links to the gallery walk guide');
 const labels=h.v4.navItems().map(i=>i.label);assert.ok(labels.includes('How to use'));
});

// ---------------- 4.12 ----------------
test('submissions table: filters, sorting, Grade next ungraded and students still working',async()=>{
 const t=make();const {h,text,location,flatten}=t;h.GA.ready=true;h.GA.user={uid:'teacher'};h.PX.loaded=true;h.PX.profile={role:'teacher'};
 const sub=(name,uid,extra)=>Object.assign({name,_studentUid:uid,_status:'TURNED_IN',_grade:null,_maxPoints:20,connections:[{num:1,a:1,b:2,why:'x'}],termsUsed:2,submittedAt:'2026-10-30T10:00:00Z'},extra||{});
 h.setApi(async path=>{
  if(path==='teacher/dashboard')return {assignments:[{id:'post',title:'Memory',courseName:'Psychology',submissions:3,maxPoints:20}]};
  if(path.startsWith('submissions'))return {submissions:[sub('Zed','z',{late:true}),sub('Amy','a',{_grade:18,_feedback:{scores:{}}}),sub('Bo','b',{pasteAttempts:2})]};
  if(path==='posts/post/progress')return {terms:2,act:{title:'Memory',terms:[{id:1,n:1,term:'A'},{id:2,n:2,term:'B'}],dc:[]},students:[{uid:'a',turnedIn:true},{uid:'c',name:'Cy',turnedIn:false,place:{1:[0,0],2:[1,0]},conns:[{pair:'1-2',why:'draft reason'}],updatedAt:'2026-10-30T11:00:00Z'}]};
  return {groups:[]};});
 location.hash='#teacher/post-post';h.route();await tick();await tick();await tick();
 assert.match(text(),/Needs grading \(2\)/);assert.match(text(),/Still working \(1\)/);assert.match(text(),/Grade next ungraded \(2\)/);assert.match(text(),/Cy/);assert.match(text(),/⚠ 2 paste/);
 const names=()=>flatten().filter(n=>String(n.attrs?.class||'').includes('subs-name')).map(n=>n.textContent);
 assert.deepEqual(JSON.parse(JSON.stringify(names())),['Amy','Bo','Cy','Zed']);
 flatten().find(n=>n.textContent==='Needs grading (2)').listeners.click();assert.deepEqual(JSON.parse(JSON.stringify(names())),['Bo','Zed']);
 flatten().find(n=>n.textContent==='Still working (1)').listeners.click();assert.deepEqual(JSON.parse(JSON.stringify(names())),['Cy']);
 flatten().find(n=>n.textContent==='Peek').listeners.click();assert.match(text(),/Cy · still working/);assert.match(text(),/draft reason/);
});
test('grades CSV includes version, paste attempts and reflections',()=>{
 const {h}=make();let file=null;h.v4.setDownload((name,text)=>{file={name,text}});
 h.v4.exportGrades({title:'U'},[{name:'Ava',connections:[],_status:'TURNED_IN',version:'Support',pasteAttempts:3,reflection:{proud:'C1',hard:'C2'},_feedback:{overall:'ok'}}]);
 const [head,row]=file.text.split('\r\n');assert.match(head,/Version,Paste attempts blocked,Reflection: proudest,Reflection: hardest,Overall feedback$/);assert.match(row,/,Support,3,C1,C2,ok$/);
});
test('least-connected terms are flagged for reteaching; the gallery dialog sends visits and a comment goal',async()=>{
 const t=make();const {h,text}=t;
 const d={started:10,terms:[{term:'A',n:9},{term:'B',n:2},{term:'C',n:0},{term:'D',n:6}]};
 assert.deepEqual(JSON.parse(JSON.stringify(h.v412.leastConnected(d).map(x=>x.term))),['C','B']);
 const node=h.v412.reteachCallout(d);assert.match(kids(node).map(n=>n.textContent).join(''),/C \(0 of 10\).*B \(2 of 10\)/);
 assert.equal(h.v412.reteachCallout({started:0,terms:[]}),null);
 let sent=null;h.setApi(async(path,body)=>{sent=[path,body];return {open:true}});
 h.v412.openGalleryDialog('p1');everything(t).find(n=>n.attrs?.id==='gw-visits').value='3';everything(t).find(n=>n.attrs?.id==='gw-min').value='2';
 everything(t).find(n=>n.tagName==='button'&&n.textContent==='Open gallery walk').listeners.click({});await settle();
 assert.equal(sent[0],'posts/p1/gallery/open');assert.equal(JSON.stringify(sent[1]),JSON.stringify({open:true,visits:3,minComments:2}));
});

// ---------------- 4.13 ----------------
test('duplicating a Hex Space copies terms and settings but not postings or share links',()=>{
 const t=make();const {h}=t;teacher2(h);const TW=h.v4.getTW();const a=TW.activities[0];a.assign={club:{code:'X'}};a.sharedFrom={code:'S'};a.dcOn=true;
 h.v413.duplicateHexSpace(a);const c=TW.activities[1];
 assert.equal(c.title,'Cells (copy)');assert.notEqual(c.id,a.id);assert.equal(c.terms[0].term,'Nucleus');assert.equal(c.dcOn,true);assert.equal(c.folder,'bio');
 assert.equal(JSON.stringify(c.assign),'{}');assert.equal(c.sharedFrom,undefined);
});
test('the getting-started checklist tracks progress and disappears when done or hidden',()=>{
 const t=make();const {h}=t;teacher2(h);h.v4.setPosts([]);
 let fs=h.v413.firstSteps();let txt=kids(fs).map(n=>n.textContent).join(' ');assert.match(txt,/Add a class \(done\)/);assert.match(txt,/Build a Hex Space \(done\)/);assert.doesNotMatch(txt,/Assign it to a class \(done\)/);
 h.v4.setPosts([{activityId:'a1',submissions:2}]);assert.equal(h.v413.firstSteps(),null);
 h.v4.setPosts([]);h.lsSet;t.store.set('hx-checklist-hidden','1');assert.equal(h.v413.firstSteps(),null);
});

// ---------------- 4.14 ----------------
test('pictures travel with terms to the board and tray; the grader board zooms',()=>{
 const t=make();const {h}=t;
 const a={terms:[{id:1,n:1,term:'Seed',img:'abcdefghijklmnopqrstuvwx'},{id:2,n:2,term:'Root'}]};
 const hl=h.v414.hexList(a);assert.equal(hl[0].img,'abcdefghijklmnopqrstuvwx');assert.equal(hl[1].img,'');
 const gb=h.v414.graderBoard({title:'P',terms:a.terms,board:{shape:'open',size:'snug',orient:'pointy'}},{placements:{1:[0,0],2:[1,0]}},{'1-2':{why:'grows',at:1}});
 const all=kids(gb);assert.ok(all.some(n=>n.tagName==='image'&&n.attrs.href==='/api/img/abcdefghijklmnopqrstuvwx'),'picture drawn on the board');
 const zoomIn=all.find(n=>n.attrs?.['aria-label']==='Zoom in');zoomIn.listeners.click();zoomIn.listeners.click();
 assert.equal(all.find(n=>String(n.attrs?.class||'').includes('gb-z')).textContent,'200%');
 const r={term:'Leaf',img:''};const b=h.v414.termPictureButton(r,()=>{});assert.match(b.attrs['aria-label'],/Add a picture for Leaf/);
});
test('the roster panel shows who hasn’t opened it and plans versions for them',async()=>{
 const t=make();const {h}=t;const calls=[];
 h.setApi(async(path,body)=>{calls.push([path,body]);if(path.endsWith('/roster'))return {members:[{key:'u:b',name:'Bo',opened:false,planned:null},{key:'u:a',name:'Amy',opened:true,variant:0}],versions:['Core','Support'],classroom:'n/a',notOpened:1};return {}});
 const box={tagName:'div',children:[],appendChild(n){this.children.push(n)},replaceChildren(){this.children=[]}};
 const root=t.root;h.v414.rosterPanel('p1',{versions:[{name:'Core',terms:[1,2]},{name:'Support',terms:[1]}],manual:true},root);await settle();
 const txt=kids(root).map(n=>n.textContent).join(' ');assert.match(txt,/1 of 2 haven’t opened it yet: Bo/);assert.match(txt,/not opened yet/);
 const sel=kids(root).find(n=>n.tagName==='select'&&n.attrs['aria-label']==='Version for Bo');sel.value='1';sel.listeners.change();await settle();
 assert.equal(calls[1][0],'posts/p1/version-plan');assert.equal(JSON.stringify(calls[1][1]),JSON.stringify({plan:{'u:b':1}}));
 const sa=kids(root).find(n=>n.tagName==='select'&&n.attrs['aria-label']==='Version for Amy');sa.value='1';sa.listeners.change();await settle();
 assert.equal(calls[2][0],'posts/p1/version');assert.equal(JSON.stringify(calls[2][1]),JSON.stringify({studentUids:['a'],version:1}));
});

/* ---------- 4.15 games ---------- */
import {scoreBoard} from '../src/gamescore.js';
test('game points in the browser match the server’s scoring',()=>{
 const {h}=make();
 const act={terms:[{id:1,term:'A'},{id:2,term:'B'},{id:3,term:'C'},{id:4,term:'D'}]};
 const t0=Date.parse('2026-10-31T10:00:00Z');
 const d={place:{1:[0,0],2:[1,0],3:[0,1],4:[2,0],1003:[1,1]},conns:{
  '1-2':{why:'Both ideas describe how the cell controls what happens inside it every day',at:t0+1000,first:t0+1000},
  '1-3':{why:'They work together in the nucleus to keep things organized and safe',at:t0+2000,first:t0+2000},
  '2-4':{why:'Linked because one builds the other step by step in order',at:t0+3000,first:t0+3000},
  '2-1003':{why:'A pattern shows up here',at:t0+4000},'3-4':{why:'not touching so no points',at:1}},_skew:500};
 const game={rounds:[{id:'r1',target:2,startedAt:'2026-10-31T10:00:01Z',endsAt:'2026-10-31T10:00:03Z'}]};
 const extra={debate:{wins:1,votes:2,cast:3,rounds:3},raceWinner:true};
 const a=h.v415.gameScore(act,d,game,extra),b=scoreBoard(act,d,game,extra);
 for(const k of ['points','level','levelName','streak','best','links','placed','oneBoard','allIn'])assert.equal(a[k],b[k],k);
 assert.deepEqual(JSON.parse(JSON.stringify(a.badges)),b.badges);assert.deepEqual(JSON.parse(JSON.stringify(a.breakdown)),b.breakdown);
 assert.equal(a.links,4);assert.ok(a.badges.includes('bridge')&&a.badges.includes('champ')&&a.badges.includes('judge')&&a.badges.includes('race'));
});
test('Games is in the menu, has its own address and a public intro',()=>{
 const t=make(),{h}=t;
 assert.equal(h.v415.keyToPath('#games'),'/games');assert.equal(h.v415.pathToKey('/teacher/games/p1'),'#teacher/game-p1');assert.equal(h.v415.pathToKey('/student/games/p9'),'#play-p9');assert.equal(h.v415.keyToPath('play-p9'),'/student/games/p9');
 h.v415.renderGames();const txt=everything(t).map(n=>n.textContent||'').join(' ');
 assert.match(txt,/Defend the link/);assert.match(txt,/Log in to play/);
 assert.ok(h.v415.GUIDE.some(g=>g.id==='debate')&&h.v415.GUIDE.some(g=>g.id==='s-games'));
});
test('the grader shows game results and Add to grade adds a bonus without saving it',async()=>{
 const t=make();const {h}=t;teacherWork(h);
 h.setApi(async(path)=>/\/game$/.test(path)?{game:{on:true,rounds:[]},debate:{on:false},teams:[],standings:[{uid:'s1',name:'Ava',points:240,level:2,levelName:'Connector',rank:1,badges:['first','board'],debate:{wins:1,votes:3,cast:1}}]}:{});
 h.v4.openGrader([sub('Ava','s1')],0);await settle();
 const txt=everything(t).map(n=>n.textContent||'').join(' ');assert.match(txt,/240 pts · Level 2 Connector · #1 of 1/);assert.match(txt,/Debate: 1 win, 3 votes received/);
 const g=everything(t).find(n=>n.attrs?.id==='gr-grade');g.value='10';
 everything(t).find(n=>n.textContent==='Add to grade').listeners.click();assert.equal(g.value,'15');
});
test('a student’s board shows points, the timed round and the debate alert',()=>{
 const t=make(),{h}=t;
 const box=new (t.root.constructor)('div');box.attrs={id:'game-hud'};box.style={};t.root.children.push(box);
 h.v415.setST({act:{terms:[{id:1,term:'A'},{id:2,term:'B'},{id:3,term:'C'}]},d:{place:{1:[0,0],2:[1,0],3:[0,1]},conns:{'1-2':{why:'They are both parts of cells',at:Date.now(),first:Date.now()},'1-3':{why:'One protects the other one',at:Date.now(),first:Date.now()}}},preview:false});
 const now=new Date().toISOString(),later=new Date(Date.now()+60000).toISOString(),before=new Date(Date.now()-60000).toISOString();
 h.v415.GS.post='p1';h.v415.GS.data={now,game:{on:true,round:{id:'r1',target:2,startedAt:before,endsAt:later},rounds:[]},debate:{on:true,round:{n:1,phase:'defend',endsAt:later}},me:{debate:{wins:0,votes:0,cast:0},raceWinner:false}};
 h.v415.drawHud();const txt=everything(t).map(n=>n.textContent||'').join(' ');
 assert.match(txt,/240/,'30 + 40 + 50 + 50 + round 20 + target 50');assert.match(txt,/Explain 2 new connections/);assert.match(txt,/2\/2/);assert.match(txt,/Debate round 1/);assert.match(txt,/Go to the debate/);
});
test('saving keeps when each connection was first explained, even after its reason is edited',()=>{
 const {h}=make();
 const st={act:{id:'a',terms:[]},cls:{id:'c'},d:{place:{},conns:{'1-2':{why:'first try',at:111}}},preview:true};h.v415.setST(st);
 h.v415.saveDraft();assert.equal(st.d.conns['1-2'].first,111);
 st.d.conns['1-2']={why:'edited reason',at:999};h.v415.saveDraft();assert.equal(st.d.conns['1-2'].first,111);
 delete st.d.conns['1-2'];h.v415.saveDraft();st.d.conns['1-2']={why:'new again',at:2000};h.v415.saveDraft();assert.equal(st.d.conns['1-2'].first,2000);
});
