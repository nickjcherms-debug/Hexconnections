// 4.15 games for a posting: game mode (points, streaks, badges, levels), timed challenge
// rounds, team races on shared group boards, a class leaderboard, and "Defend the link"
// debates where small groups defend connections and vote for the best defense.
// Settings and round state live in the posting body (asg.game, asg.debate); debate groups,
// defenses and votes live in their own tables. Students never see classmates' real names
// on the leaderboard unless the teacher chooses names; votes are cast on anonymous labels.
import {scoreBoard,nicknames,shortName,BADGES,LEVELS,POINTS,LEVEL_STEP} from './gamescore.js';
import {variantAct,fitDraft,cleanOptions} from './classtools.js';
import {partyPointsForPost} from './party.js';
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const parse=s=>{try{return s?JSON.parse(s):null}catch{return null}};
const NOW=()=>new Date().toISOString();
const text=(v,max)=>typeof v==='string'?v.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim().slice(0,max):'';
const words=t=>String(t||'').trim().split(/\s+/).filter(Boolean).length;
const int=(v,lo,hi,d)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d};
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
const LETTERS=i=>i<26?String.fromCharCode(65+i):String.fromCharCode(64+Math.floor(i/26))+String.fromCharCode(65+i%26);
const GRACE=15000;

export function gameState(info){
  const g=info?.asg?.game||{};
  return {on:g.on===true,leaderboard:['nicknames','names','off'].includes(g.leaderboard)?g.leaderboard:'nicknames',round:g.round||null,rounds:Array.isArray(g.rounds)?g.rounds:[]};
}
export function debateState(info){
  const d=info?.asg?.debate||{};
  return {on:d.on===true,mode:d.mode==='async'?'async':'live',size:int(d.size,2,6,4),round:d.round||null,past:Array.isArray(d.past)?d.past:[],stats:d.stats&&typeof d.stats==='object'?d.stats:{}};
}
function shuffle(list){const a=list.slice();for(let i=a.length-1;i>0;i--){const r=new Uint32Array(1);crypto.getRandomValues(r);const j=r[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function chunks(list,size){const k=Math.max(1,Math.round(list.length/size)),out=Array.from({length:k},()=>[]);list.forEach((x,i)=>out[i%k].push(x));return out}

/* Everyone in the posting with the board they are working on (their own, or their team's). */
function ownBoard(s){
  const d=parse(s.draft);if(d)return d;
  const p=parse(s.payload);return p?{place:p.placements||{},conns:Object.fromEntries((p.connections||[]).map(c=>[c.a+'-'+c.b,{why:c.why}]))}:{place:{},conns:{}};
}
// A student's points: their own board plus, on a team, the team's shared board.
export function studentScore(act,own,teamAct,teamDraft,game,extra){
  const a=scoreBoard(act,own,game,extra);if(!teamDraft)return {...a,own:a.points,teamPoints:0};
  const t=scoreBoard(teamAct,teamDraft,game,null),points=a.points+t.points;
  const level=Math.min(LEVELS.length,1+Math.floor(points/LEVEL_STEP));
  const rounds=a.rounds.map(r=>{const x=t.rounds.find(y=>y.id===r.id);const count=r.count+(x?x.count:0);return {...r,count,hit:r.hit||(x&&x.hit)||count>=r.target}});
  return {...a,points,level,levelName:LEVELS[level-1],nextAt:level<LEVELS.length?level*LEVEL_STEP:null,badges:[...new Set([...a.badges,...t.badges])],streak:Math.max(a.streak,t.streak),best:Math.max(a.best,t.best),
    links:a.links+t.links,rounds,own:a.points,teamPoints:t.points};
}
async function classBoards(db,post,info){
  const subs=await rows(db,'SELECT s.uid,s.draft,s.payload,s.variant,u.name FROM submissions s JOIN users u ON u.uid=s.uid WHERE s.post_id=?',post.id);
  let groups=[],members=[];
  try{groups=await rows(db,'SELECT id,name,draft,updated_at FROM project_groups WHERE post_id=? ORDER BY name,id',post.id);members=await rows(db,'SELECT group_id,uid FROM project_group_members WHERE post_id=?',post.id)}catch{}
  const groupOf=new Map(members.map(m=>[m.uid,m.group_id])),gById=new Map(groups.map(g=>[g.id,{...g,draft:parse(g.draft)||{}}]));
  const out=[];
  for(const s of subs){
    const gid=groupOf.get(s.uid),g=gid&&gById.get(gid),act=variantAct(info,s.variant);
    out.push({uid:s.uid,name:s.name,act,own:fitDraft(ownBoard(s),act),teamAct:info.act,teamDraft:g?g.draft:null,team:g?{id:g.id,name:g.name}:null});
  }
  return {students:out,groups:[...gById.values()],groupOf};
}
function raceResults(info,game,groups,boards){
  const list=groups.map(g=>{
    const sc=scoreBoard(info.act,g.draft,game,null);
    const mem=boards.filter(b=>b.team&&b.team.id===g.id);
    return {id:g.id,name:g.name,members:mem.map(m=>m.name),points:sc.points,links:sc.links,placed:sc.placed,terms:sc.terms,oneBoard:sc.oneBoard,complete:sc.allIn&&sc.oneBoard,finishedAt:sc.allIn&&sc.oneBoard?(sc.finishedAt?new Date(sc.finishedAt).toISOString():g.updated_at):null};
  }).filter(t=>t.members.length);
  list.sort((x,y)=>(y.complete-x.complete)||(x.complete?String(x.finishedAt).localeCompare(String(y.finishedAt)):0)||(y.placed+y.links)-(x.placed+x.links)||y.points-x.points);
  list.forEach((t,i)=>{t.rank=i+1;t.winner=i===0&&t.complete});
  return list;
}

/* One round's defenses and votes (optionally just one group), with vote counts and winners. */
async function roundData(db,postId,n,grp,withVotes){
  const entries=grp==null?await rows(db,'SELECT uid,grp,pair,defense FROM debate_entries WHERE post_id=? AND round=?',postId,n)
    :await rows(db,'SELECT uid,grp,pair,defense FROM debate_entries WHERE post_id=? AND round=? AND grp=?',postId,n,grp);
  const votes=withVotes?await rows(db,'SELECT voter_uid,target_uid FROM debate_votes WHERE post_id=? AND round=?',postId,n):[];
  const groups={};for(const e of entries)(groups[e.grp]||(groups[e.grp]=[])).push({...e,votes:0});
  for(const v of votes)for(const list of Object.values(groups)){const e=list.find(x=>x.uid===v.target_uid);if(e)e.votes++}
  for(const list of Object.values(groups)){const top=Math.max(0,...list.map(e=>e.votes));for(const e of list)e.winner=top>0&&e.votes===top}
  return {groups,votes};
}
// Results are added up once, when a round's results are shown (or the round ends), and kept with
// the posting, so polling never re-reads every past round (keeps classes within D1's free reads).
async function tally(db,postId,deb,r,full){
  if(!r||r.tallied)return;
  const {groups,votes}=await roundData(db,postId,r.n,null,true);
  const stats=deb.stats;const st=u=>stats[u]||(stats[u]={wins:0,votes:0,cast:0,rounds:0});
  for(const v of votes){const x=st(v.voter_uid);x.cast++;x.rounds++}
  if(full)for(const list of Object.values(groups))for(const e of list){if(e.votes)st(e.uid).votes+=e.votes;if(e.winner)st(e.uid).wins++}
  r.tallied=true;
}
const ZERO={wins:0,votes:0,cast:0,rounds:0};
async function labelled(postId,n,list){
  const keyed=[];for(const e of list)keyed.push({...e,key:await sha(postId+':'+n+':'+e.uid)});
  keyed.sort((a,b)=>a.key<b.key?-1:1);keyed.forEach((e,i)=>{e.label=LETTERS(i)});return keyed;
}
// Explained connections a student can defend: their own board and their team's board.
async function linksFor(db,postId,uid,me){
  const g=await one(db,'SELECT g.draft FROM project_groups g JOIN project_group_members m ON m.group_id=g.id WHERE m.post_id=? AND m.uid=?',postId,uid).catch(()=>null);
  const out=new Map();
  for(const board of [ownBoard(me),g?parse(g.draft):null]){
    if(!board)continue;
    for(const [k,c] of Object.entries(board.conns||{}))if(c&&String(c.why||'').trim()&&board.place?.[k.split('-')[0]]&&board.place?.[k.split('-')[1]]&&!out.has(k))out.set(k,{pair:k,why:String(c.why).slice(0,600)});
  }
  return [...out.values()];
}
async function ensureMember(db,postId,uid){
  const m=await one(db,'SELECT grp FROM debate_members WHERE post_id=? AND uid=?',postId,uid);
  if(m)return m.grp;
  const sizes=await rows(db,'SELECT grp,COUNT(*) AS n FROM debate_members WHERE post_id=? GROUP BY grp ORDER BY n,grp',postId);
  const grp=sizes.length?sizes[0].grp:0;
  await run(db,'INSERT OR IGNORE INTO debate_members(post_id,uid,grp) VALUES(?,?,?)',postId,uid,grp);
  return (await one(db,'SELECT grp FROM debate_members WHERE post_id=? AND uid=?',postId,uid)).grp;
}

export async function handleGameRoutes(c){
  const {request,url,db,user,profile,input,fail,json}=c,path=url.pathname,method=request.method;
  const m=path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/(game|debate)(?:\/(settings|round|teams|groups|defend|vote))?$/);
  if(!m)return null;
  const [,id,kind,action]=m;
  try{await one(db,'SELECT post_id FROM debate_members LIMIT 1')}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'The site owner needs to apply database migration 0009_games.sql.','games-setup');throw e}
  const post=await one(db,'SELECT * FROM posts WHERE id=?',id);
  if(!post)fail(404,'Assignment not found.');
  const info=parse(post.body)||{},mine=post.owner_uid===user.uid&&profile.role==='teacher';
  const me=mine?null:await one(db,'SELECT uid,draft,payload,variant FROM submissions WHERE post_id=? AND uid=?',id,user.uid);
  if(!mine&&!me)fail(404,'Assignment not found.');
  let game=gameState(info),deb=debateState(info);
  const save=async()=>{info.asg={...(info.asg||{}),game,debate:deb};await run(db,'UPDATE posts SET body=? WHERE id=? AND owner_uid=?',JSON.stringify(info),id,user.uid)};
  const teacherOnly=()=>{if(!mine)fail(403,'Only the teacher can change the game.','teacher-required');if(method!=='POST')fail(405,'Unsupported method.')};
  const termIds=new Set((info.act?.terms||[]).map(t=>String(t.id||t.n)));

  /* ---------- game mode ---------- */
  if(kind==='game'&&action==='settings'){
    teacherOnly();const b=await input(request);
    if(typeof b.on==='boolean')game.on=b.on;
    if(['nicknames','names','off'].includes(b.leaderboard))game.leaderboard=b.leaderboard;
    await save();return json({game});
  }
  if(kind==='game'&&action==='round'){
    teacherOnly();const b=await input(request),now=Date.now();
    const close=()=>{if(game.round){const r=game.round;if(Date.parse(r.endsAt)>now)r.endsAt=new Date(now).toISOString();game.rounds=[...game.rounds,r].slice(-30);game.round=null}};
    if(b.action==='start'){
      if(!game.on)fail(400,'Turn on game mode first.','game-off');
      close();const seconds=int(b.seconds,30,1800,180);
      game.round={id:crypto.randomUUID().slice(0,8),target:int(b.target,1,30,5),seconds,startedAt:new Date(now).toISOString(),endsAt:new Date(now+seconds*1000).toISOString()};
    }else if(b.action==='stop')close();
    else fail(400,'Choose start or stop.');
    await save();return json({game,now:NOW()});
  }
  if(kind==='game'&&action==='teams'){
    teacherOnly();if(post.status!=='PUBLISHED')fail(409,'Publish the assignment before making teams.');
    const b=await input(request),size=int(b.size,2,6,3);
    const taken=new Set((await rows(db,'SELECT uid FROM project_group_members WHERE post_id=?',id)).map(r=>r.uid));
    const free=(await rows(db,'SELECT uid FROM submissions WHERE post_id=?',id)).map(r=>r.uid).filter(u=>!taken.has(u)&&u!==post.owner_uid);
    if(free.length<2)fail(400,'Teams need at least two students who have opened the assignment and aren’t on a team yet.','teams-too-few');
    const existing=(await one(db,'SELECT COUNT(*) AS n FROM project_groups WHERE post_id=?',id)).n||0,teams=chunks(shuffle(free),size);
    const empty=JSON.stringify({name:'',place:{},conns:{},view:{},submittedAt:null});
    for(let i=0;i<teams.length;i++){
      const gid=crypto.randomUUID(),code=crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase();
      await run(db,'INSERT INTO project_groups(id,post_id,code,name,max_members,draft,revision,updated_at) VALUES(?,?,?,?,?,?,0,?)',gid,id,code,'Team '+(existing+i+1),Math.min(8,Math.max(2,teams[i].length+1)),empty,NOW());
      for(const u of teams[i])await run(db,'INSERT OR IGNORE INTO project_group_members(group_id,post_id,uid,joined_at) VALUES(?,?,?,?)',gid,id,u,NOW());
    }
    return json({teams:teams.length,students:free.length},201);
  }

  /* ---------- debate ---------- */
  const shuffleGroups=async size=>{
    const kids=(await rows(db,'SELECT uid FROM submissions WHERE post_id=?',id)).map(r=>r.uid).filter(u=>u!==post.owner_uid);
    await run(db,'DELETE FROM debate_members WHERE post_id=?',id);
    const gs=chunks(shuffle(kids),size);
    for(let g=0;g<gs.length;g++)for(const u of gs[g])await run(db,'INSERT INTO debate_members(post_id,uid,grp) VALUES(?,?,?)',id,u,g);
    return gs.filter(g=>g.length).length;
  };
  if(kind==='debate'&&action==='settings'){
    teacherOnly();const b=await input(request);
    if(typeof b.on==='boolean')deb.on=b.on;
    if(b.mode==='live'||b.mode==='async')deb.mode=b.mode;
    if(b.size!=null)deb.size=int(b.size,2,6,4);
    if(deb.on&&!(await one(db,'SELECT uid FROM debate_members WHERE post_id=? LIMIT 1',id)))await shuffleGroups(deb.size);
    await save();return json({debate:deb});
  }
  if(kind==='debate'&&action==='groups'){
    teacherOnly();const b=await input(request);deb.size=int(b.size,2,6,deb.size);
    if(deb.round&&deb.round.phase!=='results')fail(409,'Finish the current round before making new groups.','debate-busy');
    const n=await shuffleGroups(deb.size);await save();return json({groups:n,debate:deb});
  }
  if(kind==='debate'&&action==='round'){
    teacherOnly();const b=await input(request),now=Date.now(),r=deb.round;
    const until=s=>s?new Date(now+int(s,15,3600,120)*1000).toISOString():null;
    if(b.action==='start'){
      if(!deb.on)fail(400,'Turn on the debate first.','debate-off');
      if(r){await tally(db,id,deb,r,false);deb.past=[...deb.past,{n:r.n,pairMode:r.pairMode,pair:r.pair,prompt:r.prompt}].slice(-40);}
      const pairMode=b.pairMode==='same'?'same':'own';let pair=null;
      if(pairMode==='same'){const p=String(b.pair||'').split('-');if(p.length!==2||p[0]===p[1]||!p.every(x=>termIds.has(x)))fail(400,'Choose two terms for everyone to connect.');pair=Number(p[0])<Number(p[1])?p[0]+'-'+p[1]:p[1]+'-'+p[0]}
      const last=Math.max(0,...deb.past.map(x=>x.n||0));
      deb.round={n:last+1,phase:'defend',pairMode,pair,prompt:text(b.prompt,200),startedAt:new Date(now).toISOString(),endsAt:deb.mode==='live'?until(b.seconds||120):null};
    }else if(!r)fail(409,'Start a round first.','debate-no-round');
    else if(b.action==='vote'){r.phase='vote';r.endsAt=deb.mode==='live'?until(b.seconds||60):null}
    else if(b.action==='results'){await tally(db,id,deb,r,true);r.phase='results';r.endsAt=null}
    else if(b.action==='end'){await tally(db,id,deb,r,false);deb.past=[...deb.past,{n:r.n,pairMode:r.pairMode,pair:r.pair,prompt:r.prompt}].slice(-40);deb.round=null}
    else fail(400,'Choose start, vote, results or end.');
    await save();return json({debate:deb,now:NOW()});
  }
  if(kind==='debate'&&(action==='defend'||action==='vote')){
    if(mine)fail(403,'Students defend and vote; you run the rounds.');
    if(method!=='POST')fail(405,'Unsupported method.');
    const r=deb.round;if(!deb.on||!r)fail(409,'There’s no debate round open right now.','debate-no-round');
    const late=r.endsAt&&Date.now()>Date.parse(r.endsAt)+GRACE;
    const grp=await ensureMember(db,id,user.uid),b=await input(request);
    if(action==='defend'){
      if(r.phase!=='defend')fail(409,'Defenses are closed for this round.','debate-closed');
      if(late)fail(409,'Time’s up for this round.','debate-time');
      const defense=text(b.defense,600);if(words(defense)<5)fail(400,'Write at least five words to defend the connection.');
      let pair=r.pair;
      if(r.pairMode==='own'){
        const k=String(b.pair||'');
        if(!(await linksFor(db,id,user.uid,me)).some(l=>l.pair===k))fail(400,'Choose one of the connections you explained on your board.','debate-pair');
        pair=k;
      }
      await run(db,`INSERT INTO debate_entries(post_id,round,uid,grp,pair,defense,created_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(post_id,round,uid) DO UPDATE SET pair=excluded.pair,defense=excluded.defense,grp=excluded.grp`,id,r.n,user.uid,grp,pair,defense,NOW());
      return json({saved:true});
    }
    const list=await rows(db,'SELECT uid FROM debate_entries WHERE post_id=? AND round=? AND grp=?',id,r.n,grp);
    const size=(await one(db,'SELECT COUNT(*) AS n FROM debate_members WHERE post_id=? AND grp=?',id,grp)).n;
    const open=r.phase==='vote'||(deb.mode==='async'&&r.phase==='defend'&&list.length>=size&&size>=2);
    if(!open)fail(409,'Voting isn’t open yet.','debate-vote-closed');
    if(r.phase==='vote'&&late)fail(409,'Time’s up for voting.','debate-time');
    const target=(await labelled(id,r.n,list)).find(e=>e.label===String(b.label||''));
    if(!target)fail(404,'Choose one of the defenses.');
    if(target.uid===user.uid)fail(400,'Vote for a classmate’s defense, not your own.','debate-self');
    await run(db,`INSERT INTO debate_votes(post_id,round,voter_uid,target_uid,created_at) VALUES(?,?,?,?,?)
      ON CONFLICT(post_id,round,voter_uid) DO UPDATE SET target_uid=excluded.target_uid,created_at=excluded.created_at`,id,r.n,user.uid,target.uid,NOW());
    return json({voted:target.label});
  }
  if(action||method!=='GET')fail(405,'Unsupported method.');

  /* ---------- read: teacher console or student view ---------- */
  const publicGame={on:game.on,leaderboard:game.leaderboard,round:game.round,rounds:game.rounds};
  const publicDebate={on:deb.on,mode:deb.mode,size:deb.size,round:deb.round?{...deb.round,tallied:undefined}:null,past:deb.past.length};
  const terms=(info.act?.terms||[]).map(t=>({id:t.id||t.n,term:t.term}));
  const head={title:info.act?.title||'',className:info.cls?.name||'',code:info.asg?.code||''};
  const statsOf=u=>deb.stats[u]||ZERO;
  if(mine){
    const {students,groups}=await classBoards(db,post,info);
    const race=raceResults(info,game,groups,students),winTeam=race.find(t=>t.winner)?.id;
    const keys=[];for(const s of students)keys.push(await sha(id+':nick:'+s.uid));
    const order=students.map((s,i)=>({s,k:keys[i]})).sort((a,b)=>a.k<b.k?-1:1),nicks=nicknames(order.map(x=>x.k)),nick=new Map(order.map((x,i)=>[x.s.uid,nicks[i]]));
    const standings=students.map(s=>{
      const sc=studentScore(s.act,s.own,s.teamAct,s.teamDraft,game,{debate:statsOf(s.uid),raceWinner:!!s.team&&s.team.id===winTeam});
      const cur=game.round&&sc.rounds.find(r=>r.id===game.round.id);
      return {uid:s.uid,name:s.name,nick:nick.get(s.uid),points:sc.points,level:sc.level,levelName:sc.levelName,badges:sc.badges,streak:sc.streak,best:sc.best,links:sc.links,placed:sc.placed,terms:sc.terms,team:s.team?.name||null,round:cur?{count:cur.count,hit:cur.hit}:null,debate:statsOf(s.uid),breakdown:sc.breakdown};
    }).sort((a,b)=>b.points-a.points||String(a.name).localeCompare(String(b.name)));
    standings.forEach((s,i)=>{s.rank=i+1});
    const names=new Map(students.map(s=>[s.uid,s.name]));
    const members=await rows(db,'SELECT uid,grp FROM debate_members WHERE post_id=? ORDER BY grp',id);
    let debateView=null;
    if(deb.round){
      const r=deb.round,rd=await roundData(db,id,r.n,null,true),cur=rd.groups,voted=new Set(rd.votes.map(v=>v.voter_uid));
      const byGrp={};for(const mm of members)(byGrp[mm.grp]||(byGrp[mm.grp]=[])).push(mm.uid);
      debateView=[];
      for(const [g,uids] of Object.entries(byGrp)){
        const ents=await labelled(id,r.n,cur[g]||[]);
        debateView.push({grp:Number(g),members:uids.map(u=>({uid:u,name:names.get(u)||'Student',defended:ents.some(e=>e.uid===u),voted:voted.has(u)})),
          entries:ents.map(e=>({label:e.label,name:names.get(e.uid)||'Student',pair:e.pair,defense:e.defense,votes:e.votes,winner:r.phase==='results'&&e.winner}))});
      }
    }
    return json({...head,party:await partyPointsForPost(db,id),game:publicGame,debate:publicDebate,terms,standings,teams:race,debateGroups:members.length?Math.max(...members.map(x=>x.grp))+1:0,debateView,badges:BADGES,levels:LEVELS,points:POINTS,now:NOW()});
  }
  // Student
  const out={...head,game:publicGame,debate:publicDebate,terms,badges:BADGES,levels:LEVELS,points:POINTS,now:NOW(),me:{debate:statsOf(user.uid),raceWinner:false,team:null}};
  if(game.on||deb.on){
    const vAct=variantAct(info,me.variant),tg=await one(db,'SELECT g.id,g.name,g.draft FROM project_groups g JOIN project_group_members m ON m.group_id=g.id WHERE m.post_id=? AND m.uid=?',id,user.uid).catch(()=>null);
    const myOwn=fitDraft(ownBoard(me),vAct),myTeam=tg?parse(tg.draft):null;
    out.me.ownBoard=scoreBoard(vAct,myOwn,game,{debate:out.me.debate});
    out.me.score=studentScore(vAct,myOwn,info.act,myTeam,game,{debate:out.me.debate});
    const team=await one(db,'SELECT g.id,g.name FROM project_groups g JOIN project_group_members m ON m.group_id=g.id WHERE m.post_id=? AND m.uid=?',id,user.uid).catch(()=>null);
    if(team)out.me.team=team.name;
    if(url.searchParams.get('board')==='1'){
      const {students,groups}=await classBoards(db,post,info);
      const race=raceResults(info,game,groups,students),winTeam=race.find(t=>t.winner)?.id;
      out.me.raceWinner=!!team&&team.id===winTeam;
      if(out.me.raceWinner){out.me.ownBoard=scoreBoard(vAct,myOwn,game,{debate:out.me.debate,raceWinner:true});out.me.score=studentScore(vAct,myOwn,info.act,myTeam,game,{debate:out.me.debate,raceWinner:true});}
      out.teams=race.map(t=>({name:t.name,rank:t.rank,complete:t.complete,winner:t.winner,links:t.links,placed:t.placed,terms:t.terms,mine:!!team&&t.id===team.id,size:t.members.length}));
      if(game.leaderboard!=='off'){
        const keys=[];for(const s of students)keys.push(await sha(id+':nick:'+s.uid));
        const order=students.map((s,i)=>({s,k:keys[i]})).sort((a,b)=>a.k<b.k?-1:1),nicks=nicknames(order.map(x=>x.k)),nick=new Map(order.map((x,i)=>[x.s.uid,nicks[i]]));
        const all=students.map(s=>({uid:s.uid,name:game.leaderboard==='names'?shortName(s.name):nick.get(s.uid),points:studentScore(s.act,s.own,s.teamAct,s.teamDraft,game,{debate:statsOf(s.uid),raceWinner:!!s.team&&s.team.id===winTeam}).points}))
          .sort((a,b)=>b.points-a.points||String(a.name).localeCompare(String(b.name)));
        all.forEach((s,i)=>{s.rank=i+1});
        const mineRow=all.find(s=>s.uid===user.uid);
        out.leaderboard={top:all.slice(0,10).map(s=>({rank:s.rank,name:s.name,points:s.points,mine:s.uid===user.uid})),myRank:mineRow?mineRow.rank:null,myName:mineRow?mineRow.name:null,total:all.length};
      }
    }
  }
  if(deb.on&&deb.round){
    const r=deb.round,grp=await ensureMember(db,id,user.uid);
    const size=(await one(db,'SELECT COUNT(*) AS n FROM debate_members WHERE post_id=? AND grp=?',id,grp)).n;
    const ents=await labelled(id,r.n,(await roundData(db,id,r.n,grp,r.phase==='results')).groups[grp]||[]);
    const myVote=await one(db,'SELECT target_uid FROM debate_votes WHERE post_id=? AND round=? AND voter_uid=?',id,r.n,user.uid);
    const voteOpen=r.phase==='vote'||(deb.mode==='async'&&r.phase==='defend'&&ents.length>=size&&size>=2);
    const names=r.phase==='results'?new Map((await rows(db,'SELECT uid,name FROM users WHERE uid IN (SELECT uid FROM debate_entries WHERE post_id=? AND round=? AND grp=?)',id,r.n,grp)).map(u=>[u.uid,u.name])):null;
    const myEntry=ents.find(e=>e.uid===user.uid);
    let myLinks=null;
    if(r.pairMode==='own'&&r.phase==='defend'){
      myLinks=await linksFor(db,id,user.uid,me);
    }
    out.round={n:r.n,phase:r.phase,myLinks,noPaste:cleanOptions(info.asg?.options,info.act).noPaste,pairMode:r.pairMode,pair:r.pair,prompt:r.prompt||'',endsAt:r.endsAt,groupSize:size,defended:ents.length,voteOpen,
      myEntry:myEntry?{label:myEntry.label,pair:myEntry.pair,defense:myEntry.defense}:null,
      myVote:myVote?(ents.find(e=>e.uid===myVote.target_uid)||{}).label||null:null,
      ballot:voteOpen||r.phase==='results'?ents.map(e=>({label:e.label,pair:e.pair,defense:e.defense,mine:e.uid===user.uid,
        ...(r.phase==='results'?{votes:e.votes,winner:e.winner,name:e.winner?shortName(names.get(e.uid)):null}:{})})):null};
  }
  return json(out);
}
