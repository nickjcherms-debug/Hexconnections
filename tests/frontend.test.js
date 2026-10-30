import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const script=html.match(/<script id="hx-main">([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.textContent='';this.style={};this.dataset={};}
 appendChild(n){this.children.push(n);return n}
 prepend(n){this.children.unshift(n)}
 insertBefore(n,before){const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,n)}
 replaceChildren(){this.children=[];this.textContent=''}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(k,v){this.listeners[k]=v}
 querySelector(){return null}
 focus(){}
 remove(){}
}
function make(){
 const root=new Element('div'),store=new Map();
 const nodes={root,'hx-data':{textContent:'{"classes":[],"activities":[]}'},'hx-auth-config':{textContent:html.match(/id="hx-auth-config">([\s\S]*?)<\/script>/)[1]},'hx-main':{textContent:script},'hx-style':{textContent:''}};
 const document={getElementById:id=>nodes[id]||null,createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),createTextNode:t=>({textContent:t}),addEventListener(){},body:new Element('body'),querySelector(){return null}};
 const location={hash:'',protocol:'https:',hostname:'hexconnections.com',origin:'https://hexconnections.com',pathname:'/'};
 let hash='';Object.defineProperty(location,'hash',{get(){return hash},set(value){hash=value?(value.startsWith('#')?value:'#'+value):''}});
 const context={document,location,window:{addEventListener(){},innerWidth:1000},setTimeout(){},clearTimeout(){},console,TextDecoder,Uint8Array,Blob,URL,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
 vm.createContext(context);
 const hooks=`globalThis.hx={GA,PX,AUTH_CONFIG,caps,renderGoogleGate,chooseAccountRole,route,loadPlatform,lsGet,lsSet,googleTeacher,classroomReady,buildDocument,clearAccountView,
 setApi(fn){platformApi=fn},setTeacher(fn){startTeacher=fn}};`;
 vm.runInContext(script.replace(/route\(\);\nbootGoogle\(\);\n\}\)\(\);\s*$/,hooks+'})();'),context);
 const h=context.hx;
 function flatten(n=root){return [n,...(n.children||[]).flatMap(flatten)]}
 const text=()=>flatten().map(n=>n.textContent).join(' ');
 return {h,root,location,text,flatten,store};
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
