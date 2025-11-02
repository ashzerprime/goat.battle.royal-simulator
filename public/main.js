// --- Connexion Socket.IO ---
const socket = io('https://goatbattleroyal-simulator-production.up.railway.app', { transports: ['websocket'] });

// --- UI ---
const menu = document.getElementById('menu');
const menu2 = document.getElementById('menu2');
const startBtn = document.getElementById('startBtn');
const startGameBtn = document.getElementById('startGameBtn');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const backToMenu = document.getElementById('backToMenu');
const inviteInput = document.getElementById('inviteInput');
const inviteBtn = document.getElementById('inviteBtn');
const lobbyPlayers = document.getElementById('lobbyPlayers');
const chat = document.getElementById('chat');
const chatInput = document.getElementById('chatInput');
const speedDiv = document.getElementById('speed');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');

const canvas = document.getElementById('gameCanvas');

// --- Variables ---
let localPlayer = { x: 0, y:0, z:0, angle:0, name:'Chèvre', color:'#ff9966', lives:3, speed:0 };
let players = {};
let projectiles = [];
let obstacles = [];
let keys = {};
let controlMode = 'wasd';
let roomId = null;
let host = false;
let mode = 'public';

// --- Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
camera.position.set(0, 30, 50);
camera.lookAt(0,0,0);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50,50,50);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

const ground = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 100), new THREE.MeshPhongMaterial({ color:0x228B22 }));
ground.position.y = -0.5;
scene.add(ground);

// --- Gestion clavier ---
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- Joueur 3D ---
function createPlayerMesh(player) {
  const geo = new THREE.BoxGeometry(2,2,2);
  const mat = new THREE.MeshPhongMaterial({ color: player.color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.id = player.id;
  scene.add(mesh);
  return mesh;
}

// Stockage des meshes
const playerMeshes = {};
const projectileMeshes = [];

// --- Start Menu ---
startBtn.onclick = () => {
  localPlayer.name = pseudoInput.value || 'Chèvre';
  localPlayer.color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value || 'wasd';

  // Créer la salle
  socket.emit('create_room', { name: localPlayer.name, color: localPlayer.color }, res=>{
    if(res.ok){
      roomId = res.roomId;
      host = true;
      menu.style.display = 'none';
      menu2.style.display = 'flex';
    } else alert('Erreur: ' + res.error);
  });
};

// --- Lobby Menu2 ---
startGameBtn.onclick = () => {
  if(!host) { alert("Seul l'hôte peut lancer la partie"); return; }
  socket.emit('start_match', { roomId, mode });
};

// --- Invitation ---
inviteBtn.onclick = ()=>{
  const friend = inviteInput.value.trim();
  if(!friend) return;
  socket.emit('invite_friend', { roomId, friend });
};

// --- Chat ---
chatInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    socket.emit('chat_message', { text: chatInput.value, roomId });
    chatInput.value='';
  }
});

// --- Événements Socket.IO ---
socket.on('room_update', data=>{
  players = data.players;
  updateLobbyUI();
});

socket.on('match_started', ()=>{ menu2.style.display='none'; gameLoop(); });
socket.on('you_died', ()=>{ endScreen.style.display='flex'; endText.innerText='GAME OVER'; });
socket.on('match_ended', winner =>{ endScreen.style.display='flex'; endText.innerText=`TOP 1 : ${winner}`; });

socket.on('chat_message', data=>{
  const p = document.createElement('div');
  p.innerText = `${data.name}: ${data.text}`;
  chat.appendChild(p);
  chat.scrollTop = chat.scrollHeight;
});

// --- Lobby UI ---
function updateLobbyUI(){
  lobbyPlayers.innerHTML='';
  for(const id in players){
    const p = document.createElement('div');
    p.innerText = players[id].name;
    lobbyPlayers.appendChild(p);
  }
}

// --- Déplacement ---
function handleInput(delta){
  let fwd=0, turn=0;
  let sprint = keys['f'] ? 2 : 1;

  if(controlMode==='wasd'){
    fwd = (keys['w'] ? 1 :0) - (keys['s'] ? 1:0);
    turn = (keys['d'] ? 1:0) - (keys['a'] ? 1:0);
  } else if(controlMode==='zqsd'){
    fwd = (keys['z'] ? 1:0) - (keys['s'] ? 1:0);
    turn = (keys['d'] ? 1:0) - (keys['q'] ? 1:0);
  } else if(controlMode==='arrows'){
    fwd = (keys['ArrowUp'] ? 1:0) - (keys['ArrowDown'] ? 1:0);
    turn = (keys['ArrowRight'] ? 1:0) - (keys['ArrowLeft'] ? 1:0);
  }

  localPlayer.angle += turn*0.05;
  localPlayer.x += Math.cos(localPlayer.angle)*fwd*sprint*0.5;
  localPlayer.z += Math.sin(localPlayer.angle)*fwd*sprint*0.5;
  localPlayer.speed = Math.abs(fwd*sprint*30);

  speedDiv.innerText = Math.floor(localPlayer.speed*10) + ' km/h';
  socket.emit('player_state', localPlayer);
}

// --- Game Loop ---
function gameLoop(){
  requestAnimationFrame(gameLoop);
  const delta = 0.016;
  handleInput(delta);

  // Update player meshes
  for(const id in players){
    if(!playerMeshes[id]) playerMeshes[id] = createPlayerMesh(players[id]);
    const mesh = playerMeshes[id];
    mesh.position.set(players[id].x,1,players[id].z);
    mesh.rotation.y = players[id].angle;
  }

  renderer.render(scene, camera);
}

// --- Back to Menu ---
backToMenu.onclick = ()=>{
  endScreen.style.display='none';
  menu.style.display='flex';
};
