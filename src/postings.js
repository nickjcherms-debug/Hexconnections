// Posting a Hex Space to a class. Every post is its own assignment with its own code,
// name, start date and due date, so one Hex Space can be posted to the same class more
// than once. Dates are dates in the teacher's time zone: a post opens at the start of its
// start date and is due at the end of its due date (11:59:59 PM).
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const parse=s=>{try{return JSON.parse(s)}catch{return null}};
const enc=encodeURIComponent;
const NOW=()=>new Date().toISOString();
const ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function validZone(tz){
  if(typeof tz!=='string'||!tz||tz.length>64)return false;
  try{new Intl.DateTimeFormat('en-US',{timeZone:tz});return true}catch{return false}
}
function zoneOffset(ts,tz){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ts));
  const p={};for(const x of parts)if(x.type!=='literal')p[x.type]=Number(x.value);
  return Date.UTC(p.year,p.month-1,p.day,p.hour===24?0:p.hour,p.minute,p.second)-ts;
}
// Wall-clock time on a date in a time zone -> UTC timestamp (handles daylight saving).
export function zonedTime(date,h,m,s,tz){
  const [y,mo,d]=date.split('-').map(Number), guess=Date.UTC(y,mo-1,d,h,m,s);
  let ts=guess-zoneOffset(guess,tz);
  ts=guess-zoneOffset(ts,tz);
  return ts;
}
function realDate(v){if(!DATE.test(v))return false;const [y,m,d]=v.split('-').map(Number),t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d}
export function postDates(b,fail,prior={}){
  const tz=b.tz===undefined?(prior.tz||'UTC'):b.tz;
  if(!validZone(tz))fail(400,'Your time zone was not recognized. Reload the page and try again.');
  const start=b.start===undefined?(prior.start||''):(b.start||''), due=b.due===undefined?(prior.due||''):(b.due||'');
  if(start&&!realDate(start))fail(400,'Choose a valid start date.');
  if(due&&!realDate(due))fail(400,'Choose a valid due date.');
  if(start&&due&&due<start)fail(400,'The due date must be on or after the start date.');
  const startAt=start?new Date(zonedTime(start,0,0,0,tz)).toISOString():'';
  const dueAt=due?new Date(zonedTime(due,23,59,59,tz)).toISOString():'';
  return {start,due,tz,startAt,dueAt};
}
export function startLabel(asg){
  try{return new Date(asg.startAt).toLocaleDateString('en-US',{timeZone:asg.tz||'UTC',weekday:'long',month:'long',day:'numeric'})}catch{return asg.start}
}
// Students can't open, join, save or turn in a post before its start date.
export function assertStarted(info,fail){
  const at=info?.asg?.startAt;
  if(at&&Date.now()<Date.parse(at))fail(403,'This assignment opens on '+startLabel(info.asg)+'.','not-started');
}
export function isLate(asg,at=Date.now()){
  if(asg?.dueAt)return at>Date.parse(asg.dueAt);
  return !!(asg?.due&&at>new Date(asg.due+'T23:59:59Z').getTime());
}
async function uniqueCode(db){
  for(let i=0;i<20;i++){
    const bytes=crypto.getRandomValues(new Uint8Array(6)),code=Array.from(bytes,b=>ALPHABET[b%ALPHABET.length]).join('');
    if(!await one(db,'SELECT id FROM posts WHERE code=? AND status=?',code,'PUBLISHED'))return code;
  }
  throw new Error('Could not create a unique code.');
}
function cleanTitle(v,fallback){const t=typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,200):'';return t||String(fallback||'').slice(0,200)}
function points(v,fallback,fail){
  const p=v==null?fallback:v;
  if(typeof p!=='number'||!Number.isFinite(p)||p<=0||p>10000)fail(400,'Points must be between 0 and 10,000.');
  return p;
}
function courseworkDates(asg){
  const out={};
  if(asg.dueAt){const d=new Date(asg.dueAt);out.dueDate={year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};out.dueTime={hours:d.getUTCHours(),minutes:d.getUTCMinutes(),seconds:d.getUTCSeconds()};}
  return out;
}
function description(act){return (act.instructions||'Complete your Hex Connections board.')+'\nOpen the Hex Connections link, sign in and turn in your work.'}

export async function handlePostingRoutes(c){
  const {request,url,db,user,profile,input,fail,json,getGoogle,origin}=c;
  const path=url.pathname;
  const create=path==='/api/posts/new'&&request.method==='POST';
  const edit=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/edit$/);
  if(!create&&!(edit&&request.method==='POST'))return null;
  if(profile.role!=='teacher')fail(403,'This is for teacher accounts only.','teacher-required');
  const b=await input(request);
  const w=await one(db,'SELECT body FROM workspaces WHERE owner_uid=?',user.uid), workspace=w&&parse(w.body);

  if(create){
    if(![b.activityId,b.classId].every(v=>typeof v==='string'&&v.length>0&&v.length<=200))fail(400,'Choose a Hex Space and a class.');
    const act=workspace?.activities?.find(a=>a.id===b.activityId), cls=workspace?.classes?.find(x=>x.id===b.classId);
    if(!cls)fail(400,'Save your Hex Space online with this class first.');
    if(!act?.title?.trim()||!(act.terms||[]).length)fail(400,'Give the Hex Space a title and at least one term, then save it online before posting.');
    const dates=postDates(b,fail);
    if(dates.dueAt&&Date.parse(dates.dueAt)<=Date.now())fail(400,'Choose a due date that hasn’t passed.');
    const maxPoints=points(b.maxPoints,100,fail), title=cleanTitle(b.title,act.title);
    const code=await uniqueCode(db), id=crypto.randomUUID(), link=new URL('/#a-'+id,origin).href;
    const asg={code,open:true,...dates};
    const snapAct={...act,title};
    if(!cls.classroomId){
      const courseId='manual:'+cls.id;
      const snapshot=JSON.stringify({act:snapAct,cls,asg,courseName:cls.name,manual:true});
      await run(db,'INSERT INTO posts(id,owner_uid,activity_id,class_id,course_id,status,body,max_points,code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,user.uid,act.id,cls.id,courseId,'PUBLISHED',snapshot,maxPoints,code,NOW());
      return json({id,url:link,code,title,manual:true,...dates},201);
    }
    const g=await getGoogle();
    await g('/courses/'+enc(cls.classroomId)+'/teachers/me');
    const snapshot=JSON.stringify({act:snapAct,cls,asg,courseName:cls.name});
    await run(db,'INSERT INTO posts(id,owner_uid,activity_id,class_id,course_id,status,body,max_points,code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,user.uid,act.id,cls.id,cls.classroomId,'CREATING',snapshot,maxPoints,code,NOW());
    const scheduled=!!(dates.startAt&&Date.parse(dates.startAt)>Date.now()+60000);
    const coursework={title,description:description(snapAct),materials:[{link:{url:link}}],maxPoints,workType:'ASSIGNMENT',...courseworkDates(asg),
      ...(scheduled?{state:'DRAFT',scheduledTime:dates.startAt}:{state:'PUBLISHED'})};
    let result;
    try{result=await g('/courses/'+enc(cls.classroomId)+'/courseWork','POST',coursework)}
    catch(e){
      // Google clearly refused (4xx): nothing was created there, so drop the pending row.
      // Anything else is uncertain and stays pending so it isn't posted twice.
      if(e&&e.status>=400&&e.status<500)await run(db,'DELETE FROM posts WHERE id=? AND owner_uid=? AND status=?',id,user.uid,'CREATING');
      throw e;
    }
    await run(db,'UPDATE posts SET coursework_id=?,classroom_url=?,status=? WHERE id=? AND owner_uid=?',result.id,result.alternateLink||'','PUBLISHED',id,user.uid);
    return json({id,url:link,code,title,classroomUrl:result.alternateLink||'',scheduled,...dates},201);
  }

  const id=edit[1], post=await one(db,'SELECT * FROM posts WHERE id=? AND owner_uid=?',id,user.uid);
  if(!post)fail(404,'Assignment not found.');
  if(post.status!=='PUBLISHED')fail(409,'This assignment’s Classroom publication is unresolved. Check Classroom first.','publish-unresolved');
  const info=parse(post.body)||{};
  const prior=info.asg||{};
  const dates=postDates(b,fail,prior);
  const asg={...prior,...dates};
  if(typeof b.open==='boolean')asg.open=b.open;
  const title=cleanTitle(b.title,info.act?.title);
  let act={...info.act,title};
  if(b.refresh===true){
    const latest=workspace?.activities?.find(a=>a.id===post.activity_id);
    if(!latest)fail(404,'This Hex Space is no longer in your workspace, so its content can’t be updated. You can still change the dates.');
    if(!latest.title?.trim()||!(latest.terms||[]).length)fail(400,'Give the Hex Space a title and at least one term before updating.');
    act={...latest,title};
  }
  const maxPoints=b.maxPoints===undefined?post.max_points:points(b.maxPoints,post.max_points,fail);
  const next={...info,act,asg};
  const touchesClassroom=['title','start','due','tz','maxPoints','refresh'].some(k=>b[k]!==undefined);
  if(touchesClassroom&&!String(post.course_id).startsWith('manual:')){
    const g=await getGoogle(), base='/courses/'+enc(post.course_id)+'/courseWork/'+enc(post.coursework_id);
    await g('/courses/'+enc(post.course_id)+'/teachers/me');
    const current=await g(base);
    const updates={title,description:description(act),maxPoints,...courseworkDates(asg)};
    const mask=['title','description','maxPoints','dueDate','dueTime'];
    if(current.state==='DRAFT'){
      const future=asg.startAt&&Date.parse(asg.startAt)>Date.now()+60000;
      if(future){updates.scheduledTime=asg.startAt;mask.push('scheduledTime')}
      else{updates.state='PUBLISHED';mask.push('state')}
    }
    await g(base+'?updateMask='+enc(mask.join(',')),'PATCH',updates);
  }
  await run(db,'UPDATE posts SET body=?,max_points=? WHERE id=? AND owner_uid=?',JSON.stringify(next),maxPoints,id,user.uid);
  return json({id,title,code:asg.code,open:asg.open!==false,maxPoints,...dates});
}
