// Small pictures on hexagons. The browser resizes each image (about 320 px) before
// upload; the server stores it in D1 and serves it at an unguessable public address,
// so students' boards and printed tiles can show it without signing in.
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const NOW=()=>new Date().toISOString();
const MAX_BYTES=180*1024, MAX_PER_TEACHER=600;
const ALPHA='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function newId(){const b=crypto.getRandomValues(new Uint8Array(24));return Array.from(b,x=>ALPHA[x%ALPHA.length]).join('')}
export async function serveImage(env,id){
  const row=env?.DB?await env.DB.prepare('SELECT mime,data FROM images WHERE id=?').bind(id).first().catch(()=>null):null;
  if(!row)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const bin=Uint8Array.from(atob(row.data),c=>c.charCodeAt(0));
  return new Response(bin,{headers:{'Content-Type':row.mime,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
export async function handleImageRoutes(c){
  const {request,url,db,user,profile,input,fail,json}=c;
  if(url.pathname!=='/api/images'||request.method!=='POST')return null;
  if(profile.role!=='teacher')fail(403,'Only teachers can add pictures.','teacher-required');
  try{await one(db,'SELECT id FROM images LIMIT 1')}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'The site owner needs to apply database migration 0008_images_roster.sql.','tools-setup');throw e}
  const b=await input(request);
  const m=typeof b.data==='string'&&b.data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!m)fail(400,'Choose a PNG, JPEG or WebP picture.');
  const bytes=Math.floor(m[2].length*3/4);
  if(bytes>MAX_BYTES)fail(413,'That picture is too large. Try a smaller one.');
  const n=await one(db,'SELECT COUNT(*) AS n FROM images WHERE owner_uid=?',user.uid);
  if((n?.n||0)>=MAX_PER_TEACHER)fail(429,'You’ve reached the picture limit for your account.');
  const id=newId();
  await run(db,'INSERT INTO images(id,owner_uid,mime,data,bytes,created_at) VALUES(?,?,?,?,?,?)',id,user.uid,m[1],m[2],bytes,NOW());
  return json({id,url:'/api/img/'+id},201);
}
