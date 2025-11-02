// --- Initialisation Socket.IO ---
const socket = io({ transports:['websocket'] });

// --- UI ---
const menu = document.getElementById('menu');
const menu2 = document.getElementById('menu2');
const startBtn = document.getElementById('startBtn');
const publicBtn = document.getElementById('publicBtn');
const privateBtn = document.getElementById('privateBtn');
const launchBtn = document.getElementById('launchBtn');
const inviteBtn = document.getElementById('inviteBtn');
const inviteInput = document.getElementById('inviteInput');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const backToMenu = document.getElementById('backToMenu');
const hudKills = document.getElementById('kills');
const hudTop = document.getElementById('top');
const hudSpeed = document.getElementById('speed');
const hudStamina = document.getElementById('stamina');
const playersList = document.getElementById('playersList');
const chatDiv = document.getElementById('chat');
const chatInput = document.getElementById('chatInput');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');

let scene, camera, renderer;
let localPlayer = { x:0, y:0, z:0, angle:0, name:'Chèvre', color:'#ff9966', lives:3, kills:0 };
let players = {};
let projectiles = [];
let keys = {};
let controlMode = 'wasd';
let roomId = null;
let stamina = 100;

// --- Three.js 3D ---
function initThree() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 2000);
  camera.position.set(0,50,100);
  renderer = new THREE.WebGLRenderer({canvas:document.getElementById('canvas3d')});
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Lumière
  const light = new THREE.DirectionalLight(0xffffff,1);
  light.position.set(100,200,100);
  scene.add(light);
  // Sol
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000,2000), new THREE.MeshPhongMaterial({color:0x228B22}));
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);
}

// --- Contrôles clavier ---
document.addEventListener('keydown', e => keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()]=false);

// --- Menu principal ---
startBtn.onclick = () => {
  localPlayer.name = pseudoInput.value || 'Chèvre';
  localPlayer.color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value || 'wasd';
  menu.style.display='none';
  menu2.style.display='flex';
};

// --- Lobby ---
let mode = 'public';
publicBtn.onclick = ()=>mode='public';
privateBtn.onclick = ()=>mode='private';
launchBtn.onclick = ()=>{
  socket.emit('launch_game',{roomId,mode});
  menu2.style.display='none';
  initThree();
  animate();
};
inviteBtn.onclick = ()=>{
  const target = inviteInput.value.trim();
  if(target) socket.emit('invite',{target,roomId});
};

// --- Chat ---
chatInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    const msg = chatInput.value.trim();
    if(msg){ socket.emit('chat',msg); chatInput.value=''; }
  }
});
socket.on('chat',data=>{
  const p = document.createElement('div');
  p.textContent = `${data.name}: ${data.msg}`;
  chatDiv.appendChild(p);
  chatDiv.scrollTop = chatDiv.scrollHeight;
});

// --- Joueur ---
socket.on('room_update',room=>{
  players=room.players;
  playersList.innerHTML = '';
  for(const id in players) playersList.innerHTML += `<div>${players[id].name}</div>`;
});

// --- Boucle de jeu ---
function animate(){
  requestAnimationFrame(animate);
  updatePlayer();
  renderer.render(scene,camera);
  updateHUD();
}

// --- Mise à jour HUD ---
function updateHUD(){
  hudKills.textContent = localPlayer.kills;
  hudTop.textContent = Object.keys(players).length;
  hudStamina.textContent = Math.floor(stamina);
}

// --- Déplacement joueur ---
function updatePlayer(){
  let speed = 0.5 + (keys['f'] && stamina>0?1:0);
  if(keys['f'] && stamina>0) stamina-=0.5;
  else if(stamina<100) stamina+=0.2;

  // WASD / Flèches
  let forward=0,right=0;
  if(controlMode==='wasd'){
    forward=(keys['w']?1:0)-(keys['s']?1:0);
    right=(keys['d']?1:0)-(keys['a']?1:0);
  }else{
    forward=(keys['arrowup']?1:0)-(keys['arrowdown']?1:0);
    right=(keys['arrowright']?1:0)-(keys['arrowleft']?1:0);
  }

  localPlayer.x+=forward*speed;
  localPlayer.z+=right*speed;
  camera.position.set(localPlayer.x+50,50,localPlayer.z+50);
  camera.lookAt(localPlayer.x,0,localPlayer.z);

  // Tir
  if(keys['g']) socket.emit('fire',{x:localPlayer.x,z:localPlayer.z,angle:localPlayer.angle});

  socket.emit('player_state',localPlayer);
}

// --- Mort ---
socket.on('you_died',()=>{endScreen.style.display='flex'; endText.textContent='GAME OVER';});
socket.on('match_ended',winner=>{endScreen.style.display='flex'; endText.textContent=`TOP 1 : ${winner}`;});
backToMenu.onclick = ()=>{endScreen.style.display='none'; menu.style.display='flex';};

// --- Réception projectiles ---
socket.on('projectile',p=>{projectiles.push(p);});
