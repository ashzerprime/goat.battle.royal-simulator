// main.js - Goat Battle Royale 3D

// --- Socket.IO ---
const socket = io('https://goatbattleroyal-simulator-production.up.railway.app', { transports: ['websocket'] });

// --- UI ---
const menu = document.getElementById('menu');
const menu2 = document.getElementById('menu2');
const startBtn = document.getElementById('startBtn');
const publicBtn = document.getElementById('publicBtn');
const privateBtn = document.getElementById('privateBtn');
const inviteBtn = document.getElementById('inviteBtn');
const inviteInput = document.getElementById('inviteInput');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');
const countNum = document.getElementById('countNum');
const canvas = document.getElementById('canvas3d');
const ctx = canvas.getContext('2d');
const speedEl = document.getElementById('speed');

// --- Variables ---
let players = {};
let projectiles = [];
let explosions = [];
let localPlayer = { x:400, y:300, angle:0, name:'Chèvre', color:'#ff9966', lives:3, stamina:100, speed:0 };
let controlMode = 'wasd';
let keys = {};
let roomId = null;
let gameStarted = false;

// --- Input clavier ---
document.addEventListener('keydown', e=>keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup', e=>keys[e.key.toLowerCase()]=false);

// --- Connexion serveur ---
socket.on('connect', ()=>console.log('Connecté au serveur'));
socket.on('room_update', room=>{ players = room.players; });
socket.on('you_died', ()=>showEnd('GAME OVER'));
socket.on('match_ended', winner=>showEnd(`TOP 1 : ${winner}`));

// --- Boutons ---
startBtn.onclick = () => {
  localPlayer.name = pseudoInput.value.trim() || 'Chèvre';
  localPlayer.color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value;
  menu.style.display = 'none';
  menu2.style.display = 'flex';
};

publicBtn.onclick = ()=>startGame('public');
privateBtn.onclick = ()=>startGame('private');

inviteBtn.onclick = ()=>{
  const friend = inviteInput.value.trim();
  if(!friend){ alert("Pseudo vide"); return; }
  socket.emit('invite_friend', { friend, roomId });
  alert(`Invitation envoyée à ${friend}`);
};

backToMenu.onclick = ()=>{
  endScreen.style.display='none';
  menu.style.display='flex';
  gameStarted=false;
};

// --- Lancer partie ---
function startGame(type){
  roomId = 'room-'+Math.random().toString(36).substr(2,6);
  socket.emit('create_room', { name: localPlayer.name, color: localPlayer.color }, res=>{
    if(res.ok){
      menu2.style.display='none';
      gameStarted=true;
      countdownStart(5);
    } else alert('Erreur: '+res.error);
  });
}

// --- Countdown ---
function countdownStart(sec){
  let t = sec;
  countNum.innerText = t;
  const timer = setInterval(()=>{
    t--;
    countNum.innerText=t;
    if(t<=0){
      clearInterval(timer);
      gameLoop();
    }
  },1000);
}

// --- Mouvement ---
function handleInput(){
  let fwd=0, turn=0;
  if(controlMode==='wasd'){
    fwd=(keys['w']?1:0)-(keys['s']?1:0);
    turn=(keys['d']?1:0)-(keys['a']?1:0);
  }else if(controlMode==='zqsd'){
    fwd=(keys['z']?1:0)-(keys['s']?1:0);
    turn=(keys['d']?1:0)-(keys['q']?1:0);
  }else if(controlMode==='arrows'){
    fwd=(keys['arrowup']?1:0)-(keys['arrowdown']?1:0);
    turn=(keys['arrowright']?1:0)-(keys['arrowleft']?1:0);
  }

  let speed = keys['f'] && localPlayer.stamina>0 ? 5 : 2;
  if(keys['f'] && localPlayer.stamina>0) localPlayer.stamina=Math.max(0,localPlayer.stamina-0.5);
  else if(!keys['f']) localPlayer.stamina=Math.min(100,localPlayer.stamina+0.2);

  localPlayer.angle += turn*0.05;
  localPlayer.x += Math.cos(localPlayer.angle)*fwd*speed;
  localPlayer.y += Math.sin(localPlayer.angle)*fwd*speed;
  localPlayer.speed = speed*30;

  // Tir
  if(keys['g']) socket.emit('fire',{ x:localPlayer.x, y:localPlayer.y });

  // Envoi état au serveur
  socket.emit('player_state', localPlayer);
}

// --- Game loop ---
function gameLoop(){
  if(!gameStarted) return;
  handleInput();
  render();
  requestAnimationFrame(gameLoop);
}

// --- Render 3D minimal ---
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // Enclos
  ctx.strokeStyle='#654321';
  ctx.lineWidth=10;
  ctx.strokeRect(40,40,720,520);

  // Joueurs
  for(const id in players){
    const p = players[id];
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle=p.color;
    ctx.fillRect(-15,-15,30,30);
    ctx.restore();
    ctx.fillStyle='black';
    ctx.font='14px Arial';
    ctx.fillText(p.name,p.x-20,p.y-25);
  }

  // Vitesse
  speedEl.innerText='Vitesse: '+Math.round(localPlayer.speed)+' km/h';
}

// --- Fin ---
function showEnd(text){
  endText.innerText=text;
  endScreen.style.display='flex';
  gameStarted=false;
}
