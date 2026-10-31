// 4.18 Hex Party: a Jackbox-style class game built from a Hex Space's terms.
// The teacher's screen is the host (projector); students join on their own devices with a
// five-letter room code. Each round: everyone answers, everyone votes, points are revealed.
// Points go to each player and add up to one shared class score with a goal.
// Rounds: Link Lightning (explain a connection, best one wins), Hex Bluff (write a fake
// definition, spot the real one), Odd Hex Out (pick the term that doesn't belong and say why),
// Head-to-head (two answers face off on the projector).
// Names never appear on the projector: players get fun nicknames; answers show without authors.
import {nicknames} from './gamescore.js';
const one=(db,sql,...a)=>db.prepare(sql).bind(...a).first();
const rows=async(db,sql,...a)=>(await db.prepare(sql).bind(...a).all()).results;
const run=(db,sql,...a)=>db.prepare(sql).bind(...a).run();
const parse=s=>{try{return s?JSON.parse(s):null}catch{return null}};
const NOW=()=>new Date().toISOString();
const text=(v,max)=>typeof v==='string'?v.replace(/\r?\n+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const int=(v,lo,hi,d)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d};
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
function rand(n){const r=new Uint32Array(1);crypto.getRandomValues(r);return r[0]%n}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}

export const KINDS={link:'Link Lightning',bluff:'Hex Bluff',odd:'Odd Hex Out',h2h:'Head-to-head'};
export const PTS={answer:50,vote:25,perVote:100,sweep:100,guessReal:200,fooled:100};
const MAX_PLAYERS=80,BALLOT=6,DUELS=4,CODE_CHARS='BCDFGHJKLMNPQRSTVWXZ';

/* ---------- classroom-friendly filter ---------- */
// Whole words only (so science words like "thorny", "retardant" or "sex cells" stay allowed);
// the teacher can hide anything else with one tap.
const BLOCK=['fuck','fucking','fucker','fck','fuk','shit','shitty','sht','bitch','biatch','cunt','cock','dick','dik','pussy','asshole','arsehole','bastard','slut','whore','fag','faggot','retard','retarded','nigger','nigga','spic','chink','kike','tranny','twat','wank','wanker','jizz','porn','sexy','boobs','tits','titty','kys','douche','bollocks','prick','motherfucker','bullshit','dumbass','jackass','stfu','wtf','milf','horny','nudes','dildo'];
const LEET={'0':'o','1':'i','!':'i','3':'e','4':'a','@':'a','5':'s','$':'s','7':'t','+':'t','8':'b','9':'g'};
export function unfriendly(t){
  const low=String(t||'').toLowerCase().replace(/[01!34@5$7+89]/g,c=>LEET[c]);
  const words=low.split(/[^a-z]+/).filter(Boolean),squashed=words.join('');
  return words.some(w=>BLOCK.includes(w)||BLOCK.includes(w.replace(/(.)\1+/g,'$1')))
    ||['fuck','nigger','faggot','motherfucker','killyourself'].some(b=>squashed.includes(b));
}

/* ---------- prompts ---------- */
function pickPrompt(kind,terms,used){
  const ids=terms.map(t=>String(t.id)),withDef=terms.filter(t=>t.def&&t.def.trim().length>=4).map(t=>String(t.id));
  const fresh=list=>{const f=list.filter(x=>!used.includes(x));return f.length?f:list};
  if(kind==='bluff'&&withDef.length)return {kind,term:fresh(withDef)[rand(fresh(withDef).length)]};
  if(kind==='odd'&&ids.length>=4){const four=shuffle(ids).slice(0,4);return {kind,four}}
  if(kind==='bluff'||kind==='odd')kind='link';
  const pairs=[];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push(ids[i]+'-'+ids[j]);
  const p=fresh(pairs)[rand(fresh(pairs).length)].split('-');return {kind,a:p[0],b:p[1]};
}
function promptKey(p){return p.kind==='bluff'?p.term:p.kind==='odd'?p.four.join(','):p.a+'-'+p.b}

/* ---------- loading ---------- */
async function gameByCode(db,code){return one(db,'SELECT * FROM party_games WHERE code=?',String(code||'').toUpperCase().replace(/[^A-Z]/g,''))}
function unpack(g){return {...g,terms:parse(g.terms)||[],settings:parse(g.settings)||{},state:parse(g.state)||{phase:'lobby'}}}
async function save(db,g,bump=true){
  await run(db,'UPDATE party_games SET state=?,rev=rev+?,status=?,updated_at=? WHERE id=?',JSON.stringify(g.state),bump?1:0,g.state.phase==='end'?'ENDED':'OPEN',NOW(),g.id);
  if(bump)g.rev++;
}
async function answersFor(db,g,n){return rows(db,'SELECT uid,body,pick,hidden FROM party_answers WHERE game_id=? AND round=?',g.id,n)}
async function keyed(g,n,list){const out=[];for(const a of list)out.push({...a,key:(await sha(g.id+':'+n+':'+a.uid)).slice(0,10)});return out.sort((x,y)=>x.key<y.key?-1:1)}
// Each voter sees up to six answers: their place in the list decides which (everyone's answer is seen by about as many voters).
function ballotFor(list,uid,size){
  const others=list.filter(a=>a.uid!==uid&&!a.hidden);if(others.length<=size)return others;
  const me=list.findIndex(a=>a.uid===uid),start=me<0?rand(others.length):me;
  return Array.from({length:size},(_,k)=>others[(start+k)%others.length]);
}

/* ---------- tally a round once, when it is revealed ---------- */
async function tally(db,g){
  const s=g.state,n=s.n;if(!n||s.tallied===n)return;
  const ans=(await keyed(g,n,await answersFor(db,g,n))),votes=await rows(db,'SELECT duel,voter_uid,choice FROM party_votes WHERE game_id=? AND round=?',g.id,n);
  const pts={},add=(u,v)=>{if(v)pts[u]=(pts[u]||0)+v};
  const shown=ans.filter(a=>!a.hidden),byKey=new Map(shown.map(a=>[a.key,a]));
  for(const a of shown)add(a.uid,PTS.answer);
  const voters=new Set(votes.map(v=>v.voter_uid));for(const u of voters)add(u,PTS.vote);
  const count={};
  if(s.kind==='bluff'){
    for(const v of votes){if(v.choice==='REAL')add(v.voter_uid,PTS.guessReal);else{const a=byKey.get(v.choice);if(a&&a.uid!==v.voter_uid){add(a.uid,PTS.fooled);count[a.key]=(count[a.key]||0)+1}}}
  }else if(s.kind==='h2h'){
    for(const [i,d] of (s.duels||[]).entries()){
      const vs=votes.filter(v=>v.duel===i),A=byKey.get(d[0]),B=byKey.get(d[1]);
      const na=vs.filter(v=>v.choice==='A').length,nb=vs.filter(v=>v.choice==='B').length;
      if(A){add(A.uid,na*PTS.perVote+(na>=2&&!nb?PTS.sweep:0));count[A.key]=na}
      if(B){add(B.uid,nb*PTS.perVote+(nb>=2&&!na?PTS.sweep:0));count[B.key]=nb}
    }
  }else{
    for(const v of votes){const a=byKey.get(v.choice);if(a&&a.uid!==v.voter_uid){add(a.uid,PTS.perVote);count[a.key]=(count[a.key]||0)+1}}
  }
  for(const [u,v] of Object.entries(pts))await run(db,'UPDATE party_players SET points=points+? WHERE game_id=? AND uid=?',v,g.id,u);
  const total=Object.values(pts).reduce((a,b)=>a+b,0);
  const top=shown.map(a=>({key:a.key,text:a.body,pick:a.pick||null,votes:count[a.key]||0})).sort((x,y)=>y.votes-x.votes).slice(0,s.kind==='h2h'?8:5);
  const reveal={top,roundPoints:total,mine:pts,answered:shown.length,voted:voters.size};
  if(s.kind==='bluff'){const t=g.terms.find(x=>String(x.id)===s.prompt.term);reveal.real=t?t.def:'';reveal.guessedReal=votes.filter(v=>v.choice==='REAL').length}
  if(s.kind==='odd'){const picks={};for(const a of shown)if(a.pick)picks[a.pick]=(picks[a.pick]||0)+1;reveal.picks=picks}
  if(s.kind==='h2h')reveal.duels=(s.duels||[]).map(d=>d.map(k=>({key:k,text:byKey.get(k)?.body||'',votes:count[k]||0})));
  s.reveal=reveal;s.classPoints=(s.classPoints||0)+total;s.tallied=n;
}

/* ---------- views ---------- */
function termName(g,id){const t=g.terms.find(x=>String(x.id)===String(id));return t?t.term:''}
function publicPrompt(g){
  const p=g.state.prompt;if(!p)return null;
  if(p.kind==='bluff')return {kind:'bluff',term:termName(g,p.term)};
  if(p.kind==='odd')return {kind:'odd',four:p.four.map(id=>({id,term:termName(g,id)}))};
  return {kind:p.kind,a:termName(g,p.a),b:termName(g,p.b)};
}
function publicState(g){
  const s=g.state;
  return {phase:s.phase,n:s.n||0,rounds:(g.settings.playlist||[]).length,kind:s.kind||null,kindName:KINDS[s.kind]||'',prompt:publicPrompt(g),endsAt:s.endsAt||null,duel:s.duel||0,duels:(s.duels||[]).length,classPoints:s.classPoints||0,goal:g.settings.goal||0};
}
async function leaderboard(db,g,limit){
  const list=await rows(db,'SELECT nick,points FROM party_players WHERE game_id=? ORDER BY points DESC,nick LIMIT ?',g.id,limit);
  return list.map((p,i)=>({rank:i+1,nick:p.nick,points:p.points}));
}

export async function handlePartyRoutes(c){
  const {request,url,db,user,profile,input,fail,json}=c,path=url.pathname,method=request.method;
  if(!path.startsWith('/api/party'))return null;
  try{await one(db,'SELECT id FROM party_games LIMIT 1')}catch(e){if(/no such table/i.test(String(e.message)))fail(503,'The site owner needs to apply database migration 0011_party.sql.','party-setup');throw e}
  const teacher=profile.role==='teacher';
  /* ---- teacher: create and list ---- */
  if(path==='/api/party'&&method==='POST'){
    if(!teacher)fail(403,'Only teachers can host a class game.','teacher-required');
    const b=await input(request);let terms=[],title=text(b.title,80),postId=null;
    if(b.postId){
      const post=await one(db,'SELECT * FROM posts WHERE id=? AND owner_uid=?',String(b.postId),user.uid);if(!post)fail(404,'Assignment not found.');
      const info=parse(post.body)||{};terms=(info.act?.terms||[]).map(t=>({id:String(t.id||t.n),term:text(t.term,80),def:text(t.def,300)}));title=title||info.act?.title||'Class game';postId=post.id;
    }else{
      if(!Array.isArray(b.terms)||b.terms.length>80)fail(400,'Choose a Hex Space with up to 80 terms.');
      terms=b.terms.map((t,i)=>({id:String(t?.id??i+1).slice(0,12),term:text(t?.term,80),def:text(t?.def,300)})).filter(t=>t.term);
    }
    if(terms.length<2)fail(400,'A class game needs at least two terms.','party-terms');
    const playlist=(Array.isArray(b.playlist)?b.playlist:[]).filter(k=>KINDS[k]).slice(0,20);
    if(!playlist.length)fail(400,'Choose at least one round.');
    const settings={playlist,answerSecs:int(b.answerSecs,20,300,75),voteSecs:int(b.voteSecs,10,180,30),duelSecs:int(b.duelSecs,8,60,15),goal:int(b.goal,0,1000000,0)};
    // Retire this teacher's older open games (one live game at a time keeps codes short).
    await run(db,"UPDATE party_games SET status='ENDED' WHERE owner_uid=? AND status='OPEN'",user.uid);
    let code='';for(let i=0;i<20;i++){code=Array.from({length:5},()=>CODE_CHARS[rand(CODE_CHARS.length)]).join('');if(!(await one(db,"SELECT id FROM party_games WHERE code=? AND status='OPEN'",code)))break}
    await run(db,"UPDATE party_games SET code=code||'-'||substr(id,1,6) WHERE code=? AND status='ENDED'",code);
    const id=crypto.randomUUID(),state={phase:'lobby',n:0,classPoints:0,used:[]};
    await run(db,'INSERT INTO party_games(id,code,owner_uid,post_id,title,terms,settings,state,rev,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)',id,code,user.uid,postId,title||'Class game',JSON.stringify(terms),JSON.stringify(settings),JSON.stringify(state),'OPEN',NOW(),NOW());
    return json({id,code},201);
  }
  if(path==='/api/party/mine'&&method==='GET'){
    if(!teacher)fail(403,'Only teachers host class games.','teacher-required');
    const list=await rows(db,'SELECT id,code,title,status,state,created_at,(SELECT COUNT(*) FROM party_players p WHERE p.game_id=g.id) AS players FROM party_games g WHERE owner_uid=? ORDER BY created_at DESC LIMIT 10',user.uid);
    return json({games:list.map(g=>({id:g.id,code:g.status==='OPEN'?g.code:'',title:g.title,status:g.status,players:g.players,classPoints:(parse(g.state)||{}).classPoints||0,createdAt:g.created_at}))});
  }
  /* ---- host screen ---- */
  let m=path.match(/^\/api\/party\/host\/([a-f0-9-]{36})(?:\/(next|hide))?$/);
  if(m){
    const raw=await one(db,'SELECT * FROM party_games WHERE id=?',m[1]);
    if(!raw||raw.owner_uid!==user.uid)fail(404,'Game not found.');
    const g=unpack(raw),s=g.state,action=m[2];
    if(action==='next'&&method==='POST'){
      const b=await input(request),now=Date.now(),list=g.settings.playlist||[];
      const until=secs=>new Date(now+secs*1000).toISOString();
      if(g.status!=='OPEN')fail(409,'This game has ended.','party-ended');
      if(b.action==='round'){
        if(['answer','vote'].includes(s.phase))fail(409,'Finish this round first.','party-busy');
        if((s.n||0)>=list.length)fail(409,'That was the last round.','party-done');
        const n=(s.n||0)+1,p=pickPrompt(list[n-1],g.terms,s.used||[]);
        Object.assign(s,{phase:'answer',n,kind:p.kind,prompt:p,endsAt:until(g.settings.answerSecs),duel:0,duels:[],reveal:null});
        s.used=[...(s.used||[]),promptKey(p)].slice(-60);
      }else if(b.action==='vote'){
        if(s.phase!=='answer')fail(409,'Voting starts after answers.','party-phase');
        s.phase='vote';s.endsAt=until(s.kind==='h2h'?g.settings.duelSecs:g.settings.voteSecs);
        if(s.kind==='h2h'){const ans=(await keyed(g,s.n,await answersFor(db,g,s.n))).filter(a=>!a.hidden);const sh=shuffle(ans);s.duels=[];for(let i=0;i+1<sh.length&&s.duels.length<DUELS;i+=2)s.duels.push([sh[i].key,sh[i+1].key]);s.duel=0;
          if(!s.duels.length){await tally(db,g);s.phase='reveal';s.endsAt=null}}
      }else if(b.action==='next-duel'){
        if(s.phase!=='vote'||s.kind!=='h2h')fail(409,'No duel to move on from.','party-phase');
        if(s.duel+1>=(s.duels||[]).length){await tally(db,g);s.phase='reveal';s.endsAt=null}
        else{s.duel++;s.endsAt=until(g.settings.duelSecs)}
      }else if(b.action==='reveal'){
        if(s.phase!=='vote'&&s.phase!=='answer')fail(409,'Nothing to reveal yet.','party-phase');
        await tally(db,g);s.phase='reveal';s.endsAt=null;
      }else if(b.action==='scores'){s.phase='scores';s.endsAt=null}
      else if(b.action==='end'){if(['answer','vote'].includes(s.phase))await tally(db,g);s.phase='end';s.endsAt=null}
      else fail(400,'Unknown step.');
      await save(db,g);
    }else if(action==='hide'&&method==='POST'){
      const b=await input(request),n=s.n;
      const list=await keyed(g,n,await answersFor(db,g,n)),a=list.find(x=>x.key===String(b.key||''));if(!a)fail(404,'Answer not found.');
      await run(db,'UPDATE party_answers SET hidden=? WHERE game_id=? AND round=? AND uid=?',b.hidden===false?0:1,g.id,n,a.uid);
      await save(db,g);
    }else if(action||method!=='GET')fail(405,'Unsupported method.');
    const players=await rows(db,'SELECT p.uid,p.nick,p.points,u.name FROM party_players p LEFT JOIN users u ON u.uid=p.uid WHERE p.game_id=? ORDER BY p.joined_at',g.id);
    let answers=[],votes=0;
    if(s.n){answers=(await keyed(g,s.n,await answersFor(db,g,s.n))).map(a=>({key:a.key,text:a.body,pick:a.pick,hidden:!!a.hidden,name:players.find(p=>p.uid===a.uid)?.name||'Student',nick:players.find(p=>p.uid===a.uid)?.nick||''}));
      votes=(await one(db,'SELECT COUNT(DISTINCT voter_uid) AS n FROM party_votes WHERE game_id=? AND round=? AND duel=?',g.id,s.n,s.duel||0)).n}
    const byKey=new Map(answers.map(a=>[a.key,a]));
    return json({id:g.id,code:g.code,title:g.title,status:g.status,settings:g.settings,kinds:KINDS,state:publicState(g),
      players:players.map(p=>({nick:p.nick,name:p.name||'Student',points:p.points})),answered:answers.length,voted:votes,answers,
      duel:s.phase==='vote'&&s.kind==='h2h'&&s.duels?.[s.duel]?s.duels[s.duel].map(k=>({key:k,text:byKey.get(k)?.text||''})):null,
      ballot:s.phase==='vote'&&s.kind!=='h2h'?answers.filter(a=>!a.hidden).slice(0,12).map(a=>({key:a.key,text:a.text})):null,
      real:s.kind==='bluff'&&s.prompt?(g.terms.find(t=>String(t.id)===s.prompt.term)||{}).def||'':null,
      reveal:s.reveal||null,top:await leaderboard(db,g,8),now:NOW()});
  }
  /* ---- players ---- */
  if(path==='/api/party/join'&&method==='POST'){
    const b=await input(request),raw=await gameByCode(db,b.code);
    if(!raw||raw.status!=='OPEN')fail(404,'No game with that code is running. Check the code on the big screen.','party-not-found');
    if(raw.owner_uid===user.uid)fail(400,'You’re hosting this game. Students join on their own devices.','party-host');
    const have=await one(db,'SELECT nick,points FROM party_players WHERE game_id=? AND uid=?',raw.id,user.uid);
    if(have)return json({code:raw.code,nick:have.nick});
    const n=(await one(db,'SELECT COUNT(*) AS n FROM party_players WHERE game_id=?',raw.id)).n;
    if(n>=MAX_PLAYERS)fail(409,'This game is full.','party-full');
    const taken=new Set((await rows(db,'SELECT nick FROM party_players WHERE game_id=?',raw.id)).map(r=>r.nick));
    const h=await sha(raw.id+':nick:'+user.uid);let nick='';
    for(let i=0;i<40&&(!nick||taken.has(nick));i++)nick=nicknames([(parseInt(h.slice(0,8),16)+i*7919).toString(16)])[0];
    await run(db,'INSERT OR IGNORE INTO party_players(game_id,uid,nick,points,joined_at) VALUES(?,?,?,0,?)',raw.id,user.uid,nick,NOW());
    return json({code:raw.code,nick},201);
  }
  m=path.match(/^\/api\/party\/([A-Za-z]{5})(?:\/(answer|vote))?$/);
  if(!m)fail(404,'Not found.');
  const raw=await gameByCode(db,m[1]);if(!raw)fail(404,'No game with that code.','party-not-found');
  const me=await one(db,'SELECT nick,points FROM party_players WHERE game_id=? AND uid=?',raw.id,user.uid);
  if(!me)fail(403,'Join the game with its code first.','party-join');
  const action=m[2];
  // Screens check in every couple of seconds: when nothing changed, answer with one row read.
  if(!action&&method==='GET'&&url.searchParams.get('rev')===String(raw.rev))return json({same:true,rev:raw.rev});
  const g=unpack(raw),s=g.state,n=s.n;
  const late=s.endsAt&&Date.now()>Date.parse(s.endsAt)+3000;
  if(action==='answer'&&method==='POST'){
    if(s.phase!=='answer')fail(409,'Answers are closed for this round.','party-closed');
    if(late)fail(409,'Time’s up!','party-time');
    const b=await input(request),max=s.kind==='bluff'?160:140,body=text(b.text,max);
    if(body.length<3)fail(400,'Write a few more words.');
    if(unfriendly(body))fail(400,'Let’s keep it classroom-friendly. Try different words.','party-filter');
    let pick=null;
    if(s.kind==='odd'){pick=String(b.pick||'');if(!s.prompt.four.includes(pick))fail(400,'Pick the term that doesn’t belong.')}
    if(s.kind==='bluff'){const real=(g.terms.find(t=>String(t.id)===s.prompt.term)||{}).def||'',norm=x=>x.toLowerCase().replace(/[^a-z0-9]+/g,'');if(real&&(norm(body)===norm(real)||norm(real).length>12&&norm(body).includes(norm(real))))fail(400,'That’s the real definition! Make up a fake one that sounds believable.','party-real')}
    await run(db,'INSERT INTO party_answers(game_id,round,uid,body,pick,hidden,created_at) VALUES(?,?,?,?,?,0,?) ON CONFLICT(game_id,round,uid) DO UPDATE SET body=excluded.body,pick=excluded.pick',g.id,n,user.uid,body,pick,NOW());
    return json({saved:true});
  }
  if(action==='vote'&&method==='POST'){
    if(s.phase!=='vote')fail(409,'Voting isn’t open.','party-closed');
    if(late)fail(409,'Time’s up!','party-time');
    const b=await input(request),choice=String(b.choice||''),list=await keyed(g,n,await answersFor(db,g,n));
    let duel=0;
    if(s.kind==='h2h'){
      duel=s.duel||0;const d=(s.duels||[])[duel];if(!d||!['A','B'].includes(choice))fail(400,'Pick A or B.');
      if(d.some(k=>list.find(a=>a.key===k)?.uid===user.uid))fail(400,'That’s your answer up there! Sit this one out.','party-own');
    }else if(s.kind==='bluff'){
      const mineAns=list.find(a=>a.uid===user.uid);
      if(choice!=='REAL'&&(!list.some(a=>a.key===choice&&!a.hidden)||mineAns?.key===choice))fail(400,'Pick one of the definitions on your screen.');
    }else{
      const a=list.find(x=>x.key===choice&&!x.hidden);if(!a)fail(400,'Pick one of the answers on your screen.');
      if(a.uid===user.uid)fail(400,'You can’t vote for your own answer.','party-own');
    }
    await run(db,'INSERT INTO party_votes(game_id,round,duel,voter_uid,choice,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(game_id,round,duel,voter_uid) DO UPDATE SET choice=excluded.choice,created_at=excluded.created_at',g.id,n,duel,user.uid,choice,NOW());
    return json({voted:choice});
  }
  if(action||method!=='GET')fail(405,'Unsupported method.');
  const out={code:g.code,title:g.title,status:g.status,rev:raw.rev,state:publicState(g),me:{nick:me.nick,points:me.points},now:NOW()};
  if(n){
    const mine=await one(db,'SELECT body,pick,hidden FROM party_answers WHERE game_id=? AND round=? AND uid=?',g.id,n,user.uid);
    out.me.answer=mine?{text:mine.body,pick:mine.pick,hidden:!!mine.hidden}:null;
    if(s.phase==='vote'){
      const v=await one(db,'SELECT choice FROM party_votes WHERE game_id=? AND round=? AND duel=? AND voter_uid=?',g.id,n,s.kind==='h2h'?(s.duel||0):0,user.uid);out.me.vote=v?v.choice:null;
      const list=await keyed(g,n,await answersFor(db,g,n));
      if(s.kind==='h2h'){const d=(s.duels||[])[s.duel||0]||[];out.duel=d.map((k,i)=>({side:i?'B':'A',text:list.find(a=>a.key===k)?.body||'',mine:list.find(a=>a.key===k)?.uid===user.uid}))}
      else{
        let ballot=ballotFor(list,user.uid,s.kind==='bluff'?BALLOT-1:BALLOT).map(a=>({key:a.key,text:a.body,pick:a.pick||null}));
        if(s.kind==='bluff'){const real=(g.terms.find(t=>String(t.id)===s.prompt.term)||{}).def||'';ballot.push({key:'REAL',text:real});
          const seed=parseInt((await sha(g.id+':'+n+':order:'+user.uid)).slice(0,8),16);ballot=ballot.map((x,i)=>({x,k:(seed*(i+7))%9973})).sort((p,q)=>p.k-q.k).map(p=>p.x)}
        out.ballot=ballot;
      }
    }
    if(s.reveal){out.reveal={...s.reveal,mine:undefined,myPoints:s.reveal.mine?.[user.uid]||0};
      if(s.kind==='bluff')out.reveal.myGuess=(await one(db,'SELECT choice FROM party_votes WHERE game_id=? AND round=? AND voter_uid=?',g.id,n,user.uid))?.choice||null;}
  }
  if(s.phase==='scores'||s.phase==='end'){out.top=await leaderboard(db,g,5);out.me.rank=(await one(db,'SELECT COUNT(*) AS n FROM party_players WHERE game_id=? AND points>?',g.id,me.points)).n+1}
  return json(out);
}
// For the grader and CSV: each student's class-game points for games linked to a posting.
export async function partyPointsForPost(db,postId){
  try{const list=await rows(db,'SELECT p.uid,SUM(p.points) AS pts FROM party_players p JOIN party_games g ON g.id=p.game_id WHERE g.post_id=? GROUP BY p.uid',postId);return Object.fromEntries(list.map(r=>[r.uid,r.pts]))}catch{return {}}
}
