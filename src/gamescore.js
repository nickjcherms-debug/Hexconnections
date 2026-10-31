// 4.15 game scoring. Pure functions shared by the API (leaderboards, grader) and mirrored
// in public/index.html (the student's live points), so both always agree.
// Points come only from the board itself: placed terms, explained touching connections,
// longer reasons, Depth & Complexity links, streaks, one connected board, every term used,
// timed-round connections, and debate results.
export const LEVELS=['Explorer','Connector','Builder','Weaver','Architect','Mastermind','Sage','Visionary','Legend','Hex Hero'];
export const LEVEL_STEP=150;
export const BADGES={
  first:{name:'First link',desc:'Explained your first connection'},
  wordsmith:{name:'Wordsmith',desc:'Wrote a reason of 25 words or more'},
  hub:{name:'Hub',desc:'Linked one hexagon to four or more others'},
  bridge:{name:'Bridge builder',desc:'Linked a term to a Depth & Complexity icon'},
  roll:{name:'On a roll',desc:'Five detailed reasons in a row'},
  board:{name:'One board',desc:'Joined every hexagon into one connected board'},
  allin:{name:'All in',desc:'Used and linked every term'},
  clock:{name:'Beat the clock',desc:'Hit the target in a timed round'},
  race:{name:'Race winner',desc:'Your team finished the board first'},
  champ:{name:'Debate champ',desc:'Gave the winning defense in a debate round'},
  judge:{name:'Fair judge',desc:'Voted in three debate rounds'}
};
export const POINTS={place:10,link:20,detail:10,dc:15,streak:5,board:50,allin:50,round:10,roundHit:50,debateWin:30,debateVote:5,debateCast:5};
const words=t=>String(t||'').trim().split(/\s+/).filter(Boolean).length;
const touching=(p,q)=>Math.max(Math.abs(p[0]-q[0]),Math.abs(p[1]-q[1]),Math.abs(p[0]+p[1]-q[0]-q[1]))===1;
function groups(ids,links){
  const parent=new Map(ids.map(id=>[id,id]));
  const find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x)}return x};
  for(const c of links){if(parent.has(c.a)&&parent.has(c.b))parent.set(find(c.a),find(c.b))}
  return new Set(ids.map(find)).size;
}
// act: the student's activity (their version). draft: {place,conns,_skew}. game: asg.game (rounds).
// extra: {debate:{wins,votes,cast}, raceWinner:boolean}
export function scoreBoard(act,draft,game,extra){
  const termIds=new Set((act?.terms||[]).map(t=>String(t.id||t.n)));
  const place=draft?.place||{},conns=draft?.conns||{},skew=Number(draft?._skew)||0;
  const placedIds=Object.keys(place).filter(k=>Array.isArray(place[k]));
  const placedTerms=placedIds.filter(k=>termIds.has(k));
  const seen=new Set(),links=[];
  for(const [key,c] of Object.entries(conns)){
    const [a,b]=key.split('-'),p=place[a],q=place[b];
    if(!p||!q||!c||!touching(p,q))continue;
    const w=words(c.why);if(w<3)continue;
    const norm=String(c.why).toLowerCase().replace(/[^a-z0-9 ]+/g,'').replace(/\s+/g,' ').trim();
    if(seen.has(norm))continue;seen.add(norm);
    links.push({a,b,w,t:(Number(c.first)||Number(c.at)||0)});
  }
  const br={place:placedTerms.length*POINTS.place,link:links.length*POINTS.link,detail:0,dc:0,streak:0,board:0,allin:0,round:0,debate:0};
  const deg={};let wordsmith=false,bridge=false;
  for(const l of links){
    if(l.w>=15)br.detail+=POINTS.detail;
    if(l.w>=25)wordsmith=true;
    if(Number(l.a)>1000||Number(l.b)>1000){br.dc+=POINTS.dc;bridge=true}
    deg[l.a]=(deg[l.a]||0)+1;deg[l.b]=(deg[l.b]||0)+1;
  }
  // Streaks: detailed reasons (8+ words) in the order they were written.
  const ordered=links.slice().sort((x,y)=>x.t-y.t);let run=0,best=0;
  for(const l of ordered){if(l.w>=8){run++;if(run>=3)br.streak+=POINTS.streak}else run=0;best=Math.max(best,run)}
  const oneBoard=placedIds.length>=3&&groups(placedIds,links)===1;
  if(oneBoard)br.board=POINTS.board;
  const linked=new Set(links.flatMap(l=>[l.a,l.b]));
  const allIn=termIds.size>0&&[...termIds].every(id=>place[id]&&linked.has(id));
  if(allIn)br.allin=POINTS.allin;
  const rounds=[];
  const list=[...(Array.isArray(game?.rounds)?game.rounds:[]),...(game?.round?[game.round]:[])];
  for(const r of list){
    const s=Date.parse(r.startedAt),e=Date.parse(r.endsAt);if(!s||!e)continue;
    const n=links.filter(l=>l.t&&l.t+skew>=s&&l.t+skew<=e).length,hit=n>=(Number(r.target)||1);
    br.round+=n*POINTS.round+(hit?POINTS.roundHit:0);
    rounds.push({id:r.id,count:n,target:Number(r.target)||1,hit});
  }
  const d=extra?.debate||{};
  br.debate=(d.wins||0)*POINTS.debateWin+(d.votes||0)*POINTS.debateVote+(d.cast||0)*POINTS.debateCast;
  const points=Object.values(br).reduce((n,v)=>n+v,0);
  const badges=[];
  if(links.length)badges.push('first');if(wordsmith)badges.push('wordsmith');
  if(Object.values(deg).some(n=>n>=4))badges.push('hub');if(bridge)badges.push('bridge');
  if(best>=5)badges.push('roll');if(oneBoard)badges.push('board');if(allIn)badges.push('allin');
  if(rounds.some(r=>r.hit))badges.push('clock');if(extra?.raceWinner)badges.push('race');
  if((d.wins||0)>0)badges.push('champ');if((d.rounds||0)>=3)badges.push('judge');
  const level=Math.min(LEVELS.length,1+Math.floor(points/LEVEL_STEP));
  return {points,level,levelName:LEVELS[level-1],nextAt:level<LEVELS.length?level*LEVEL_STEP:null,badges,streak:run,best,links:links.length,placed:placedTerms.length,terms:termIds.size,oneBoard,allIn,rounds,breakdown:br,
    finishedAt:allIn&&oneBoard&&ordered.length?ordered[ordered.length-1].t+skew:null};
}
// Friendly nicknames for leaderboards students can see: stable per posting, no real names.
const ADJ=['Swift','Clever','Brave','Curious','Bright','Bold','Calm','Daring','Eager','Gentle','Happy','Keen','Lively','Mighty','Nimble','Quick','Sunny','Witty','Zesty','Cosmic'];
const ANIMAL=['Otter','Falcon','Panda','Fox','Owl','Dolphin','Lynx','Koala','Tiger','Heron','Badger','Gecko','Bison','Raven','Orca','Moose','Puffin','Llama','Jaguar','Beetle'];
// hexes: one hash per student (sorted order decides who keeps a name when two collide).
export function nicknames(hexes){
  const used=new Set,total=ADJ.length*ANIMAL.length;
  return hexes.map(h=>{let n=(parseInt(String(h).slice(0,8),16)||0)%total;for(let i=0;i<total&&used.has(n);i++)n=(n+1)%total;used.add(n);return ADJ[n%ADJ.length]+' '+ANIMAL[Math.floor(n/ADJ.length)]});
}
export function shortName(name){const p=String(name||'').trim().split(/\s+/).filter(Boolean);if(!p.length)return 'Student';return p.length>1?p[0]+' '+p[p.length-1][0]+'.':p[0]}
