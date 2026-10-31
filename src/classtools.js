// 4.7 classroom tools: differentiated versions of one posting, a peer gallery walk,
// the public Hex Space library, translation of teacher-written terms, and site stats
// for the owner. Student names never reach other students: gallery boards are labelled
// "Board A", "Board B" and comment authors are shown only to the teacher.
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const parse=s=>{try{return s?JSON.parse(s):null}catch{return null}};
const NOW=()=>new Date().toISOString();
const text=(v,max)=>typeof v==='string'?v.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim().slice(0,max):'';
const isManualPost=p=>String(p.course_id||'').startsWith('manual:');

export const SUBJECTS=['Science','Math','English / ELA','Social Studies','History','World Languages','Arts','Health & PE','Computer Science','Other'];
export const GRADES=['K-2','3-5','6-8','9-12','College'];
export const LANGUAGES={es:'Español',zh:'中文',vi:'Tiếng Việt',ar:'العربية',tl:'Tagalog',ko:'한국어',ru:'Русский',pt:'Português',fr:'Français',ht:'Kreyòl ayisyen',hi:'हिन्दी',ja:'日本語',uk:'Українська',so:'Soomaali'};
export const TRANSLATE_MODEL='@cf/meta/m2m100-1.2b';
const TRANSLATE_LIMITS={user:400,site:3000};
const MAX_VERSIONS=4;

async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
export const boardKey=(postId,uid)=>sha(postId+':'+uid).then(h=>h.slice(0,12));

/* ---------- student supports chosen when posting ----------
   Each switch defaults to on (or to the Hex Space's own setting) and can be changed later. */
export const OPTION_KEYS=['defs','starters','readAloud','translate','reflect','gallery'];
export function cleanOptions(o,act){
  const src=o&&typeof o==='object'?o:{},out={};
  const dflt={starters:act?.starters!==false,reflect:act?.reflect!==false};
  for(const k of OPTION_KEYS)out[k]=typeof src[k]==='boolean'?src[k]:(k in dflt?dflt[k]:true);
  return out;
}
// What a student's browser receives: their version, with switched-off supports removed.
export function studentAct(info,variant){
  const act=variantAct(info,variant),o=cleanOptions(info?.asg?.options,info?.act);
  const out={...act,starters:act.starters!==false&&o.starters,reflect:act.reflect!==false&&o.reflect,readAloud:o.readAloud,translate:o.translate,gallery:o.gallery,showDefs:o.defs};
  if(!o.defs)out.terms=(act.terms||[]).map(t=>({...t,def:''}));
  return out;
}

/* ---------- versions ---------- */
export function cleanVersions(list,act,fail){
  if(list==null||list===false)return null;
  if(!Array.isArray(list)||list.length>MAX_VERSIONS)fail(400,'Use up to '+MAX_VERSIONS+' versions.');
  if(list.length<2)return null;
  const ids=new Set((act.terms||[]).map(t=>Number(t.id||t.n)));
  return list.map((v,i)=>{
    const terms=[...new Set((Array.isArray(v?.terms)?v.terms:[]).map(Number))].filter(id=>ids.has(id));
    if(!terms.length)fail(400,'Give each version at least one term.');
    return {name:text(v.name,40)||'Version '+String.fromCharCode(65+i),terms,starters:v.starters!==false,minWords:v.minWords==null?null:Math.max(0,Math.min(60,Number(v.minWords)||0))};
  });
}
// The activity a student sees: their version's terms, with the requirements scaled to fit.
export function variantAct(info,variant){
  const act=info?.act||{},versions=info?.asg?.versions;
  if(!Array.isArray(versions)||versions.length<2)return act;
  const v=versions[Number.isInteger(variant)&&variant>=0&&variant<versions.length?variant:0];
  const keep=new Set(v.terms.map(Number)),terms=(act.terms||[]).filter(t=>keep.has(Number(t.id||t.n)));
  const out={...act,terms,starters:v.starters!==false&&act.starters!==false};
  if(act.minTerms!==''&&act.minTerms!=null)out.minTerms=Math.min(terms.length,Number(act.minTerms)||0);
  if(v.minWords!=null)out.minWords=v.minWords;
  return out;
}
// Keep only what the version allows, so moving a student between versions never breaks their board.
export function fitDraft(draft,act){
  if(!draft||!draft.place)return draft;
  const dcKeys=['language','details','patterns','rules','trends','unanswered','ethics','bigidea','perspectives','change','across'];
  const ok=new Set((act.terms||[]).map(t=>String(t.id||t.n)));
  if(act.dcOn)for(const k of act.dc||[]){const i=dcKeys.indexOf(k);if(i>=0)ok.add(String(1001+i))}
  const place={},conns={};
  for(const [k,p] of Object.entries(draft.place))if(ok.has(k))place[k]=p;
  for(const [k,c] of Object.entries(draft.conns||{})){const [a,b]=k.split('-');if(ok.has(a)&&ok.has(b))conns[k]=c}
  return {...draft,place,conns};
}

/* ---------- reflection and build history (kept inside the board draft) ---------- */
export function cleanReflection(r){
  if(!r||typeof r!=='object')return null;
  const out={proud:text(r.proud,500),hard:text(r.hard,500)};
  return out.proud||out.hard?out:null;
}
export function cleanHistory(h,allowed){
  if(!Array.isArray(h))return [];
  const out=[];
  for(const e of h.slice(-800)){
    if(!Array.isArray(e)||!Number.isInteger(e[0])||e[0]<0||e[0]>1e10)continue;
    if(typeof e[1]==='string'){const p=e[1].split('-');if(p.length===2&&p.every(x=>allowed.has(x)))out.push([e[0],e[1]]);continue}
    if(!allowed.has(String(e[1])))continue;
    if(e[2]===null&&e[3]===null){out.push([e[0],e[1],null,null]);continue}
    if(Number.isInteger(e[2])&&Number.isInteger(e[3])&&Math.max(Math.abs(e[2]),Math.abs(e[3]),Math.abs(e[2]+e[3]))<=20)out.push([e[0],e[1],e[2],e[3]]);
  }
  return out;
}

/* ---------- helpers ---------- */
async function ownedPost(db,id,user,fail){
  const post=await one(db,'SELECT * FROM posts WHERE id=?',id);
  if(!post||post.owner_uid!==user.uid)fail(404,'Assignment not found.');
  return post;
}
async function reserve(db,scope,max){
  const day=new Date().toISOString().slice(0,10);
  return db.prepare(`INSERT INTO ai_daily_usage(day,scope,used) VALUES(?,?,1)
    ON CONFLICT(day,scope) DO UPDATE SET used=used+1 WHERE used<? RETURNING used`).bind(day,scope,max).first();
}
const turnedIn=s=>!!(s&&s.payload);
function ownerEmails(env){return String(env?.OWNER_EMAILS||'').toLowerCase().split(/[,\s]+/).filter(Boolean)}
export function isOwner(env,user){return !!user?.email&&ownerEmails(env).includes(String(user.email).toLowerCase())}

export async function handleClassToolRoutes(c){
  const {request,url,db,user,profile,input,fail,json,env}=c;
  const path=url.pathname,method=request.method;
  const teacher=()=>{if(profile.role!=='teacher')fail(403,'This is for teacher accounts only.','teacher-required')};
  let m;

  /* ---- versions: teacher moves a student to another version ---- */
  if((m=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/version$/))&&method==='POST'){
    teacher();const post=await ownedPost(db,m[1],user,fail),info=parse(post.body)||{};
    const versions=info.asg?.versions||[],b=await input(request);
    if(versions.length<2)fail(400,'This assignment has only one version.');
    if(!Number.isInteger(b.version)||b.version<0||b.version>=versions.length)fail(400,'Choose a version.');
    const list=Array.isArray(b.studentUids)?b.studentUids:[b.studentUid];
    if(!list.length||list.length>200||!list.every(u=>typeof u==='string'&&u))fail(400,'Choose a student.');
    let changed=0;
    for(const uid of list)changed+=(await run(db,'UPDATE submissions SET variant=? WHERE post_id=? AND uid=?',b.version,post.id,uid)).meta.changes||0;
    return json({changed,version:b.version,name:versions[b.version].name});
  }

  /* ---- gallery walk ---- */
  if((m=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/gallery(?:\/(open|comment|hide))?$/))){
    const id=m[1],action=m[2];
    try{await one(db,'SELECT id FROM peer_comments LIMIT 1')}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'The site owner needs to apply database migration 0007_classroom_tools.sql.','tools-setup');throw e}
    const post=await one(db,'SELECT * FROM posts WHERE id=?',id);
    if(!post)fail(404,'Assignment not found.');
    const info=parse(post.body)||{},mine=post.owner_uid===user.uid,open=!!info.asg?.gallery?.open;
    if(action==='open'&&method==='POST'){
      if(!mine)fail(404,'Assignment not found.');
      const b=await input(request);
      if(b.open===true&&cleanOptions(info.asg?.options,info.act).gallery===false)fail(400,'The gallery walk is switched off for this posting. Turn it on in the posting’s student supports first.','gallery-off');
      info.asg={...(info.asg||{}),gallery:{open:b.open===true,openedAt:b.open===true?NOW():(info.asg?.gallery?.openedAt||null)}};
      await run(db,'UPDATE posts SET body=? WHERE id=? AND owner_uid=?',JSON.stringify(info),id,user.uid);
      return json({open:b.open===true});
    }
    if(action==='hide'&&method==='POST'){
      if(!mine)fail(404,'Assignment not found.');
      const b=await input(request);
      if(typeof b.id!=='string')fail(400,'Choose a comment.');
      const r=await run(db,'UPDATE peer_comments SET hidden=? WHERE id=? AND post_id=?',b.hidden===false?0:1,b.id,id);
      if(!r.meta.changes)fail(404,'Comment not found.');
      return json({hidden:b.hidden!==false});
    }
    const me=mine?null:await one(db,'SELECT uid,payload FROM submissions WHERE post_id=? AND uid=?',id,user.uid);
    if(!mine){
      if(!me)fail(404,'Assignment not found.');
      if(!open)fail(403,'Your teacher hasn’t opened the gallery walk yet.','gallery-closed');
      if(!turnedIn(me))fail(403,'Turn in your own board first, then you can visit the gallery.','gallery-turn-in');
    }
    const list=await rows(db,'SELECT s.uid,s.payload,u.name FROM submissions s JOIN users u ON u.uid=s.uid WHERE s.post_id=? AND s.payload IS NOT NULL',id);
    const keyed=[];for(const r of list)keyed.push({...r,key:await boardKey(id,r.uid)});
    keyed.sort((a,b)=>a.key<b.key?-1:1);
    const byKey=new Map(keyed.map((r,i)=>[r.key,{...r,label:'Board '+(i<26?String.fromCharCode(65+i):String.fromCharCode(65+Math.floor(i/26)-1)+String.fromCharCode(65+i%26))}]));
    if(action==='comment'&&method==='POST'){
      if(mine)fail(403,'Teachers leave feedback in the grader.');
      const b=await input(request),target=byKey.get(String(b.board||''));
      if(!target)fail(404,'Board not found.');
      if(target.uid===user.uid)fail(400,'Leave comments on classmates’ boards.');
      if(!['glow','grow'].includes(b.kind))fail(400,'Choose Glow or Grow.');
      const body=text(b.text,280);
      if(body.length<3)fail(400,'Write a few words.');
      const n=await one(db,'SELECT COUNT(*) AS n FROM peer_comments WHERE post_id=? AND author_uid=?',id,user.uid);
      if((n?.n||0)>=40)fail(429,'You’ve left 40 comments on this gallery, which is the limit.');
      const cid=crypto.randomUUID();
      await run(db,'INSERT INTO peer_comments(id,post_id,target_uid,author_uid,kind,body,hidden,created_at) VALUES(?,?,?,?,?,?,0,?)',cid,id,target.uid,user.uid,b.kind,body,NOW());
      return json({comment:{id:cid,kind:b.kind,text:body,mine:true}},201);
    }
    if(action||method!=='GET')fail(405,'Unsupported method.');
    const comments=await rows(db,'SELECT c.*,u.name AS author FROM peer_comments c LEFT JOIN users u ON u.uid=c.author_uid WHERE c.post_id=? ORDER BY c.created_at',id);
    const boards=[...byKey.values()].map(r=>{
      const p=parse(r.payload)||{},own=r.uid===user.uid;
      const cs=comments.filter(x=>x.target_uid===r.uid&&(mine||!x.hidden)).map(x=>({id:x.id,kind:x.kind,text:x.body,mine:x.author_uid===user.uid,...(mine?{author:x.author||'Removed account',hidden:!!x.hidden}:{})}));
      return {board:r.key,label:r.label,mine:own,...(mine?{name:r.name,studentUid:r.uid}:{}),placements:p.placements||{},connections:(p.connections||[]).map(x=>({num:x.num,a:x.a,b:x.b,why:x.why})),comments:cs};
    });
    const showDefs=mine||cleanOptions(info.asg?.options,info.act).defs;
    const act=showDefs?info.act:{...info.act,terms:(info.act?.terms||[]).map(t=>({...t,def:''}))};
    return json({open,act,boards:boards.slice(0,80),title:info.act?.title||''});
  }

  /* ---- public library ---- */
  if(path==='/api/library'||path.startsWith('/api/library/')){
    teacher();
    try{await one(db,'SELECT code FROM library LIMIT 1')}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'The site owner needs to apply database migration 0007_classroom_tools.sql.','tools-setup');throw e}
    if(path==='/api/library'&&method==='GET'){
      const q=text(url.searchParams.get('q')||'',80).toLowerCase(),subject=url.searchParams.get('subject')||'',grade=url.searchParams.get('grade')||'';
      const args=[],where=['l.listed=1','l.reports<3','s.revoked=0'];
      if(SUBJECTS.includes(subject)){where.push('l.subject=?');args.push(subject)}
      if(GRADES.includes(grade)){where.push('l.grade=?');args.push(grade)}
      if(q){where.push("(lower(l.title) LIKE ? ESCAPE '\\' OR lower(l.summary) LIKE ? ESCAPE '\\' OR lower(l.standards) LIKE ? ESCAPE '\\' OR lower(s.body) LIKE ? ESCAPE '\\')");const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(like,like,like,like)}
      const list=await rows(db,`SELECT l.*,s.copies,u.name AS owner_name,(SELECT 1 FROM library_reports r WHERE r.code=l.code AND r.uid=?) AS reported FROM library l JOIN shares s ON s.code=l.code JOIN users u ON u.uid=l.owner_uid WHERE ${where.join(' AND ')} ORDER BY s.copies DESC,l.updated_at DESC LIMIT 60`,user.uid,...args);
      return json({items:list.map(r=>({code:r.code,title:r.title,subject:r.subject,grade:r.grade,standards:r.standards,summary:r.summary,terms:r.terms,copies:r.copies,sharedBy:r.owner_name,mine:r.owner_uid===user.uid,reported:!!r.reported,updatedAt:r.updated_at})),subjects:SUBJECTS,grades:GRADES});
    }
    if(path==='/api/library/mine'&&method==='GET'){
      const list=await rows(db,'SELECT l.*,s.copies,s.activity_id FROM library l JOIN shares s ON s.code=l.code WHERE l.owner_uid=? ORDER BY l.updated_at DESC',user.uid);
      return json({items:list.map(r=>({code:r.code,activityId:r.activity_id,title:r.title,subject:r.subject,grade:r.grade,standards:r.standards,summary:r.summary,listed:!!r.listed,hiddenByReports:r.reports>=3,copies:r.copies}))});
    }
    if(path==='/api/library'&&method==='POST'){
      const b=await input(request),code=String(b.code||'').toUpperCase();
      const share=await one(db,'SELECT * FROM shares WHERE code=?',code);
      if(!share||share.owner_uid!==user.uid||share.revoked)fail(404,'Create a share link for this Hex Space first.');
      if(!SUBJECTS.includes(b.subject))fail(400,'Choose a subject.');
      if(!GRADES.includes(b.grade))fail(400,'Choose a grade band.');
      const t=parse(share.body)||{},terms=(t.terms||[]).length;
      if(terms<3)fail(400,'Library Hex Spaces need at least 3 terms.');
      await run(db,`INSERT INTO library(code,owner_uid,title,subject,grade,standards,summary,terms,listed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)
        ON CONFLICT(code) DO UPDATE SET title=excluded.title,subject=excluded.subject,grade=excluded.grade,standards=excluded.standards,summary=excluded.summary,terms=excluded.terms,listed=1,updated_at=excluded.updated_at`,
        code,user.uid,share.title,b.subject,b.grade,text(b.standards,200),text(b.summary,400),terms,NOW(),NOW());
      return json({listed:true,code},201);
    }
    if((m=path.match(/^\/api\/library\/([A-Za-z0-9]{6,20})\/(unlist|report)$/))&&method==='POST'){
      const code=m[1].toUpperCase(),row=await one(db,'SELECT * FROM library WHERE code=?',code);
      if(!row)fail(404,'Not in the library.');
      if(m[2]==='unlist'){
        if(row.owner_uid!==user.uid)fail(404,'Not in the library.');
        await run(db,'UPDATE library SET listed=0,updated_at=? WHERE code=?',NOW(),code);return json({listed:false});
      }
      if(row.owner_uid===user.uid)fail(400,'You can remove your own Hex Space instead of reporting it.');
      const b=await input(request),reason=text(b.reason,300);
      if(!reason)fail(400,'Say briefly what’s wrong.');
      await run(db,'INSERT OR IGNORE INTO library_reports(code,uid,reason,created_at) VALUES(?,?,?,?)',code,user.uid,reason,NOW());
      const n=await one(db,'SELECT COUNT(*) AS n FROM library_reports WHERE code=?',code);
      await run(db,'UPDATE library SET reports=? WHERE code=?',n.n,code);
      return json({reported:true});
    }
    fail(404,'Library route not found.');
  }

  /* ---- translation of teacher-written terms and definitions ---- */
  if(path==='/api/translate'&&method==='POST'){
    const b=await input(request);
    if(!LANGUAGES[b.lang])fail(400,'Choose a language.');
    if(!Array.isArray(b.texts)||!b.texts.length||b.texts.length>130)fail(400,'Nothing to translate.');
    const texts=b.texts.map(t=>text(t,1000));
    const out=new Array(texts.length).fill(''),missing=[];
    for(let i=0;i<texts.length;i++){
      if(!texts[i])continue;
      const key=b.lang+':'+await sha(texts[i]);
      let hit=null;try{hit=await one(db,'SELECT body FROM translations WHERE key=?',key)}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'The site owner needs to apply database migration 0007_classroom_tools.sql.','tools-setup');throw e}
      if(hit)out[i]=hit.body;else missing.push({i,key});
    }
    if(missing.length){
      if(!env?.AI||typeof env.AI.run!=='function')fail(503,'Translation isn’t set up on this site yet.','ai-setup');
      const unique=[...new Map(missing.map(x=>[x.key,x])).values()];
      for(const x of unique){
        if(!await reserve(db,'translate:user:'+user.uid,TRANSLATE_LIMITS.user))fail(429,'You’ve reached today’s translation limit. It resets at 00:00 UTC.','translate-limit');
        if(!await reserve(db,'translate:site',TRANSLATE_LIMITS.site))fail(429,'The site’s translation allowance for today is used up. It resets at 00:00 UTC.','translate-limit');
        let r;
        try{r=await env.AI.run(TRANSLATE_MODEL,{text:texts[x.i],source_lang:'en',target_lang:b.lang})}
        catch{fail(503,'Translation is unavailable right now. Try again later.','ai-unavailable')}
        const t=text(r?.translated_text,2000);
        if(!t)fail(502,'The translation couldn’t be read. Try again.','ai-output');
        await run(db,'INSERT OR IGNORE INTO translations(key,lang,body,created_at) VALUES(?,?,?,?)',x.key,b.lang,t,NOW());
        missing.filter(y=>y.key===x.key).forEach(y=>{out[y.i]=t});
      }
    }
    return json({lang:b.lang,translations:out});
  }

  /* ---- site stats for the owner (counts only) ---- */
  if(path==='/api/owner/stats'&&method==='GET'){
    if(!isOwner(env,user))fail(404,'Not found.');
    const n=async(sql,...a)=>((await one(db,sql,...a))||{}).n||0;
    const week=new Date(Date.now()-7*864e5).toISOString(),day=new Date().toISOString().slice(0,10);
    const safe=async(sql,...a)=>{try{return await n(sql,...a)}catch{return 0}};
    return json({
      teachers:await n("SELECT COUNT(*) AS n FROM users WHERE role='teacher'"),
      students:await n("SELECT COUNT(*) AS n FROM users WHERE role='student'"),
      newThisWeek:await n('SELECT COUNT(*) AS n FROM users WHERE created_at>=?',week),
      hexSpaces:await safe("SELECT COALESCE(SUM(json_array_length(body,'$.activities')),0) AS n FROM workspaces"),
      postings:await n('SELECT COUNT(*) AS n FROM posts'),
      postingsThisWeek:await n('SELECT COUNT(*) AS n FROM posts WHERE created_at>=?',week),
      boardsStarted:await n('SELECT COUNT(*) AS n FROM submissions WHERE draft IS NOT NULL'),
      boardsTurnedIn:await n('SELECT COUNT(*) AS n FROM submissions WHERE payload IS NOT NULL'),
      sharedLinks:await safe('SELECT COUNT(*) AS n FROM shares WHERE revoked=0'),
      libraryItems:await safe('SELECT COUNT(*) AS n FROM library WHERE listed=1 AND reports<3'),
      libraryReported:await safe('SELECT COUNT(*) AS n FROM library WHERE reports>=3'),
      galleryComments:await safe('SELECT COUNT(*) AS n FROM peer_comments'),
      aiToday:{vocabulary:await safe("SELECT COALESCE(SUM(used),0) AS n FROM ai_daily_usage WHERE day=? AND scope='site'",day),translations:await safe("SELECT COALESCE(SUM(used),0) AS n FROM ai_daily_usage WHERE day=? AND scope='translate:site'",day)},
      at:NOW()
    });
  }
  return null;
}
