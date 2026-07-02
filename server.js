const express=require('express');const http=require('http');const {Server}=require('socket.io');
const app=express();const server=http.createServer(app);const io=new Server(server,{cors:{origin:'*'}});app.use(express.static('public'));
const rooms=new Map();
function code(){let c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join('')}
function makeRoom(name,socket){let r;do{r=code()}while(rooms.has(r));rooms.set(r,{code:r,players:[],chat:[],blackjack:null,poker:null,roulette:{bets:[],spinning:false,last:null},slots:[]});joinRoom(r,name,socket);return r}
function joinRoom(r,name,socket){const room=rooms.get(r);if(!room)throw Error('Room not found'); if(room.players.length>=10)throw Error('Room full'); let player={id:socket.id,name:name.slice(0,18)||'Player',chips:100000,seat:room.players.length+1,hand:[],bet:0,status:'Lobby'};room.players.push(player);socket.join(r);socket.data.room=r;socket.data.name=name;return player}
function emitRoom(r){
  const room=rooms.get(r); if(!room)return;
  for(const player of room.players){
    if(player.id) io.to(player.id).emit('roomState',safe(room,player.id));
  }
}
function hiddenCards(n){return Array.from({length:n},()=>({hidden:true}))}
function safe(room,viewerId){
  const pokerOver=room.poker && room.poker.active===false;
  return {
    ...room,
    players:room.players.map(p=>({
      ...p,
      // Blackjack cards are visible in this MVP, but poker hole cards are private.
      pokerHand:(p.id===viewerId || pokerOver) ? (p.pokerHand||[]) : hiddenCards((p.pokerHand||[]).length),
      hand:p.hand||[]
    }))
  }
}
const suits=['♠','♥','♦','♣'], ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];function deck(){let d=[];for(const s of suits)for(const r of ranks)d.push({r,s});return d.sort(()=>Math.random()-.5)}
function val(card){if(['J','Q','K'].includes(card.r))return 10;if(card.r==='A')return 11;return +card.r}function total(hand){let t=hand.reduce((a,c)=>a+val(c),0),aces=hand.filter(c=>c.r==='A').length;while(t>21&&aces--){t-=10}return t}

function pokerStart(room){
  let d=deck();
  room.poker={deck:d,community:[],pot:0,currentBet:0,turn:0,phase:'preflop',active:true,message:'Poker hand started'};
  for(const p of room.players){p.pokerHand=[d.pop(),d.pop()];p.pokerBet=0;p.folded=false;p.status='Poker'}
}
function pokerNext(room){
  const pk=room.poker;if(!pk)return;
  let live=room.players.filter(p=>!p.folded&&p.id);
  if(live.length<=1){pokerShowdown(room);return;}
  const phases=['preflop','flop','turn','river','showdown'];
  if(room.players.every(p=>p.folded||p.pokerBet===pk.currentBet||!p.id)){
    room.players.forEach(p=>p.pokerBet=0);pk.currentBet=0;
    if(pk.phase==='preflop'){pk.community.push(pk.deck.pop(),pk.deck.pop(),pk.deck.pop());pk.phase='flop';}
    else if(pk.phase==='flop'){pk.community.push(pk.deck.pop());pk.phase='turn';}
    else if(pk.phase==='turn'){pk.community.push(pk.deck.pop());pk.phase='river';}
    else {pokerShowdown(room);return;}
  }
  for(let i=0;i<room.players.length;i++){pk.turn=(pk.turn+1)%room.players.length;let p=room.players[pk.turn];if(p.id&&!p.folded){break;}}
  pk.message=`${room.players[pk.turn]?.name||'Player'} to act`;
}
function pokerScore(cards){
  const order='23456789TJQKA';
  const rs=cards.map(c=>c.r==='10'?'T':c.r).map(r=>order.indexOf(r)+2).sort((a,b)=>b-a);
  const counts={};rs.forEach(r=>counts[r]=(counts[r]||0)+1);
  const groups=Object.entries(counts).map(([r,c])=>({r:+r,c})).sort((a,b)=>b.c-a.c||b.r-a.r);
  const flushSuit=['♠','♥','♦','♣'].find(s=>cards.filter(c=>c.s===s).length>=5);
  const uniq=[...new Set(rs)].sort((a,b)=>b-a); if(uniq.includes(14))uniq.push(1);
  let straight=0;for(let i=0;i<=uniq.length-5;i++){if(uniq[i]-uniq[i+4]===4){straight=uniq[i];break;}}
  if(flushSuit&&straight)return [8,straight];
  if(groups[0].c===4)return [7,groups[0].r,groups[1]?.r||0];
  if(groups[0].c===3&&groups[1]?.c>=2)return [6,groups[0].r,groups[1].r];
  if(flushSuit)return [5,...rs.slice(0,5)];
  if(straight)return [4,straight];
  if(groups[0].c===3)return [3,groups[0].r,...groups.filter(g=>g.c===1).map(g=>g.r).slice(0,2)];
  if(groups[0].c===2&&groups[1]?.c===2)return [2,groups[0].r,groups[1].r,...groups.filter(g=>g.c===1).map(g=>g.r).slice(0,1)];
  if(groups[0].c===2)return [1,groups[0].r,...groups.filter(g=>g.c===1).map(g=>g.r).slice(0,3)];
  return [0,...rs.slice(0,5)];
}
function cmp(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)-(b[i]||0)}return 0}
function handName(score){return ['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'][score[0]]}
function pokerShowdown(room){const pk=room.poker;if(!pk)return;while(pk.community.length<5)pk.community.push(pk.deck.pop());let best=null,winner=null;for(const p of room.players){if(p.folded||!p.id)continue;const sc=pokerScore([...(p.pokerHand||[]),...pk.community]);if(!best||cmp(sc,best)>0){best=sc;winner=p}}if(winner){winner.chips+=pk.pot;pk.message=`${winner.name} wins ${pk.pot.toLocaleString()} with ${handName(best)}`;}pk.active=false;}

function bjStart(room){let d=deck();room.blackjack={deck:d,dealer:[d.pop(),d.pop()],turn:0,active:true,message:'Blackjack started'};for(const p of room.players){p.hand=[d.pop(),d.pop()];p.bet=1000;p.chips-=1000;p.status='Playing'}}
function bjFinish(room){const bj=room.blackjack;const dealer=bj.dealer;while(total(dealer)<17)dealer.push(bj.deck.pop());const dt=total(dealer);for(const p of room.players){const pt=total(p.hand); if(pt<=21&&(dt>21||pt>dt)){p.chips+=p.bet*2;p.status='Won'}else if(pt===dt&&pt<=21){p.chips+=p.bet;p.status='Push'}else p.status='Lost';p.bet=0}bj.active=false;bj.message='Round complete'}
io.on('connection',socket=>{socket.on('createRoom',(name,cb)=>{try{let r=makeRoom(name,socket);cb({ok:true,code:r});emitRoom(r)}catch(e){cb({ok:false,error:e.message})}});socket.on('joinRoom',({code,name},cb)=>{try{code=(code||'').toUpperCase().trim();joinRoom(code,name,socket);cb({ok:true,code});emitRoom(code)}catch(e){cb({ok:false,error:e.message})}});socket.on('chat',msg=>{const r=socket.data.room,room=rooms.get(r);if(!room)return;room.chat.push({name:socket.data.name,msg:String(msg).slice(0,120)});emitRoom(r)});
socket.on('pokerStart',()=>{const room=rooms.get(socket.data.room);if(!room)return;pokerStart(room);emitRoom(room.code)});socket.on('pokerAction',(a,cb)=>{const room=rooms.get(socket.data.room),p=room?.players.find(x=>x.id===socket.id),pk=room?.poker;if(!room||!p||!pk?.active)return cb&&cb({ok:false,error:'No active poker hand'});if(room.players[pk.turn]?.id!==socket.id)return cb&&cb({ok:false,error:'Not your turn'});if(a.type==='fold'){p.folded=true;p.status='Folded'}else if(a.type==='call'){let need=Math.max(0,pk.currentBet-(p.pokerBet||0));need=Math.min(need,p.chips);p.chips-=need;p.pokerBet=(p.pokerBet||0)+need;pk.pot+=need;p.status=need?'Called':'Checked'}else if(a.type==='raise'){let amt=Math.max(100,Math.min(+a.amount||100,p.chips));p.chips-=amt;p.pokerBet=(p.pokerBet||0)+amt;pk.pot+=amt;pk.currentBet=Math.max(pk.currentBet,p.pokerBet);p.status='Raised'}pokerNext(room);emitRoom(room.code);cb&&cb({ok:true})});
socket.on('bjStart',()=>{const room=rooms.get(socket.data.room);if(!room)return;bjStart(room);emitRoom(room.code)});socket.on('bjHit',()=>{const room=rooms.get(socket.data.room),p=room?.players.find(x=>x.id===socket.id);if(!room?.blackjack?.active||!p)return;p.hand.push(room.blackjack.deck.pop());if(total(p.hand)>21)p.status='Bust';emitRoom(room.code)});socket.on('bjStand',()=>{const room=rooms.get(socket.data.room),p=room?.players.find(x=>x.id===socket.id);if(!room?.blackjack?.active||!p)return;p.status='Stand';if(room.players.every(x=>['Stand','Bust'].includes(x.status)))bjFinish(room);emitRoom(room.code)});
socket.on('spinSlots',(bet,cb)=>{const room=rooms.get(socket.data.room),p=room?.players.find(x=>x.id===socket.id);bet=Math.max(100,Math.min(+bet||100,5000,p?.chips||0));if(!p)return cb({ok:false});p.chips-=bet;const icons=['🍒','🍋','🔔','💎','7️⃣','⭐'];const roll=[0,1,2].map(()=>icons[Math.floor(Math.random()*icons.length)]);let win=0;if(roll[0]===roll[1]&&roll[1]===roll[2])win=bet*10;else if(roll[0]===roll[1]||roll[1]===roll[2]||roll[0]===roll[2])win=bet*2;p.chips+=win;cb({ok:true,roll,win});emitRoom(room.code)});
socket.on('rouletteBet',({bet,choice},cb)=>{const room=rooms.get(socket.data.room),p=room?.players.find(x=>x.id===socket.id);bet=Math.max(100,Math.min(+bet||100,5000,p?.chips||0));if(!p)return cb({ok:false});p.chips-=bet;room.roulette.bets.push({id:p.id,name:p.name,bet,choice});cb({ok:true});emitRoom(room.code)});socket.on('rouletteSpin',()=>{const room=rooms.get(socket.data.room);if(!room)return;const n=Math.floor(Math.random()*37);const red=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n);const color=n===0?'green':red?'red':'black';room.roulette.last={n,color};for(const b of room.roulette.bets){const p=room.players.find(x=>x.id===b.id);if(!p)continue;let win=0;if(String(b.choice)===String(n))win=b.bet*36;else if(b.choice===color)win=b.bet*2;p.chips+=win}room.roulette.bets=[];emitRoom(room.code)});
socket.on('disconnect',()=>{const r=socket.data.room,room=rooms.get(r);if(!room)return;const p=room.players.find(x=>x.id===socket.id);if(p){p.id=null;p.status='Disconnected'}emitRoom(r)})});
server.listen(process.env.PORT||3000,()=>console.log('Goonateer Casino running on http://localhost:3000'));
