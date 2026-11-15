// Authoritative version of the original browser simulation.  This deliberately
// retains its social seating and aisle rules; only rendering lives in the browser.
const lines = { T1:{color:'#f59b1b',stops:['Central','Redfern','Strathfield','Parramatta','Westmead','Blacktown','Penrith']}, T4:{color:'#0965ac',stops:['Bondi Junction','Edgecliff','Martin Place','Town Hall','Central','Redfern','Hurstville','Sutherland']}, T9:{color:'#e0313d',stops:['Hornsby','Gordon','Chatswood','North Sydney','Wynyard','Town Hall','Central','Strathfield']} };
const schools = { T1:[{stop:'Parramatta',name:'Parramatta High / Macarthur Girls'},{stop:'Westmead',name:'Westmead school precinct'}], T4:[{stop:'Central',name:'Inner Sydney High connections'}], T9:[{stop:'Chatswood',name:'Chatswood High'},{stop:'Hornsby',name:'Hornsby Girls High'}] };
const MAX_PLATFORM_QUEUE = 24;

export class CarriageSimulation {
  constructor(line) { this.line = line; this.stops = lines[line].stops; this.seedInstance(line); }
  random(){ this.state.seed=(this.state.seed*16807)%2147483647; return (this.state.seed-1)/2147483646; }
  schoolPeriod(){ const t=this.state.time%1440; return t>=395&&t<530?'arrival':t>=875&&t<990?'departure':'daytime'; }
  schoolFlow(){ const school=(schools[this.line]||[]).find(s=>this.stops.indexOf(s.stop)>this.state.stop)||null, period=this.schoolPeriod(); return period==='arrival'&&school?{phase:'Before school',group:`Morning group for ${school.name}`,exit:`${school.stop} · ${school.name}`,school,period}:period==='departure'?{phase:'After school',group:'School groups heading home',exit:'varies by home stop',school:null,period}:{phase:'School day',group:'Few school students boarding',exit:'—',school:null,period}; }
  makeSeats(deck){ deck.banks=[]; const add=(y,row)=>['two','three'].forEach(bank=>{const positions=bank==='two'?[{x:.20,role:'window'},{x:.29,role:'aisle'}]:[{x:.61,role:'aisle'},{x:.70,role:'middle'},{x:.79,role:'window'}], ref={id:`${row}-${bank}`,bank,row,facing:this.random()>.5?1:-1,turning:0};deck.banks.push(ref);positions.forEach(p=>deck.seats.push({...p,y,person:null,bankRef:ref}));}); for(let r=0;r<7;r++)add(.17+r*.105,r+1);add(.09,'front');add(.91,'rear'); }
  bankOccupants(deck,bank){ return deck.seats.filter(s=>s.bankRef===bank&&s.person); }
  seatScore(deck,seat,groupId){ const occupants=this.bankOccupants(deck,seat.bankRef),roles=occupants.map(s=>s.role),mates=groupId?deck.seats.filter(s=>s.person?.groupId===groupId):[],sameBank=mates.some(s=>s.bankRef===seat.bankRef),sameRow=mates.some(s=>Math.abs(s.y-seat.y)<.002),bonus=sameBank?-9:sameRow?-3.5:0;if(seat.bankRef.bank==='two')return (!occupants.length?(seat.role==='window'?0:.15):(seat.role==='aisle'?3.2:4))+bonus;if(!occupants.length)return(seat.role==='window'?.45:seat.role==='aisle'?2.3:5.4)+bonus;if(occupants.length===1){if(roles.includes('window'))return(seat.role==='aisle'?1.45:4.8)+bonus;if(roles.includes('aisle'))return(seat.role==='window'?6.7:4.8)+bonus;return(seat.role==='window'?5.8:2.4)+bonus;}return(seat.role==='middle'?5.8:5)+bonus; }
  chooseSeat(deck,groupId){ return deck.seats.filter(s=>!s.person).sort((a,b)=>this.seatScore(deck,a,groupId)-this.seatScore(deck,b,groupId)+this.random()*.03)[0]||null; }
  deckWithFreeSeat(preferred){return [preferred,...this.decks.filter(deck=>deck!==preferred)].find(deck=>deck.seats.some(seat=>!seat.person))||preferred;}
  setSeatPath(p,seat){p.path=[{x:.5,y:p.y},{x:.5,y:seat.y},{x:seat.x,y:seat.y}].filter((q,i,a)=>i===0||Math.hypot(q.x-a[i-1].x,q.y-a[i-1].y)>.01);p.pathIndex=0;}
  beginReseat(p){if(p.seat)p.seat.person=null;p.seat=null;p.standing=true;p.phase='reseat';p.wait=0;p.path=[{x:.5,y:p.y}];p.pathIndex=0;}
  assignSeat(p,deck,seat=this.chooseSeat(deck,p.groupId)){if(!seat)return false;if(seat.role==='window')this.bankOccupants(deck,seat.bankRef).filter(s=>s.person).forEach(s=>this.beginReseat(s.person));p.seat=seat;p.standing=false;p.phase='enter';seat.person=p;this.setSeatPath(p,seat);return true;}
  passenger(deck,groupId=null,forceStudent=false){const flow=this.schoolFlow(),chance=flow.period==='arrival'&&flow.school?.46:flow.period==='departure'?.38:.035,student=forceStudent||this.random()<chance,trip=1+Math.floor(this.random()*Math.max(1,this.stops.length-1)),rebel=student&&this.random()<.14,ageBand=student?(this.random()<.72?'14–16':'17–18'):(this.random()<.18?'18–24':this.random()<.72?'25–49':'50+'),p={id:`${this.line}-${++this.state.commuterCounter}`,type:student?'student':'adult',ageBand,groupId,x:.5,y:1.07,seat:null,standing:false,phase:'enter',wiggle:this.random()*Math.PI*2,preferredFacing:rebel?-1:(student&&flow.school?(this.random()<.82?1:-1):(this.random()<.78?1:-1)),alightAt:student&&flow.school?this.stops.indexOf(flow.school.stop):(this.state.stop+trip)%this.stops.length,speed:.18+this.random()*.16,impatient:this.random()>.68,lane:this.random()<.5?.47:.53,wait:0,frustration:0,squeezeTimer:0,yieldTimer:0,path:[],pathIndex:0},targetDeck=this.deckWithFreeSeat(deck);if(!this.assignSeat(p,targetDeck)){p.standing=true;p.path=[{x:.5,y:.22+this.random()*.58}];p.pathIndex=0;}targetDeck.people.push(p);}
  arrive(count=1,immediate=false){const flow=this.schoolFlow(),riders=[];if(count>1&&flow.period==='arrival'&&flow.school&&this.random()<.78){const id=`school-${++this.state.groupCounter}`;for(let i=0;i<count;i++)riders.push({groupId:id,forceStudent:true});}else for(let i=0;i<count;i++)riders.push({groupId:null,forceStudent:false});const accepted=immediate?riders:riders.slice(0,Math.max(0,MAX_PLATFORM_QUEUE-this.state.pendingArrivals.length));if(immediate)accepted.forEach(r=>this.passenger(this.decks[this.random()<.5?0:1],r.groupId,r.forceStudent));else this.state.pendingArrivals.push(...accepted);this.state.arrivals+=accepted.length;return accepted.length;}
  rush(count=8){
    this.arrive(count);
    // Put one rider into each deck straight away when there is a safe gap, then
    // preserve realistic aisle flow for the rest of the group.
    let admitted=0;
    while(admitted<2&&this.admitBoarder())admitted++;
    this.state.boardingCooldown=.16;
    return admitted;
  }
  admitBoarder(){const next=this.state.pendingArrivals[0];if(!next)return false;const walking=deck=>deck.people.filter(p=>p.phase!=='settled').length,target=[...this.decks].sort((a,b)=>walking(a)-walking(b))[0];if(walking(target)>=2)return false;this.state.pendingArrivals.shift();this.passenger(target,next.groupId,next.forceStudent);return true;}
  seedInstance(line){const preset={T1:{seed:71,time:462,riders:19},T4:{seed:313,time:487,riders:31},T9:{seed:907,time:414,riders:12}}[line];this.state={time:preset.time,elapsed:0,paused:false,stop:0,arrivals:0,seed:preset.seed,lastAlighting:0,groupCounter:0,commuterCounter:0,pendingArrivals:[],boardingCooldown:0};this.decks=[{name:'UPPER DECK',people:[],seats:[]},{name:'LOWER DECK',people:[],seats:[]}];this.decks.forEach(d=>this.makeSeats(d));let n=preset.riders;while(n>0){const b=this.schoolPeriod()==='arrival'&&this.random()<.46?Math.min(n,2+Math.floor(this.random()*3)):1;this.arrive(b,true);n-=b;}}
  nextWaypoint(p){return p.path?.[p.pathIndex];}
  aisleBlocker(p,deck){const target=this.nextWaypoint(p);if(!target||Math.abs(p.x-.5)>=.09||Math.abs(target.x-.5)>=.09)return null;const direction=Math.sign(target.y-p.y);return deck.people.find(o=>{if(o===p||o.yieldTimer>0||Math.abs(o.x-.5)>.09||Math.abs(o.y-p.y)>.07)return false;if(o.phase==='settled'&&o.standing)return true;const t=this.nextWaypoint(o),dir=t?Math.sign(t.y-o.y):0;return(o.phase==='enter'||o.phase==='alighting')&&(dir===direction?direction*(o.y-p.y)>0:true);});}
  movePerson(p,deck,dt){const target=this.nextWaypoint(p);if(!target)return;const blocker=p.squeezeTimer>0?null:this.aisleBlocker(p,deck);if(blocker){p.wait+=dt;if(blocker.phase==='settled'&&blocker.standing){blocker.yieldTimer=.9;blocker.yieldX=blocker.x<.5?.39:.61;}const patience=p.impatient?.65:1.55;if(p.wait<patience)return;p.squeezeTimer=1.15;p.frustration++;p.wait=0;}else if(!p.squeezeTimer)p.wait=0;p.squeezeTimer=Math.max(0,p.squeezeTimer-dt);const aisle=Math.abs(p.x-.5)<.09&&Math.abs(target.x-.5)<.09,tx=aisle&&p.squeezeTimer>0?p.lane:target.x,ty=target.y,dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy),step=Math.min(d,dt*p.speed*(p.squeezeTimer>0?.78:1));if(d){p.x+=dx/d*step;p.y+=dy/d*step;}if(Math.hypot(target.x-p.x,target.y-p.y)<.012){p.x=target.x;p.y=target.y;p.pathIndex++;}if(p.pathIndex>=p.path.length){if(p.phase==='enter'){if(p.seat&&p.seat.bankRef.facing!==p.preferredFacing){p.seat.bankRef.facing=p.preferredFacing;p.seat.bankRef.turning=.75;}p.phase='settled';}if(p.phase==='reseat'){if(!this.assignSeat(p,deck)){p.phase='settled';p.standing=true;}}}}
  sendPassengersOff(){let count=0;this.decks.forEach(deck=>deck.people.forEach(p=>{if(p.phase!=='alighting'&&p.alightAt===this.state.stop){if(p.seat?.role==='window')this.bankOccupants(deck,p.seat.bankRef).filter(s=>s.person!==p).forEach(s=>this.beginReseat(s.person));if(p.seat)p.seat.person=null;p.seat=null;p.standing=true;p.phase='alighting';p.path=[{x:.5,y:p.y},{x:.5,y:p.y<.5?-.07:1.07}];p.pathIndex=0;p.wait=0;count++;}}));this.decks.forEach(d=>d.people.filter(p=>p.standing&&p.phase==='settled').forEach(p=>this.assignSeat(p,d)));this.state.lastAlighting=count;}
  actOnCommuter(id,action){const deck=this.decks.find(d=>d.people.some(p=>p.id===id)),p=deck?.people.find(person=>person.id===id);if(!p)return false;if(action==='find-seat'){this.beginReseat(p);this.assignSeat(p,deck);}if(action==='give-way'){p.yieldTimer=1.6;p.yieldX=p.x<.5?.39:.61;}if(action==='hurry'){p.impatient=true;p.squeezeTimer=1.15;p.wait=0;p.frustration++;}if(action==='settle'){p.frustration=0;p.wait=0;p.impatient=false;p.squeezeTimer=0;}return true;}
  tick(dt){
    if(this.state.paused)return;
    // Service events keep their deliberately slow, observable cadence. People, however,
    // cover distance in compressed simulation time so their journeys complete between stops.
    const motionDt=dt*2.4;
    this.state.elapsed+=dt;
    this.state.time+=dt*.55;
    this.state.boardingCooldown-=dt;
    if(this.state.boardingCooldown<=0&&this.admitBoarder())this.state.boardingCooldown=.42+this.random()*.18;
    if(this.state.elapsed>10){
      this.state.elapsed=0;
      this.state.stop=(this.state.stop+1)%this.stops.length;
      this.state.time+=4;
      this.sendPassengersOff();
      if(this.random()>.35)this.arrive(2+Math.floor(this.random()*5));
    }
    this.decks.forEach(d=>{
      d.banks.forEach(b=>b.turning=Math.max(0,b.turning-motionDt));
      d.people.forEach(p=>{
        if(p.yieldTimer>0){
          p.yieldTimer-=motionDt;
          p.x+=(p.yieldX-p.x)*Math.min(1,motionDt*5);
        }else if(p.phase==='settled'&&p.standing){
          p.x+=(.5-p.x)*Math.min(1,motionDt*1.5);
        }
      });
      d.people.filter(p=>['enter','alighting','reseat'].includes(p.phase)).forEach(p=>this.movePerson(p,d,motionDt));
      d.people=d.people.filter(p=>!(p.phase==='alighting'&&(p.y<-.02||p.y>1.02)));
    });
  }
  snapshot(){
    const flow=this.schoolFlow(),time=Math.floor(this.state.time)%1440;
    return {line:this.line,color:lines[this.line].color,stops:this.stops,state:{...this.state,time},flow,decks:this.decks.map(d=>({
      name:d.name,
      banks:d.banks.map(b=>({...b})),
      seats:d.seats.map(s=>({x:s.x,y:s.y,role:s.role,bankId:s.bankRef.id,occupied:Boolean(s.person)})),
      people:d.people.map(p=>({
        id:p.id,type:p.type,ageBand:p.ageBand,x:p.x,y:p.y,standing:p.standing,phase:p.phase,
        destination:this.stops[p.alightAt],group:p.groupId?`School group ${p.groupId.split('-').pop()}`:'Independent traveller',
        patience:p.impatient?'Low — squeezes through':'Measured — queues first',walkingSpeed:Math.round(p.speed*100),
        frustration:Math.min(100,Math.round(p.frustration*24+p.wait*18+(p.squeezeTimer>0?12:0))),
        preferredFacing:p.preferredFacing===1?'Travel direction':'Reverse direction'
      }))
    }))};
  }
}
