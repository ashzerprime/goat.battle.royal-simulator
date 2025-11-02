// main.js
const socket = io('https://goatbattleroyal-simulator-production.up.railway.app', { transports:['websocket'] });

const menu = document.getElementById('menu');
const menu2 = document.getElementById('menu2');
const startBtn = document.getElementById('startBtn');
const pubBtn = document.getElementById('pubBtn');
const privBtn = document.getElementById('privBtn');
const launchBtn = document.getElementById('launchBtn');
const inviteBtn = document.getElementById('inviteBtn');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const controlsSelect = document.getElementById('controls');
const invitePseudo = document.getElementById('invitePseudo');
const backLobby = document.getElementById('backLobby');
const iaCountInput = document.getElementById('iaCount');
const soundToggle = document.getElementById('soundToggle');

const canvas = document.getElementById('canvas3d');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speed');
const chatDiv = document.getElementById('chat');
const chatInput = document.getElementById('chatInput');

let players = {};
let localPlayer = { x:400,y:300,angle:0,name:'Chèvre',color:'#ff9966',lives:3,stamina:100,speed:0 };
let projectiles = [];
let explosions = [];
let obstacles = [];
let keys = {};
let roomId = null;
let controlMode = 'wasd';
let gameStarted = false;
let chatMessages = [];

// --- clavier ---
document.addEventListener('keydown', e=>keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup', e=>keys[e.key.toLowerCase()]=false);

// --- Menu 1 ---
startBtn.onclick = () => {
  localPlayer.name = pseudoInput.value.trim()||'Chèvre';
  localPlayer.color = colorInput.value;
  controlMode = controlsSelect.value;
  menu.style.display='none';
  menu2.style.display='flex';
  socket.emit('create_room',{ name:localPlayer.name,color:localPlayer.color }, res=>{
    if(res.ok) roomId=res.roomId;
  });
};

// --- Menu 2 ---
backLobby.onclick = ()=>{ menu2.style.display='none'; menu.style.display='flex'; }
pubBtn.onclick = ()=>console.log('Publique sélectionné');
privBtn.onclick = ()=>console.log('Privée sélectionné');

// Inviter ami
inviteBtn.onclick = ()=>{
  const target = invitePseudo.value.trim();
  if(!target) return;
  alert(`Invitation envoyée à ${target} (simulé)`);
};

// Lancer partie
launchBtn.onclick = ()=>{
  gameStarted=true;
  menu2.style.display='none';
  initObstacles();
  gameLoop();
};

// --- chat ---
chatInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    const msg = chatInput.value.trim();
    if(!msg) return;
    chatMessages.push(`${localPlayer.name}: ${msg}`);
    if(chatMessages.length>10) chatMessages.shift();
    chatDiv.innerHTML=chatMessages.join('<br>');
    chatInput.value='';
  }
});

// --- obstacles ---
function initObstacles(){
  obstacles=[];
  for(let i=0;i<8;i++){
    obstacles.push({x:50+Math.random()*700,y:50+Math.random()*500,w:50,h:50});
  }
}

// --- déplacement ---
function handleInput(){
  let fwd=0, turn=0, jump=false, sprint=false;
  if(controlMode==='wasd'){ fwd=(keys['z']?1:0)-(keys['s']?1:0); turn=(keys['d']?1:0)-(keys['q']?1:0); }
  else{ fwd=(keys['ArrowUp']?1:0)-(keys['ArrowDown']?1:0); turn=(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0); }
  sprint=keys['f']; jump=keys[' '];
  localPlayer.angle+=turn*0.05;
  let speedVal=sprint?4:2;
  localPlayer.speed+=Math.min(300,localPlayer.speed+speedVal);
  localPlayer.x+=Math.cos(localPlayer.angle)*fwd*speedVal;
  localPlayer.y+=Math.sin(localPlayer.angle)*fwd*speedVal;
  // bornes
  localPlayer.x=Math.max(20,Math.min(780,localPlayer.x));
  localPlayer.y=Math.max(20,Math.min(580,localPlayer.y));
  // tir
  if(keys['g']){
    socket.emit('fire',{x:localPlayer.x,y:localPlayer.y});
  }
  socket.emit('player_state',localPlayer);
}

// --- explosions ---
function createExplosion(x,y){
  explosions.push({x,y,r:10,alpha:1});
}

// --- rendu ---
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // fond
  ctx.fillStyle='#88c'; ctx.fillRect(0,0,canvas.width,canvas.height);
  // obstacles
  ctx.fillStyle='#c2a34a'; for(const o of obstacles) ctx.fillRect(o.x,o.y,o.w,o.h);
  // joueurs
  for(const id in players){
    const p=players[id];
    ctx.save();
    ctx.translate(p.x,p.y); ctx.rotate(p.angle);
    ctx.fillStyle=p.color; ctx.fillRect(-15,-15,30,30);
    ctx.restore();
    ctx.fillStyle='black'; ctx.font='14px Arial'; ctx.fillText(p.name,p.x-20,p.y-20);
  }
  // projectiles
  for(const pr of projectiles){
    ctx.fillStyle='yellow'; ctx.beginPath(); ctx.arc(pr.x,pr.y,5,0,Math.PI*2); ctx.fill();
  }
  // explosions
  for(let i=explosions.length-1;i>=0;i--){
    const e=explosions[i];
    ctx.fillStyle=`rgba(255,150,0,${e.alpha})`;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fill();
    e.r+=3; e.alpha-=0.05; if(e.alpha<=0) explosions.splice(i,1);
  }
  // vitesse
  speedDisplay.textContent=`Vitesse: ${Math.floor(localPlayer.speed)} km/h`;
}

// --- boucle ---
function gameLoop(){ if(!gameStarted) return; handleInput(); render(); requestAnimationFrame(gameLoop); }

// --- socket ---
socket.on('connect',()=>console.log('Connecté'));
socket.on('room_update',room=>players=room.players||{});
socket.on('you_died',()=>alert('GAME OVER'));
socket.on('hit_effect',data=>createExplosion(data.x,data.y));
