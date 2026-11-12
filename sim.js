const canvas = document.querySelector('#simCanvas');
const ctx = canvas.getContext('2d');
const els = { pause: document.querySelector('#pauseBtn'), rush: document.querySelector('#rushBtn'), line:document.querySelector('#lineSelect'), clock: document.querySelector('#clock'), station: document.querySelector('#station'), currentStop:document.querySelector('#currentStop'), nextStop:document.querySelector('#nextStop'), schoolPhase:document.querySelector('#schoolPhase'), schoolGroup:document.querySelector('#schoolGroup'), schoolExit:document.querySelector('#schoolExit'), seated: document.querySelector('#seatedCount'), standing: document.querySelector('#standingCount'), free: document.querySelector('#freeCount'),lineBadge:document.querySelector('#lineBadge'), carriageId:document.querySelector('#carriageId'), routeStops:document.querySelector('#routeStops') };
const lines = {T1:{color:'#f59b1b',stops:['Central','Redfern','Strathfield','Parramatta','Westmead','Blacktown','Penrith']},T4:{color:'#0965ac',stops:['Bondi Junction','Edgecliff','Martin Place','Town Hall','Central','Redfern','Hurstville','Sutherland']},T9:{color:'#e0313d',stops:['Hornsby','Gordon','Chatswood','North Sydney','Wynyard','Town Hall','Central','Strathfield']}};
const schoolDestinations = {
  T1:[{stop:'Parramatta',name:'Parramatta High / Macarthur Girls'},{stop:'Westmead',name:'Westmead school precinct'}],
  T4:[{stop:'Central',name:'Inner Sydney High connections'}],
  T9:[{stop:'Chatswood',name:'Chatswood High'},{stop:'Hornsby',name:'Hornsby Girls High'}]
};
let stops = lines.T1.stops;
let decks;
let state;
let activeLine = null;
const lineInstances = {};
function random(){ state.seed = (state.seed*16807)%2147483647; return (state.seed-1)/2147483646; }
function makeSeats(deck){
  // Seat direction belongs to a whole reversible bank, not to one individual seat.
  deck.banks=[];
  const addBank = (y, row) => {
    const addSide = (bank, positions) => {
      const bankRef={id:`${row}-${bank}`,bank,row,facing:random()>.5?1:-1,turning:0};
      deck.banks.push(bankRef);
      positions.forEach(({x,role})=>deck.seats.push({x,y,role,person:null,bankRef}));
    };
    // The 2-seat side is intentionally narrower; the aisle shifts toward it.
    addSide('two',[{x:.20,role:'window'},{x:.29,role:'aisle'}]);
    addSide('three',[{x:.61,role:'aisle'},{x:.70,role:'middle'},{x:.79,role:'window'}]);
  };
  for(let r=0;r<7;r++) addBank(.17+r*.105,r+1);
  // Short 2+3 bays beside each end vestibule.
  addBank(.09,'front'); addBank(.91,'rear');
}
function schoolPeriod(){
  const minutes = state.time % 1440;
  if (minutes >= 6*60+35 && minutes < 8*60+50) return 'arrival';
  if (minutes >= 14*60+35 && minutes < 16*60+30) return 'departure';
  return 'daytime';
}
function nextSchoolDestination(){
  const currentIndex = state.stop;
  return (schoolDestinations[activeLine] || []).find(s => stops.indexOf(s.stop) > currentIndex) || null;
}
function studentFlow(){
  const period = schoolPeriod();
  const school = nextSchoolDestination();
  if (period === 'arrival' && school) return { period, school, phase:'Before school', group:`Morning group for ${school.name}`, exit:`${school.stop} · ${school.name}` };
  if (period === 'departure') return { period, school:null, phase:'After school', group:'School groups heading home', exit:'varies by home stop' };
  return { period, school:null, phase:'School day', group:'Few school students boarding', exit:'—' };
}
function bankOccupants(deck, bankRef){ return deck.seats.filter(seat=>seat.bankRef===bankRef && seat.person); }
function seatScore(deck, seat, groupId=null){
  const occupants=bankOccupants(deck,seat.bankRef), bank=seat.bankRef;
  const occupiedRoles=occupants.map(personSeat=>personSeat.role);
  const groupMates=groupId ? deck.seats.filter(other=>other.person?.groupId===groupId) : [];
  const sameBankMate=groupMates.some(other=>other.bankRef===seat.bankRef);
  const sameRowMate=groupMates.some(other=>Math.abs(other.y-seat.y)<.002);
  const groupBonus=sameBankMate ? -9 : sameRowMate ? -3.5 : 0;
  if(bank.bank==='two'){
    if(!occupants.length) return (seat.role==='window' ? 0 : .15)+groupBonus;
    // People avoid joining one rider in a two-bank while a three-bank offers space.
    return (seat.role==='aisle' ? 3.2 : 4)+groupBonus;
  }
  if(!occupants.length) return (seat.role==='window' ? .45 : seat.role==='aisle' ? 2.3 : 5.4)+groupBonus;
  if(occupants.length===1){
    if(occupiedRoles.includes('window')) return (seat.role==='aisle' ? 1.45 : 4.8)+groupBonus;
    return (seat.role==='window' ? 1.2 : seat.role==='aisle' ? 2.4 : 4.8)+groupBonus;
  }
  // The middle of a three-bank becomes the final choice.
  return (seat.role==='middle' ? 5.8 : 5)+groupBonus;
}
function chooseSeat(deck, groupId=null){
  const free=deck.seats.filter(seat=>!seat.person);
  return free.sort((a,b)=>seatScore(deck,a,groupId)-seatScore(deck,b,groupId)+random()*.03)[0] || null;
}
function setSeatPath(p, seat){
  p.path=[{x:.5,y:p.y},{x:.5,y:seat.y},{x:seat.x,y:seat.y}];
  p.path=p.path.filter((point,index,path)=>index===0 || Math.hypot(point.x-path[index-1].x,point.y-path[index-1].y)>.01);
  p.pathIndex=0;
}
function clearWindowAccess(deck, seat){
  if(seat.role!=='window') return;
  // A rider in the aisle/middle seat has to step into the aisle before someone can reach a window.
  bankOccupants(deck,seat.bankRef).filter(other=>other!==seat && other.person).forEach(other=>beginReseat(other.person));
}
function assignSeat(p, deck, seat=chooseSeat(deck,p.groupId)){
  if(!seat) return false;
  clearWindowAccess(deck,seat);
  p.seat=seat; p.standing=false; p.phase='enter'; seat.person=p; setSeatPath(p,seat); return true;
}
function beginReseat(p){
  if(p.seat) p.seat.person=null;
  p.seat=null; p.standing=true; p.phase='reseat'; p.wait=0; p.path=[{x:.5,y:p.y}]; p.pathIndex=0;
}
function clearRowForWindowExit(p, deck){
  if(!p.seat || p.seat.role!=='window') return;
  const blockers=bankOccupants(deck,p.seat.bankRef).filter(seat=>seat.person!==p);
  blockers.forEach(seat=>beginReseat(seat.person));
}
function seatStandingPassengers(deck){
  // Once alighting has released space, genuine standees immediately reassess the carriage.
  deck.people.filter(p=>p.standing && p.phase==='settled').forEach(p=>assignSeat(p,deck));
}
function passenger(deck, groupId=null, forceStudent=false){
  const flow = studentFlow(); const studentChance = flow.period==='arrival'&&flow.school ? .46 : flow.period==='departure' ? .38 : .035;
  const student = forceStudent || random() < studentChance; const rebellious = student && random()<.14;
  const tripLength = 1 + Math.floor(random() * Math.max(1, stops.length - 1));
  const travelFacing = 1;
  const preferredFacing = rebellious ? -travelFacing : (student && flow.school ? (random()<.82 ? travelFacing : -travelFacing) : (random()<.78 ? travelFacing : -travelFacing));
  const standY=.22+random()*.58;
  const p = { type:student?'student':'adult', groupId, x:.5, y:1.07, seat:null, standing:false, phase:'enter', wiggle:random()*Math.PI*2, rebel: rebellious, preferredFacing, school:student&&flow.school?flow.school:null, alightAt:student&&flow.school?stops.indexOf(flow.school.stop):(state.stop + tripLength) % stops.length, speed:.18+random()*.16, impatient:random()>.68, wait:0, frustration:0, squeezeTimer:0, yieldTimer:0, path:[], pathIndex:0 };
  // Standing is only a capacity outcome: passengers try all seats first.
  if(!assignSeat(p,deck)){p.standing=true;p.path=[{x:.5,y:standY}];p.pathIndex=0;}
  deck.people.push(p);
}
function arrive(count=1){
  const flow=studentFlow();
  if(count>1 && flow.period==='arrival' && flow.school && random()<.78){
    const deck=decks[random()<.5?0:1], groupId=`school-${++state.groupCounter}`;
    for(let i=0;i<count;i++) passenger(deck,groupId,true);
  }else for(let i=0;i<count;i++) passenger(decks[random()<.5?0:1]);
  state.arrivals+=count;
}
function createInstance(lineKey){
  const presets = { T1:{seed:71, time:7*60+42, riders:19}, T4:{seed:313, time:8*60+7, riders:31}, T9:{seed:907, time:6*60+54, riders:12} };
  const preset = presets[lineKey];
  state = { time:preset.time, elapsed:0, paused:false, stop:0, arrivals:0, nextArrival:1.2, seed:preset.seed, lastAlighting:0, groupCounter:0 };
  decks = [{ name:'UPPER DECK', people:[], seats:[] }, { name:'LOWER DECK', people:[], seats:[] }];
  decks.forEach(makeSeats);
  let ridersToSeed=preset.riders;
  while(ridersToSeed>0){const batch=studentFlow().period==='arrival'&&random()<.46?Math.min(ridersToSeed,2+Math.floor(random()*3)):1;arrive(batch);ridersToSeed-=batch;}
  return { decks, state };
}
function sendPassengersOff(){
  let count = 0;
  decks.forEach(deck => deck.people.forEach(p => {
    if (p.phase !== 'alighting' && p.alightAt === state.stop) {
      clearRowForWindowExit(p,deck);
      if (p.seat) p.seat.person = null;
      p.seat = null; p.standing = true; p.phase = 'alighting';
      p.path=[{x:.5,y:p.y},{x:.5,y:p.y < .5 ? -.07 : 1.07}]; p.pathIndex=0; p.wait=0;
      count++;
    }
  }));
  decks.forEach(seatStandingPassengers);
  state.lastAlighting = count;
}
function updateRoute(){
  if (activeLine) lineInstances[activeLine] = { decks, state };
  activeLine = els.line.value;
  const line=lines[activeLine]; stops=line.stops;
  if (!lineInstances[activeLine]) lineInstances[activeLine] = createInstance(activeLine);
  ({ decks, state } = lineInstances[activeLine]);
  els.lineBadge.textContent=activeLine; els.lineBadge.style.background=line.color; els.carriageId.textContent=`carriage ${activeLine}-01`;
  els.routeStops.innerHTML=stops.map((s,i)=>`<em>${s}</em>${i<stops.length-1?'<i></i>':''}`).join('');document.documentElement.style.setProperty('--line',line.color);
}
function nextWaypoint(p){ return p.path && p.path[p.pathIndex]; }
function isAisleWalker(p){ const target=nextWaypoint(p); return target && Math.abs(p.x-.5)<.09 && Math.abs(target.x-.5)<.09; }
function walkerDirection(p){ const target=nextWaypoint(p); return target ? Math.sign(target.y-p.y) : 0; }
function aisleBlocker(p, deck){
  if(!isAisleWalker(p)) return null;
  const direction=walkerDirection(p);
  return deck.people.find(other=>{
    if(other===p || other.yieldTimer>0 || Math.abs(other.x-.5)>.09 || Math.abs(other.y-p.y)>.07) return false;
    if(other.phase==='settled' && other.standing) return true;
    const otherDirection=walkerDirection(other);
    return (other.phase==='enter'||other.phase==='alighting') && (otherDirection===direction ? direction*(other.y-p.y)>0 : true);
  });
}
function movePerson(p, deck, dt){
  const target=nextWaypoint(p); if(!target) return;
  const blocker=aisleBlocker(p,deck);
  if(blocker){
    p.wait+=dt;
    if(blocker.phase==='settled' && blocker.standing){ blocker.yieldTimer=.9; blocker.yieldX=blocker.x<.5?.39:.61; }
    if(p.wait<1.15 || !p.impatient) return;
    p.squeezeTimer=.5; p.frustration++;
  } else p.wait=0;
  p.squeezeTimer=Math.max(0,p.squeezeTimer-dt);
  const laneX=isAisleWalker(p)&&p.squeezeTimer>0?(p.x<.5?.47:.53):target.x;
  const tx=isAisleWalker(p)?laneX:target.x, ty=target.y;
  const dx=tx-p.x,dy=ty-p.y,distance=Math.hypot(dx,dy); const step=Math.min(distance,dt*p.speed*(p.squeezeTimer>0?.72:1));
  if(distance>0){p.x+=dx/distance*step;p.y+=dy/distance*step;}
  if(Math.hypot(target.x-p.x,target.y-p.y)<.012){p.x=target.x;p.y=target.y;p.pathIndex++;}
  if(p.pathIndex>=p.path.length){
    if(p.phase==='enter'){
      if(p.seat && p.seat.bankRef.facing!==p.preferredFacing){p.seat.bankRef.facing=p.preferredFacing;p.seat.bankRef.turning=.75;}
      p.phase='settled';
    }
    if(p.phase==='reseat'){
      if(!assignSeat(p,deck)){p.phase='settled';p.standing=true;}
    }
  }
}
function update(dt){
  if(state.paused)return; state.elapsed+=dt; state.time+=dt*.55; // 33 simulated mins/min
  if(state.elapsed>state.nextArrival){ const count=1+Math.floor(random()*3); arrive(count); state.nextArrival=state.elapsed+.9+random()*1.9; }
  if(state.elapsed>10){ state.elapsed=0; state.stop=(state.stop+1)%stops.length; state.time+=4; sendPassengersOff(); if(random()>.35) arrive(2+Math.floor(random()*5)); }
  decks.forEach(deck=>{
    deck.banks.forEach(bank=>bank.turning=Math.max(0,bank.turning-dt));
    deck.people.forEach(p=>{ if(p.yieldTimer>0){p.yieldTimer-=dt;p.x+=(p.yieldX-p.x)*Math.min(1,dt*5);}else if(p.phase==='settled'&&p.standing){p.x+=(.5-p.x)*Math.min(1,dt*1.5);} });
    deck.people.filter(p=>p.phase==='enter'||p.phase==='alighting'||p.phase==='reseat').forEach(p=>movePerson(p,deck,dt));
    deck.people = deck.people.filter(p=>!(p.phase==='alighting' && (p.y<-.02 || p.y>1.02)));
  });
}
function roundedRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
function drawDeck(deck, idx, box){
  const {x,y,w,h}=box; const map=(px,py)=>[x+px*w,y+py*h];
  roundedRect(x,y,w,h,40,'#fbfcf8','#789599'); ctx.lineWidth=2; ctx.strokeStyle='#789599'; ctx.stroke();
  // A long north-south aisle keeps the carriage's front-to-back scale visible.
  ctx.fillStyle='#e2ece8';ctx.fillRect(x+w*.425,y+h*.055,w*.12,h*.89);
  ctx.fillStyle='#718b90';ctx.font='700 11px system-ui';ctx.fillText(deck.name,x+16,y+20);ctx.fillStyle='#94a8a4';ctx.font='10px system-ui';ctx.fillText(idx===0?'upper level · quiet carriage':'lower level · doors at both ends',x+16,y+34);
  ctx.fillStyle='#80999b';ctx.font='700 9px system-ui';ctx.fillText('↑ FRONT',x+w*.425,y+17);ctx.fillText('REAR ↓',x+w*.425,y+h-10);
  // doors
  ctx.fillStyle='#b6d1d8';ctx.fillRect(x+w*.435,y-3,w*.1,8);ctx.fillRect(x+w*.435,y+h-5,w*.1,8);
  // seats
  deck.seats.forEach(s=>{const [sx,sy]=map(s.x,s.y),bank=s.bankRef; const sw=w*.048, sh=h*.04; roundedRect(sx-sw/2,sy-sh/2,sw,sh,3,'#fdfdfb','#55767b'); ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=bank.turning>0?'#f0ae56':bank.facing===1?'#9bb2b2':'#d1a684';ctx.fillRect(sx-sw*.28,sy-sh*.28,sw*.56,sh*.12); ctx.fillStyle='#6c8588';ctx.font='8px sans-serif';ctx.fillText(bank.facing===1?'↑':'↓',sx-2.5,sy+sh*.26);});
  deck.people.forEach(p=>{const [px,py]=map(p.x,p.y);const radius=Math.min(w,h)*.021;ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fillStyle=p.standing?'#e7b84e':p.type==='student'?'#f47f4c':'#1e7391';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke(); if(p.type==='student'){ctx.fillStyle='#fff';ctx.fillRect(px-radius*.55,py-radius*.25,radius*1.1,radius*.22);} });
  // Stair treads beside the middle landing.
  ctx.strokeStyle='#80999b'; for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(x+w*.422,y+h*(.42+i*.025));ctx.lineTo(x+w*.405,y+h*(.435+i*.025));ctx.stroke();ctx.beginPath();ctx.moveTo(x+w*.548,y+h*(.42+i*.025));ctx.lineTo(x+w*.565,y+h*(.435+i*.025));ctx.stroke();}
}
function render(){ const rect=canvas.getBoundingClientRect(), dpr=devicePixelRatio||1; canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(Math.max(650,rect.width*.84)*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const W=rect.width,H=canvas.height/dpr;ctx.clearRect(0,0,W,H);ctx.fillStyle='#c7dddf';ctx.fillRect(0,0,W,H);const pad=Math.max(18,W*.035), gap=Math.max(22,W*.035), deckW=(W-pad*2-gap)/2, deckH=H-pad*2;drawDeck(decks[0],0,{x:pad,y:pad,w:deckW,h:deckH});drawDeck(decks[1],1,{x:pad+deckW+gap,y:pad,w:deckW,h:deckH});
  const t=Math.floor(state.time)%1440, currentStop=stops[state.stop], nextStop=stops[(state.stop+1)%stops.length], flow=studentFlow();els.clock.textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;els.currentStop.textContent=currentStop;els.nextStop.textContent=nextStop;els.schoolPhase.textContent=flow.phase;els.schoolGroup.textContent=flow.group;els.schoolExit.textContent=flow.exit;els.station.textContent=`${els.line.value} · ${currentStop}${state.lastAlighting ? ` · ${state.lastAlighting} alighting` : ''}`;els.routeStops.querySelectorAll('em').forEach((stop,index)=>stop.className=index===state.stop?'current':index===(state.stop+1)%stops.length?'next':'');const all=decks.flatMap(d=>d.people),seated=all.filter(p=>p.seat).length;els.seated.textContent=seated;els.standing.textContent=all.length-seated;els.free.textContent=decks.flatMap(d=>d.seats).filter(s=>!s.person).length;
}
function loop(now){const dt=Math.min(.05,(now-(loop.last||now))/1000);loop.last=now;update(dt);render();requestAnimationFrame(loop)} requestAnimationFrame(loop);
els.pause.onclick=()=>{state.paused=!state.paused;els.pause.textContent=state.paused?'Resume':'Pause'};els.rush.onclick=()=>arrive(8);els.line.onchange=updateRoute;updateRoute();window.addEventListener('resize',render);window.advanceTime=(ms)=>{for(let i=0;i<Math.max(1,Math.round(ms/16.67));i++)update(1/60);render()};window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'each deck normalized x left-to-right, y front-to-back',line:activeLine,carriage:`${activeLine}-01`,time:els.clock.textContent,station:stops[state.stop],lastAlighting:state.lastAlighting,paused:state.paused,decks:decks.map(d=>({name:d.name,seated:d.people.filter(p=>p.seat).length,standing:d.people.filter(p=>p.standing).length,alighting:d.people.filter(p=>p.phase==='alighting').length,free:d.seats.filter(s=>!s.person).length,students:d.people.filter(p=>p.type==='student').length}))});
