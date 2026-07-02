const socket=io();let state=null,roomCode=null,meName='',slotLast='';const app=document.getElementById('app');
function landing(){app.innerHTML=`<div class=screen><div class=card><div class=logo>🎰 Goonateer Casino</div><p class=sub>Play-money social casino. No real money, no prizes, just fake chips.</p><div class=row><button onclick="nameScreen('create')">Create Room</button><button class=secondary onclick="nameScreen('join')">Join With Code</button></div><p class=sub>Max 10 players per room • Poker • Blackjack • Roulette • Slots</p><div id=err class=error></div></div></div>`}
function nameScreen(mode){app.innerHTML=`<div class=screen><div class=card><div class=logo>${mode==='create'?'Create Room':'Join Room'}</div><div class=row><input id=name placeholder="Your name" maxlength=18>${mode==='join'?'<input id=code placeholder="Room code" maxlength=6>':''}</div><div class=row><button onclick="enter('${mode}')">Sit at Table</button><button class=secondary onclick="landing()">Back</button></div><div id=err class=error></div></div></div>`}
function enter(mode){meName=document.getElementById('name').value.trim()||'Player'; if(!socket.connected)return err('Server not connected. Run npm start and open localhost:3000'); if(mode==='create')socket.emit('createRoom',meName,res=>{if(!res.ok)return err(res.error);roomCode=res.code}); else socket.emit('joinRoom',{name:meName,code:document.getElementById('code').value},res=>{if(!res.ok)return err(res.error);roomCode=res.code})}
function err(t){document.getElementById('err').textContent=t}
socket.on('roomState',s=>{state=s;roomCode=s.code;renderCasino()});
let selectedGame='lobby';
function renderCasino(){
 if(!state)return;
 const baseTop=`<div class=top><div><b class=big>Goonateer Casino</b><div class=sub>Room code: <b>${state.code}</b> | Players ${state.players.length}/10</div></div><div class=pill>Status: ${socket.connected?'Connected':'Disconnected'}</div></div>`;
 if(selectedGame==='lobby'){
  app.innerHTML=`<div class=casino>${baseTop}<div class=card style="margin:24px auto"><div class=logo>Choose Your Game</div><p class=sub>You are in the room. Pick where you want to play.</p><div class=gameSelect><button onclick="selectedGame='poker';renderCasino()">♠️ Poker<br><small>Table game • up to 10 players</small></button><button onclick="selectedGame='blackjack';renderCasino()">🃏 Blackjack<br><small>Dealer table</small></button><button onclick="selectedGame='roulette';renderCasino()">🎡 Roulette<br><small>Casino wheel environment</small></button><button onclick="selectedGame='slots';renderCasino()">🎰 Slots<br><small>Slot machine room</small></button></div><div class=panel><h2>Players in room</h2><div class=row>${state.players.map(p=>`<span class=pill>${esc(p.name)} — 💰 ${p.chips.toLocaleString()}</span>`).join('')}</div></div><div class=panel><h2>💬 Room Chat</h2>${chatBox()}</div></div></div>`;
  return;
 }
 if(selectedGame==='slots'){
  app.innerHTML=`<div class=casino>${baseTop}${backBtn()}<div class=slotsRoom><div class=slotsMachine><div class=machineTop>GOONATEER SLOTS</div><div class=reels>${slotLast||'🍒 🍋 🔔'}</div><div class=row><input id=slotbet type=number value=500 min=100 max=5000><button onclick="spinSlots()">Pull Lever</button></div><p class=sub>Match 2 symbols = 2x. Match 3 symbols = 10x. Fake chips only.</p></div><div class=panel><h2>Players</h2>${playerList()}</div><div class=panel><h2>💬 Chat</h2>${chatBox()}</div></div></div>`;
  return;
 }
 if(selectedGame==='roulette'){
  app.innerHTML=`<div class=casino>${baseTop}${backBtn()}<div class=rouletteRoom><div class=wheel>${state.roulette.last?state.roulette.last.n:'?'}</div><div class=rouletteBoard><h1>Roulette Lounge</h1><p>Last spin: <b>${state.roulette.last?state.roulette.last.n+' '+state.roulette.last.color:'none'}</b></p><div class=row><select id=rchoice><option>red</option><option>black</option><option>green</option>${Array.from({length:37},(_,i)=>`<option>${i}</option>`).join('')}</select><input id=rbet type=number value=500 min=100 max=5000><button onclick="rouletteBet()">Place Bet</button><button onclick="socket.emit('rouletteSpin')">Spin Wheel</button></div><p class=sub>Bet red/black/green or a number 0–36.</p></div><div class=panel><h2>Players</h2>${playerList()}</div><div class=panel><h2>💬 Chat</h2>${chatBox()}</div></div></div>`;
  return;
 }
 // Poker and blackjack are table games
 const isPoker=selectedGame==='poker';
 const seatedPlayers=state.players.filter(p=>p.id!==null || p.name);
 app.innerHTML=`<div class=casino>${baseTop}${backBtn()}<div class=table ${isPoker?'pokerFelt':'blackjackFelt'}>
   <div class=center>
     <h2>${isPoker?'Poker':'Blackjack'}</h2>
     ${isPoker?`<div class=community>${cards(state.poker?.community||[])||'<span class=sub>No community cards yet</span>'}</div><div class=pot>POT: 💰 ${((state.poker?.pot||0).toLocaleString())}</div><p>${state.poker?.phase||'not started'} • ${state.poker?.message||'Start a poker hand when everyone is ready.'}</p>`:`<p>Dealer</p><div>${cards(state.blackjack?.dealer||[])}</div><p>${state.blackjack?.message||'Start a blackjack round.'}</p>`}
   </div>
   ${seatedPlayers.map((p,i)=>playerSeat(p,i,seatedPlayers.length,isPoker)).join('')}
 </div>${isPoker?pokerControls():blackjackControls()}<div class=panel><h2>💬 Chat</h2>${chatBox()}</div></div>`
}
function backBtn(){return `<div class=row style="justify-content:flex-start;margin:14px 0"><button class=secondary onclick="selectedGame='lobby';renderCasino()">← Game Lobby</button></div>`}
function pokerControls(){return `<div class=panel poker><h2>♠️ Poker Controls</h2><div class=row><button onclick="socket.emit('pokerStart')">Start Poker Hand</button><button onclick="pokerAction('call')">Check / Call</button><button onclick="pokerAction('fold')">Fold</button></div><div class=row><input id=praise type=number value=1000 min=100 max=50000><button onclick="pokerRaise()">Raise</button></div></div>`}
function blackjackControls(){return `<div class=panel><h2>🃏 Blackjack</h2><p>Bet: 1,000 chips</p><div class=row><button onclick="socket.emit('bjStart')">Start Round</button><button onclick="socket.emit('bjHit')">Hit</button><button onclick="socket.emit('bjStand')">Stand</button></div></div>`}
function playerList(){return `<div class=row>${state.players.map(p=>`<span class=pill>${esc(p.name)} — 💰 ${p.chips.toLocaleString()}</span>`).join('')}</div>`}
function chatBox(){return `<div class=chat>${state.chat.map(c=>`<p><b>${esc(c.name)}:</b> ${esc(c.msg)}</p>`).join('')}</div><div class=row><input id=chat placeholder="message"><button onclick="sendChat()">Send</button></div>`}
function playerSeat(p,i,total,isPoker){
 const angle=(-90 + (360/Math.max(total,1))*i) * Math.PI/180;
 const x=50 + 43*Math.cos(angle), y=50 + 42*Math.sin(angle);
 const shownCards=isPoker ? (p.pokerHand||[]) : (p.hand||[]);
 return `<div class="seat playerSeat" style="left:${x}%;top:${y}%">
   <b>Player ${p.seat}</b><br>${esc(p.name)}<br>💰 ${p.chips.toLocaleString()}<br>
   <div>${cards(shownCards)}</div><small>${p.status||''}</small>
 </div>`
}
function cards(hand){return (hand||[]).map(c=>c.hidden?`<span class="playing-card back">🂠</span>`:`<span class="playing-card ${['♥','♦'].includes(c.s)?'red':''}">${c.r}${c.s}</span>`).join('')}
function pokerAction(type){socket.emit('pokerAction',{type},res=>{if(res&&!res.ok)alert(res.error||'Poker action failed')})}function pokerRaise(){socket.emit('pokerAction',{type:'raise',amount:document.getElementById('praise').value},res=>{if(res&&!res.ok)alert(res.error||'Raise failed')})}
function spinSlots(){socket.emit('spinSlots',document.getElementById('slotbet').value,res=>{if(res.ok){slotLast=res.roll.join(' ')+(res.win?' WIN '+res.win:'');renderCasino()}})}function rouletteBet(){socket.emit('rouletteBet',{choice:document.getElementById('rchoice').value,bet:document.getElementById('rbet').value},()=>{})}function sendChat(){let v=document.getElementById('chat').value;socket.emit('chat',v)}function esc(s){return String(s||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}landing();
