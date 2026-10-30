const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const list=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const equal=(a,b)=>JSON.stringify(stable(a??null))===JSON.stringify(stable(b??null));
const parse=s=>JSON.parse(s);
export async function groupForUser(db,postId,uid){
 try{return await one(db,'SELECT g.* FROM project_groups g JOIN project_group_members m ON m.group_id=g.id WHERE m.post_id=? AND m.uid=?',postId,uid)}catch(e){if(/no such table/i.test(String(e.message)))return null;throw e}
}
async function members(db,id){return list(db,'SELECT u.uid,u.name FROM project_group_members m JOIN users u ON u.uid=m.uid WHERE m.group_id=? ORDER BY m.joined_at,m.uid',id)}
async function publicGroup(db,g){return {id:g.id,name:g.name,revision:g.revision,maxMembers:g.max_members,draft:parse(g.draft),members:await members(db,g.id)}}
export async function groupsForOwner(db,postId){
 const groups=await list(db,'SELECT * FROM project_groups WHERE post_id=? ORDER BY name,id',postId);
 return Promise.all(groups.map(async g=>({...await publicGroup(db,g),code:g.code})));
}
function mergedBoard(base,local,remote,fail){
 const result=structuredClone(remote);
 for(const field of ['place','conns']){
  result[field]=result[field]||{};
  for(const key of new Set([...Object.keys(base[field]),...Object.keys(local[field])])){
   const was=base[field][key],next=local[field][key],current=remote[field]?.[key];
   if(equal(was,next))continue;
   if(!equal(current,was)&&!equal(current,next))fail(409,'A teammate changed the same tile or connection. Save a copy of your edits, then load the shared board.','group-conflict');
   if(next===undefined)delete result[field][key];else result[field][key]=next;
  }
 }
 return result;
}
export async function handleGroupRoutes(c){
 const {request,url,db,user,profile,input,fail,json,getGoogle,studentInPost,boardDraft}=c;
 const path=url.pathname;
 if(path==='/api/groups/join'||/^\/api\/posts\/[^/]+\/(?:groups|group)(?:\/(?:draft|leave))?$/.test(path)){try{await one(db,'SELECT id FROM project_groups LIMIT 1')}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'Apply database migration 0003_group_boards.sql to enable shared group boards.','group-setup');throw e}}
 if(path==='/api/groups/join'&&request.method==='POST'){
  const {code}=await input(request),normalized=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!/^[A-F0-9]{12}$/.test(normalized))fail(400,'Enter the 12-character group code from your teacher.');
  const g=await one(db,'SELECT * FROM project_groups WHERE code=?',normalized);
  if(!g)fail(404,'Group code not found.');
  const post=await one(db,'SELECT * FROM posts WHERE id=?',g.post_id);
  if(!post||parse(post.body).asg.open===false)fail(403,'This assignment is closed.');
  const google=await getGoogle();await studentInPost(db,google,user,post);
  const existing=await groupForUser(db,post.id,user.uid);
  if(existing&&existing.id!==g.id)fail(409,'You already belong to another group for this assignment.');
  if(!existing){
   const inserted=await run(db,`INSERT OR IGNORE INTO project_group_members(group_id,post_id,uid,joined_at)
    SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM project_group_members WHERE group_id=?) < ?`,g.id,post.id,user.uid,new Date().toISOString(),g.id,g.max_members);
   if(!inserted.meta.changes){
    const joined=await groupForUser(db,post.id,user.uid);
    if(!joined||joined.id!==g.id)fail(409,'This group is full or you already joined another group.');
   }
  }
  return json({postId:post.id,group:await publicGroup(db,g)});
 }
 const route=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/(groups|group)(?:\/(draft|leave))?$/);
 if(!route)return null;
 const [,postId,kind,action]=route,post=await one(db,'SELECT * FROM posts WHERE id=?',postId);
 if(!post)fail(404,'Assignment not found.');
 if(kind==='groups'){
  if(post.owner_uid!==user.uid||profile.role!=='teacher')fail(403,'Only the assignment owner may manage its groups.');
  if(action)fail(404,'Group route not found.');
  if(request.method==='GET')return json({groups:await groupsForOwner(db,postId),activity:parse(post.body).act});
  if(request.method!=='POST')fail(405,'Unsupported method.');
  if(post.status!=='PUBLISHED')fail(409,'Publish the assignment in Classroom before creating groups.');
  const b=await input(request);
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>60||!Number.isInteger(b.maxMembers)||b.maxMembers<2||b.maxMembers>8)fail(400,'Use a group name and a size between 2 and 8.');
  const g={id:crypto.randomUUID(),post_id:postId,code:crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase(),name:b.name.trim(),max_members:b.maxMembers,draft:JSON.stringify({name:'',place:{},conns:{},view:{},submittedAt:null}),revision:0};
  await run(db,'INSERT INTO project_groups(id,post_id,code,name,max_members,draft,revision,updated_at) VALUES(?,?,?,?,?,?,0,?)',g.id,postId,g.code,g.name,g.max_members,g.draft,new Date().toISOString());
  return json({group:{...await publicGroup(db,g),code:g.code}},201);
 }
 let g=await groupForUser(db,postId,user.uid);
 if(!g)fail(403,'Join a group for this assignment first.','group-access');
 if(!action&&request.method==='GET')return json({group:await publicGroup(db,g)});
 if(action==='leave'&&request.method==='POST'){await run(db,'DELETE FROM project_group_members WHERE post_id=? AND uid=?',postId,user.uid);return json({left:true})}
 if(action!=='draft'||request.method!=='POST')fail(405,'Unsupported method.');
 if(post.status!=='PUBLISHED'||parse(post.body).asg.open===false)fail(403,'This assignment is closed.');
 const b=await input(request),act=parse(post.body).act;
 if(!Number.isInteger(b.revision)||b.revision<0||b.revision>g.revision)fail(400,'The group board revision is invalid.');
 const base=boardDraft(b.base,act),local=boardDraft(b.draft,act);
 for(let attempt=0;attempt<4;attempt++){
  if(attempt)g=await groupForUser(db,postId,user.uid);
  if(!g)fail(403,'You no longer belong to this group.','group-access');
  const merged=mergedBoard(base,local,parse(g.draft),fail);
  let validated;
  try{validated=boardDraft(merged,act)}catch{fail(409,'Two group edits use the same board space. Save a copy of your edits, then load the shared board.','group-conflict')}
  const updated=await run(db,'UPDATE project_groups SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM project_group_members WHERE group_id=? AND uid=?)',JSON.stringify(validated),new Date().toISOString(),g.id,g.revision,g.id,user.uid);
  if(updated.meta.changes){g={...g,draft:JSON.stringify(validated),revision:g.revision+1};return json({group:await publicGroup(db,g)})}
 }
 fail(409,'The group board changed while saving. Save a copy of your edits, then load the shared board.','group-conflict');
}
