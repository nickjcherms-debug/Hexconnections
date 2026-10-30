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
 const hooks=`globalThis.hx={GA,PX,AUTH_CONFIG,caps,renderGoogleGate,chooseAccountRole,route,loadPlatform,lsGet,lsSet,googleTeacher,classroomReady,buildDocument,clearAccountView,boardCells,boardOf,onBoardLimit,connectClassroom,setupPane,
 setWork(w){TW=w;TS.rows={};TS.sel=w.activities[0].id},setRenderTeacher(fn){renderTeacher=fn},
 setApi(fn){platformApi=fn},setTeacher(fn){startTeacher=fn}};`;
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
 h.setApi(async(path,body)=>{calls.push({path,body});if(path==='me')return {profile:{role:null}};if(path==='profile')return {profile:{role:body.role}};if(path==='workspace')return {workspace:{version:4,classes:[],activities:[]},revision:0};throw new Error(path)});
 let renders=0;h.setTeacher(()=>renders++);h.loadPlatform();await tick();
 assert.equal(h.PX.profile.role,'teacher');assert.equal(h.PX.loaded,true);assert.equal(location.hash,'#teacher');assert.equal(renders,1);assert.equal(calls.find(c=>c.path==='profile').body.role,'teacher');
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
