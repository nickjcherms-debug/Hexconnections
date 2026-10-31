// Share links for teacher-made activities. A share stores a frozen copy of the
// activity's vocabulary and settings; classes, codes, folders and student work are
// never included. Another teacher previews the copy and saves it to their own space.
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const list=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const parse=s=>{try{return JSON.parse(s)}catch{return null}};
const NOW=()=>new Date().toISOString();
const ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DC=['language','details','patterns','rules','trends','unanswered','ethics','bigidea','perspectives','change','across'];
function newCode(){const bytes=crypto.getRandomValues(new Uint8Array(10));return Array.from(bytes,b=>ALPHABET[b%ALPHABET.length]).join('')}
// Only these fields leave the owner's workspace.
export function shareTemplate(act){
 const board=act.board&&typeof act.board==='object'?act.board:{};
 return {
  title:String(act.title||'').slice(0,250),
  instructions:String(act.instructions||'').slice(0,600),
  minTerms:act.minTerms==null||act.minTerms===''?null:Math.max(1,Math.min(60,Number(act.minTerms)||1)),
  minWords:Math.max(0,Math.min(60,Number(act.minWords)||0)),
  dcOn:!!act.dcOn,
  starters:act.starters!==false,
  reflect:act.reflect!==false,
  noPaste:act.noPaste===true,
  dc:(Array.isArray(act.dc)?act.dc:[]).filter(k=>DC.includes(k)),
  board:{shape:['hexagon','wide','tall','open'].includes(board.shape)?board.shape:'hexagon',size:['snug','roomy','spacious','expansive'].includes(board.size)?board.size:'roomy',orient:board.orient==='flat'?'flat':'pointy',rotate:board.rotate!==false},
  terms:(act.terms||[]).slice(0,60).map((t,i)=>({n:i+1,id:Number(t.id||t.n)||i+1,term:String(t.term||'').slice(0,100),def:String(t.def||'').slice(0,1000),...(typeof t.img==='string'&&/^[A-Za-z0-9_-]{16,40}$/.test(t.img)?{img:t.img}:{})}))
 };
}
function shareView(row,owner){
 return {code:row.code,title:row.title,copies:row.copies,revoked:!!row.revoked,createdAt:row.created_at,updatedAt:row.updated_at,activityId:row.activity_id,sharedBy:owner};
}
export async function handleShareRoutes(c){
 const {request,url,db,user,profile,input,fail,json}=c;
 const path=url.pathname;
 if(path!=='/api/shares'&&!path.startsWith('/api/shares/'))return null;
 try{await one(db,'SELECT code FROM shares LIMIT 1')}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'The site owner needs to apply database migration 0004_shares.sql before sharing works.','share-setup');throw e}
 if(profile.role!=='teacher')fail(403,'Shared Hex Spaces are for teacher accounts.','teacher-required');
 if(path==='/api/shares'&&request.method==='GET'){
  const rows=await list(db,'SELECT * FROM shares WHERE owner_uid=? ORDER BY updated_at DESC',user.uid);
  return json({shares:rows.map(r=>shareView(r,user.name))});
 }
 if(path==='/api/shares'&&request.method==='POST'){
  const b=await input(request);
  if(typeof b.activityId!=='string'||!b.activityId||b.activityId.length>80)fail(400,'Choose an activity to share.');
  const w=await one(db,'SELECT body FROM workspaces WHERE owner_uid=?',user.uid),workspace=w&&parse(w.body);
  const act=workspace?.activities?.find(a=>a.id===b.activityId);
  if(!act)fail(404,'Save your Hex Space online before sharing this activity.','share-unsaved');
  if(!String(act.title||'').trim()||!(act.terms||[]).length)fail(400,'Give the activity a title and at least one term before sharing it.');
  const template=shareTemplate(act),body=JSON.stringify(template);
  const existing=await one(db,'SELECT * FROM shares WHERE owner_uid=? AND activity_id=?',user.uid,act.id);
  if(existing){
   await run(db,'UPDATE shares SET title=?,body=?,revoked=0,updated_at=? WHERE code=? AND owner_uid=?',template.title,body,NOW(),existing.code,user.uid);
   try{await run(db,'UPDATE library SET title=?,terms=?,updated_at=? WHERE code=?',template.title,template.terms.length,NOW(),existing.code)}catch{}
   const row=await one(db,'SELECT * FROM shares WHERE code=?',existing.code);
   return json({share:shareView(row,user.name),updated:true});
  }
  for(let i=0;i<5;i++){
   const code=newCode();
   const res=await run(db,'INSERT OR IGNORE INTO shares(code,owner_uid,activity_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',code,user.uid,act.id,template.title,body,NOW(),NOW());
   if(res.meta.changes){const row=await one(db,'SELECT * FROM shares WHERE code=?',code);return json({share:shareView(row,user.name),updated:false},201)}
   const raced=await one(db,'SELECT * FROM shares WHERE owner_uid=? AND activity_id=?',user.uid,act.id);
   if(raced)return json({share:shareView(raced,user.name),updated:false});
  }
  fail(503,'Could not create a share link. Try again.');
 }
 const m=path.match(/^\/api\/shares\/([A-Za-z0-9]{6,20})(?:\/(copy|revoke))?$/);
 if(!m)fail(404,'Share route not found.');
 const code=m[1].toUpperCase(),action=m[2];
 const row=await one(db,'SELECT s.*,u.name AS owner_name FROM shares s JOIN users u ON u.uid=s.owner_uid WHERE s.code=?',code);
 if(action==='revoke'&&request.method==='POST'){
  if(!row||row.owner_uid!==user.uid)fail(404,'Share link not found.');
  await run(db,'UPDATE shares SET revoked=1,updated_at=? WHERE code=? AND owner_uid=?',NOW(),code,user.uid);
  try{await run(db,'UPDATE library SET listed=0 WHERE code=?',code)}catch{}
  return json({revoked:true});
 }
 if(!row||(row.revoked&&row.owner_uid!==user.uid))fail(404,'This share link was turned off or doesn’t exist. Ask the teacher who shared it for a new link.','share-missing');
 const template=parse(row.body);
 if(!action&&request.method==='GET')return json({share:{...shareView(row,row.owner_name),mine:row.owner_uid===user.uid},activity:template});
 if(action==='copy'&&request.method==='POST'){
  if(row.owner_uid!==user.uid)await run(db,'UPDATE shares SET copies=copies+1 WHERE code=?',code);
  return json({activity:template,sharedBy:row.owner_name,code});
 }
 fail(405,'Unsupported method.');
}
