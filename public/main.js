// --- Connexion Socket.IO ---
const socket = io('https://goatbattleroyal-simulator-production.up.railway.app', { transports:['websocket'] });

// --- UI ---
const menu = document.getElementById('menu');
const lobby = document.getElementById('lobby');
const lobbyInfo = document.getElementById('lobbyInfo');
const startBtn = document.getElementById('startBtn');
const inviteBtn = document.getElementById('inviteBtn');
const readyBtn = document.getElementById('readyBtn');
const leaveBtn = document.getElementById('leaveBtn');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const livesSpan = document.getElementById('lives');
const killsSpan = document.getElementById('kills');
const speedSpan = document.getElementById('speed');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');
const canvas = document.getElementById('canvas3d');
const ctx = canvas.getContext('2d');

// --- Variables ---
let players = {};
let projectiles = [];
let explosions = [];
let obstacles = [];
let localPlayer = { x:400, y:300, angle:0, name:'Chèvre', color:'#ff9966', lives:3, kills:0, stamina:100, speed:0 };
let keys = {};
let controlMode = 'wasd';
let roomId = null;
let host = false;
let ready = false;
let maxSpeed = 300; // km/h
let boostActive = false;

// --- Sons ---
const explosionSound = new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_cdb9d1e66c.mp3?filename=small-explosion-6821.mp3");

// --- Clavier ---
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- Bouton jouer ---
startBtn.onclick = () => {
  localPlayer.name = pseudoInput.value.trim() || 'Chèvre';
  localPlayer.color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value;
  socket.emit('create_room', { name: localPlayer.name, color: localPlayer.color }, res => {
    if(res.ok){
      roomId = res.roomId;
      host = true;
      menu.style.display = 'none';
      lobby.style.display = 'flex';
      lobbyInfo.innerText = 'Tu es le host ! En attente des joueurs...';
    } else alert(res.error);
  });
};

// --- Inviter ---
inviteBtn.onclick = () => {
  if(!roomId) return alert("Crée une partie d'abord !");
  const url = window.location.href + '?room=' + roomId;
  navigator.clipboard.writeText(url);
  alert('Lien copié !');
};

// --- Lobby ---
readyBtn.onclick = () => {
  ready = true;
  socket.emit('player_ready', { roomId });
  if(host) startCountdown();
};

leaveBtn.onclick = () => {
  socket.emit('leave_room', { roomId });
  lobby.style.display='none';
  menu.style.display='flex';
  resetPlayer();
};

// --- Retour menu ---
backToMenu.onclick = () => {
  endScreen.style.display='none';
  menu.style.display='flex';
  resetPlayer();
};

function resetPlayer(){
  localPlayer.lives=3;
  localPlayer.kills=0;
  localPlayer.stamina=100;
  projectiles=[];
  explosions=[];
}

// --- Socket events ---
socket.on('connect', ()=>console.log('✅ Connecté au serveur'));
socket.on('room_update', room => players=room.players);
socket.on('match_started', ()=>{ lobby.style.display='none'; startGame(); });
socket.on('you_died', ()=>showEnd("GAME OVER"));
socket.on('match_ended', winner => showEnd(`Top 1: ${winner}`));

// --- Countdown ---
function startCountdown(){
  let count=5;
  const interval = setInterval(()=>{
    lobbyInfo.innerText = 'La partie commence dans '+count+'...';
    if(count-- <= 0){
      clearInterval(interval);
      socket.emit('start_match', { roomId });
    }
  },1000);
}

// --- Obstacles ---
function initObstacles(){
  obstacles=[];
  for(let i=0;i<10;i++){
    obstacles.push({x:100+Math.random()*600,y:100+Math.random()*400,w:50,h:50});
  }
}

// --- Explosion ---
function createExplosion(x,y){
  explosions.push({x,y,r:10,alpha:1});
  explosionSound.currentTime=0; explosionSound.play();
}

// --- Game Loop ---
function startGame(){
  initObstacles();
  requestAnimationFrame(gameLoop);
}

function gameLoop(){
  handleInput();
  updateProjectiles();
  render();
  requestAnimationFrame(gameLoop);
}

// --- Input ---
function handleInput(){
  let speed = keys['f'] && localPlayer.stamina>0 ? 4 : 2;
  if(keys['f'] && localPlayer.stamina>0) { localPlayer.stamina-=0.5; boostActive=true; } else { localPlayer.stamina=Math.min(100,localPlayer.stamina+0.2); boostActive=false; }
  const fwd = (controlMode==='wasd') ? ((keys['w']?1:0)-(keys['s']?1:0)) : ((keys['arrowup']?1:0)-(keys['arrowdown']?1:0));
  const turn = (controlMode==='wasd') ? ((keys['d']?1:0)-(keys['a']?1:0)) : ((keys['arrowright']?1:0)-(keys['arrowleft']?1:0));
  localPlayer.angle += turn*0.05;
  const newX = localPlayer.x + Math.cos(localPlayer.angle)*fwd*speed;
  const newY = localPlayer.y + Math.sin(localPlayer.angle)*fwd*speed;
  if(newX>50 && newX<750 && newY>50 && newY<550){ localPlayer.x=newX; localPlayer.y=newY; }
  localPlayer.speed = fwd*speed*75;
  if(keys['g']) socket.emit('fire',{x:localPlayer.x,y:localPlayer.y});
  socket.emit('player_state', localPlayer);
}

// --- Projectiles ---
function updateProjectiles(){
  projectiles.forEach((p,i)=>{
    p.x+=p.vx; p.y+=p.vy; p.life-=100;
    if(p.life<=0) projectiles.splice(i,1);
    for(const id in players){
      if(id===p.owner) continue;
      const pl = players[id];
      if(Math.hypot(pl.x-p.x,pl.y-p.y)<16){
        pl.lives--;
        projectiles.splice(i,1);
        if(pl.lives<=0){
          if(id===socket.id) socket.emit('you_died');
          else localPlayer.kills++;
          delete players[id];
        }
      }
    }
  });
}

// --- Render ---
function render(){
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#88c070'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#654321'; ctx.lineWidth=10; ctx.strokeRect(40,40,720,520);
  // Obstacles
  ctx.fillStyle='#c2a34a'; for(let o of obstacles) ctx.fillRect(o.x,o.y,o.w,o.h);
  // Players
  for(const id in players){
    const p = players[id];
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.angle);
    ctx.fillStyle=p.color; ctx.fillRect(-15,-15,30,30);
    ctx.restore();
    ctx.fillStyle='black'; ctx.font='14px Arial';
    ctx.fillText(p.name,p.x-20,p.y-25);
  }
  // Projectiles
  ctx.fillStyle='yellow'; for(let pr of projectiles){ ctx.beginPath(); ctx.arc(pr.x,pr.y,5,0,Math.PI*2); ctx.fill(); }
  // Explosions
  explosions.forEach((e,i)=>{ ctx.fillStyle=`rgba(255,150,0,${e.alpha})`; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fill(); e.r+=3;e.alpha-=0.05; if(e.alpha<=0) explosions.splice(i,1); });
  // Stats
  livesSpan.textContent=localPlayer.lives;
  killsSpan.textContent=localPlayer.kills;
  speedSpan.textContent=Math.min(maxSpeed,Math.abs(localPlayer.speed).toFixed(0));
}

// --- End Screen ---
function showEnd(text){ endText.innerText=text; endScreen.style.display='flex'; createExplosion(localPlayer.x,localPlayer.y); }
