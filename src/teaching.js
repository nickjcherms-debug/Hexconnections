// Teacher feedback (rubric scores and comments), live class progress for Present mode,
// and each user's own data export and account deletion.
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const parse=s=>{try{return s?JSON.parse(s):null}catch{return null}};
const NOW=()=>new Date().toISOString();
const text=(v,max)=>typeof v==='string'?v.replace(/\r/g,'').trim().slice(0,max):'';

export function cleanFeedback(b,fail){
  const scores={},comments={};
  if(b.scores!=null&&(typeof b.scores!=='object'||Array.isArray(b.scores)))fail(400,'Scores must be a list of connection scores.');
  for(const [k,v] of Object.entries(b.scores||{})){
    if(!/^\d{1,3}$/.test(k))fail(400,'Unknown connection.');
    if(![0,1,2].includes(v))fail(400,'Each connection is scored 0, 1 or 2.');
    scores[k]=v;
  }
  for(const [k,v] of Object.entries(b.comments||{})){
    if(!/^\d{1,3}$/.test(k))fail(400,'Unknown connection.');
    const t=text(v,600);if(t)comments[k]=t;
  }
  if(Object.keys(scores).length>200||Object.keys(comments).length>200)fail(400,'Too many connections.');
  return {scores,comments,overall:text(b.overall,2000),revise:b.revise===true,updatedAt:NOW()};
}

export async function handleTeachingRoutes(c){
  const {request,url,db,user,profile,input,fail,json}=c;
  const path=url.pathname;

  const fb=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/feedback$/);
  if(fb&&request.method==='POST'){
    if(profile.role!=='teacher')fail(403,'This is for teacher accounts only.','teacher-required');
    const post=await one(db,'SELECT * FROM posts WHERE id=?',fb[1]);
    if(!post||post.owner_uid!==user.uid)fail(404,'Assignment not found.');
    const b=await input(request);
    if(typeof b.studentUid!=='string'||!b.studentUid)fail(400,'Choose a student.');
    const s=await one(db,'SELECT status,payload FROM submissions WHERE post_id=? AND uid=?',post.id,b.studentUid);
    if(!s?.payload)fail(404,'No submitted work found for this student.');
    const feedback=cleanFeedback(b,fail);
    const manual=String(post.course_id).startsWith('manual:');
    // Returning a code-only board for revision reopens it for the student.
    if(feedback.revise&&manual)await run(db,'UPDATE submissions SET feedback=?,status=?,classroom_status=?,updated_at=? WHERE post_id=? AND uid=?',JSON.stringify(feedback),'DRAFT','RETURNED',NOW(),post.id,b.studentUid);
    else await run(db,'UPDATE submissions SET feedback=?,updated_at=? WHERE post_id=? AND uid=?',JSON.stringify(feedback),NOW(),post.id,b.studentUid);
    return json({feedback});
  }

  const pr=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/progress$/);
  if(pr&&request.method==='GET'){
    if(profile.role!=='teacher')fail(403,'This is for teacher accounts only.','teacher-required');
    const post=await one(db,'SELECT * FROM posts WHERE id=?',pr[1]);
    if(!post||post.owner_uid!==user.uid)fail(404,'Assignment not found.');
    const info=parse(post.body)||{},terms=(info.act?.terms||[]).length;
    const list=await rows(db,'SELECT s.uid,s.draft,s.payload,s.status,s.updated_at,s.variant,u.name FROM submissions s JOIN users u ON u.uid=s.uid WHERE s.post_id=?',post.id);
    const students=list.map(r=>{
      const pay=parse(r.payload),d=pay?{place:pay.placements,conns:Object.fromEntries((pay.connections||[]).map(c=>[c.a+'-'+c.b,{why:c.why}]))}:parse(r.draft)||{};
      const placed=Object.keys(d.place||{}).filter(k=>Number(k)<1000).length;
      const conns=Object.entries(d.conns||{}).filter(([,v])=>v&&String(v.why||'').trim()).map(([k,v])=>({pair:k,why:String(v.why).slice(0,600)}));
      return {uid:r.uid,name:r.name,status:r.status,variant:r.variant||0,placed,connections:conns.length,conns,place:d.place||{},turnedIn:!!pay,updatedAt:r.updated_at};
    });
    return json({terms,students,versions:(info.asg?.versions||[]).map(v=>({name:v.name,terms:v.terms.length})),gallery:!!info.asg?.gallery?.open,act:{title:info.act?.title||'',terms:(info.act?.terms||[]).map(t=>({id:t.id||t.n,n:t.n,term:t.term})),dc:info.act?.dcOn?info.act.dc||[]:[]}});
  }

  if(path==='/api/account/export'&&request.method==='GET'){
    const ws=await one(db,'SELECT body,updated_at FROM workspaces WHERE owner_uid=?',user.uid);
    const subs=await rows(db,'SELECT post_id,draft,payload,status,grade,feedback,updated_at FROM submissions WHERE uid=?',user.uid);
    const posts=await rows(db,'SELECT id,course_id,status,code,created_at FROM posts WHERE owner_uid=?',user.uid);
    let shares=[],library=[],galleryComments=[];try{shares=await rows(db,'SELECT code,title,copies,revoked,created_at FROM shares WHERE owner_uid=?',user.uid)}catch{}
    try{library=await rows(db,'SELECT code,title,subject,grade,standards,summary,listed FROM library WHERE owner_uid=?',user.uid);galleryComments=await rows(db,'SELECT post_id,kind,body,created_at FROM peer_comments WHERE author_uid=?',user.uid)}catch{}
    return json({exportedAt:NOW(),profile,workspace:parse(ws?.body),postings:posts,shares,library,galleryComments,
      myWork:subs.map(s=>({postId:s.post_id,status:s.status,grade:s.grade,draft:parse(s.draft),submitted:parse(s.payload),feedback:parse(s.feedback),updatedAt:s.updated_at}))});
  }

  if(path==='/api/account/delete'&&request.method==='POST'){
    const b=await input(request);
    if(b.confirm!=='DELETE')fail(400,'Type DELETE to confirm.');
    // Everything this account owns, children before parents.
    const owned=(await rows(db,'SELECT id FROM posts WHERE owner_uid=?',user.uid)).map(r=>r.id);
    for(const id of owned){
      await run(db,'DELETE FROM project_group_members WHERE post_id=?',id);
      await run(db,'DELETE FROM project_groups WHERE post_id=?',id);
      await run(db,'DELETE FROM submissions WHERE post_id=?',id);
      try{await run(db,'DELETE FROM peer_comments WHERE post_id=?',id)}catch{}
    }
    try{await run(db,'DELETE FROM peer_comments WHERE author_uid=? OR target_uid=?',user.uid,user.uid);
      await run(db,'DELETE FROM library_reports WHERE code IN (SELECT code FROM library WHERE owner_uid=?)',user.uid);
      await run(db,'DELETE FROM library_reports WHERE uid=?',user.uid);
      await run(db,'DELETE FROM library WHERE owner_uid=?',user.uid)}catch{}
    await run(db,'DELETE FROM project_group_members WHERE uid=?',user.uid);
    await run(db,'DELETE FROM submissions WHERE uid=?',user.uid);
    await run(db,'DELETE FROM posts WHERE owner_uid=?',user.uid);
    try{await run(db,'DELETE FROM shares WHERE owner_uid=?',user.uid)}catch{}
    await run(db,'DELETE FROM workspaces WHERE owner_uid=?',user.uid);
    await run(db,'DELETE FROM users WHERE uid=?',user.uid);
    return json({deleted:true,postings:owned.length});
  }
  return null;
}
