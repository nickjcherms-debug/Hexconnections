const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const parse=s=>JSON.parse(s);
function card(p,s={}){
 const info=parse(p.body);
 return {id:p.id,activityId:p.activity_id,classId:p.class_id,title:info.act.title,className:info.cls.name,courseId:p.course_id,courseName:info.courseName||info.cls.name,manual:String(p.course_id||'').startsWith('manual:'),code:info.asg.code||'',classroomUrl:p.classroom_url,status:p.status,due:info.asg.due||'',open:info.asg.open!==false,
 submissions:Number(p.submission_count||0),turnedIn:Number(p.turned_in_count||0),...s};
}
export async function handleDashboardRoutes(c){
 const {request,url,db,user,profile,json,fail,getGoogle,allPages,studentInPost}=c;
 if(request.method!=='GET')return null;
 if(url.pathname==='/api/teacher/dashboard'){
  if(profile.role!=='teacher')fail(403,'This is for teacher accounts only.','teacher-required');
  const posts=await rows(db,`SELECT p.*,COUNT(s.payload) AS submission_count,
   SUM(CASE WHEN s.status IN ('TURNED_IN','GRADED') THEN 1 ELSE 0 END) AS turned_in_count
   FROM posts p LEFT JOIN submissions s ON s.post_id=p.id WHERE p.owner_uid=? GROUP BY p.id ORDER BY p.created_at DESC`,user.uid);
  return json({assignments:posts.map(p=>card(p))});
 }
 if(url.pathname!=='/api/student/dashboard')return null;
 let posts;
 const connected=!!request.headers.get('X-Classroom-Token');
 if(connected){
  const g=await getGoogle(),courses=await allPages(g,'/courses?courseStates=ACTIVE&studentId=me&pageSize=100','courses');
  posts=await rows(db,"SELECT p.* FROM posts p JOIN submissions s ON s.post_id=p.id WHERE s.uid=? AND p.status=? AND p.course_id LIKE 'manual:%'",user.uid,'PUBLISHED');
  for(const course of courses){
   const candidates=await rows(db,'SELECT * FROM posts WHERE course_id=? AND status=?',course.id,'PUBLISHED');
   for(const p of candidates){
    if(parse(p.body).asg.open===false)continue;
    try{await studentInPost(db,g,user,p);posts.push(p)}catch(e){if(e.status!==403&&e.status!==404)throw e}
   }
  }
 }else posts=await rows(db,'SELECT p.* FROM posts p JOIN submissions s ON s.post_id=p.id WHERE s.uid=? AND p.status=?',user.uid,'PUBLISHED');
 const assignments=[];
 for(const post of posts){
  if(parse(post.body).asg.open===false)continue;
  const s=await db.prepare('SELECT status,grade,classroom_status FROM submissions WHERE post_id=? AND uid=?').bind(post.id,user.uid).first();
  assignments.push(card(post,{status:s?.status||'DRAFT',classroomStatus:s?.classroom_status||'NEW',grade:s?.grade??null}));
 }
 const done=a=>a.classroomStatus==='TURNED_IN'||a.status==='GRADED'||(a.classroomStatus==='RETURNED'&&a.grade!==null);
 return json({active:assignments.filter(a=>!done(a)),submitted:assignments.filter(done),needsClassroom:!connected});
}
