// main.js - Goat Battle Royale 3D avec explosions et Top 1

// ---- UI ----
const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const livesSpan = document.getElementById('lives');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');

// ---- Variables ----
let socket = io('https://goatbattleroyal-simulator-production.up.railway.app');
let roomId = null;
let playerId = null;
let players = {};
let projectiles = [];
let explosions = [];
let localPlayer = { x:0, y:0, angle:0, name:'Chèvre', color:'#ff9966', lives:3 };
let keys = {};
let controlMode = 'wasd';

// ---- Three.js ----
let scene, camera, renderer;
let playerMeshes = {};
let projectileMeshes = [];
let localMesh;

// ---- init Three.js ----
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccee);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 15, 25);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff,1);
  light.position.set(10,20,10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x888888));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200,200),
    new THREE.MeshStandardMaterial({ color:0x228822 })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);

  const geometry = new THREE.BoxGeometry(2,2,2);
  const material = new THREE.MeshStandardMaterial({ color: localPlayer.color });
  localMesh = new THREE.Mesh(geometry, material);
  scene.add(localMesh);
}

// ---- Socket.IO ----
socket.on('connect', ()=>{ console.log('Connecté', socket.id); playerId = socket.id; });

socket.on('room_update', (room)=>{
  players = room.players;
  updatePlayerMeshes();

  // vérifier Top 1
  const alive = Object.values(players).filter(p=>!p.isBot || p.lives>0);
  if(alive.length === 1 && alive[0].name === localPlayer.name){
    endScreen.style.display='block';
    endText.innerText='TOP 1 ! Vous avez gagné 🏆';
  }
});

socket.on('match_started', ()=>{ menu.style.display='none'; startGame(); });

socket.on('you_died', ()=>{
  endScreen.style.display='block';
  endText.innerText='Vous êtes mort ! Retour au menu.';
});

// ---- Menu ----
startBtn.onclick = ()=>{
  const name = pseudoInput.value.trim() || 'Chèvre';
  const color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value || 'wasd';
  localPlayer.name = name;
  localPlayer.color = color;

  socket.emit('create_room',{ name, color }, (res)=>{
    if(res.ok){ roomId=res.roomId; menu.style.display='none'; initThree(); }
  });
};

document.addEventListener('keydown', e=>keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup', e=>keys[e.key.toLowerCase()]=false);

// ---- boucle jeu ----
function startGame() {
  function gameLoop() {
    handleInput();
    sendPlayerState();
    updateProjectiles();
    updateExplosions();
    updateCamera();
    renderer.render(scene,camera);
    requestAnimationFrame(gameLoop);
  }
  gameLoop();
}

// ---- mouvement joueur ----
function handleInput() {
  const speed = keys['r']?0.3:0.15;
  let forward=0, turn=0;

  if(controlMode==='wasd'){ forward=(keys['w']?1:0)-(keys['s']?1:0); turn=(keys['d']?1:0)-(keys['a']?1:0); }
  else { forward=(keys['z']?1:0)-(keys['s']?1:0); turn=(keys['d']?1:0)-(keys['q']?1:0); }

  localPlayer.angle += turn*0.05;
  localPlayer.x += Math.cos(localPlayer.angle)*forward*speed;
  localPlayer.y += Math.sin(localPlayer.angle)*forward*speed;

  localMesh.position.set(localPlayer.x,1,localPlayer.y);
  localMesh.rotation.y = -localPlayer.angle;

  if(keys['f']){
    socket.emit('fire',{x:localPlayer.x, y:localPlayer.y});
    addProjectile(localPlayer.x, localPlayer.y, localPlayer.angle);
  }
}

// ---- envoyer état ----
function sendPlayerState(){
  socket.emit('player_state',{
    x:localPlayer.x, y:localPlayer.y, angle:localPlayer.angle, name:localPlayer.name, color:localPlayer.color
  });
}

// ---- joueurs ----
function updatePlayerMeshes(){
  for(const id in players){
    if(id===playerId) continue;
    if(!playerMeshes[id]){
      const g = new THREE.BoxGeometry(2,2,2);
      const m = new THREE.MeshStandardMaterial({ color:players[id].color||0xff0000 });
      const mesh = new THREE.Mesh(g,m);
      scene.add(mesh);
      playerMeshes[id]=mesh;
    }
    const p = players[id];
    playerMeshes[id].position.set(p.x,1,p.y);
    playerMeshes[id].rotation.y = -p.angle;
  }
}

// ---- projectiles ----
function addProjectile(x,y,angle){
  const g = new THREE.BoxGeometry(0.5,0.5,0.5); // cube projectile
  const m = new THREE.MeshStandardMaterial({ color:0xffff00 });
  const mesh = new THREE.Mesh(g,m);
  mesh.userData = { x:x, y:y, vx:Math.cos(angle)*0.5, vy:Math.sin(angle)*0.5, life:50 };
  mesh.position.set(x,1,y);
  scene.add(mesh);
  projectileMeshes.push(mesh);
}

function updateProjectiles(){
  for(let i=projectileMeshes.length-1;i>=0;i--){
    const p = projectileMeshes[i];
    p.userData.x += p.userData.vx;
    p.userData.y += p.userData.vy;
    p.position.set(p.userData.x,1,p.userData.y);
    p.userData.life--;

    if(p.userData.life<=0){
      addExplosion(p.userData.x, p.userData.y);
      scene.remove(p);
      projectileMeshes.splice(i,1);
    }
  }
}

// ---- explosions ----
function addExplosion(x,y){
  const particles = [];
  const g = new THREE.BoxGeometry(0.3,0.3,0.3);
  for(let i=0;i<10;i++){
    const m = new THREE.Mesh(g,new THREE.MeshStandardMaterial({ color:0xff5500 }));
    m.position.set(x,1,y);
    m.userData = { vx:(Math.random()-0.5)*0.5, vy:(Math.random()-0.5)*0.5, life:20+Math.random()*20 };
    scene.add(m);
    particles.push(m);
  }
  explosions.push(particles);
}

function updateExplosions(){
  for(let i=explosions.length-1;i>=0;i--){
    const arr = explosions[i];
    for(let j=arr.length-1;j>=0;j--){
      const p = arr[j];
      p.position.x += p.userData.vx;
      p.position.z += p.userData.vy;
      p.userData.life--;
      if(p.userData.life<=0){ scene.remove(p); arr.splice(j,1); }
    }
    if(arr.length===0) explosions.splice(i,1);
  }
}

// ---- caméra ----
function updateCamera(){
  camera.position.x = localPlayer.x - Math.sin(localPlayer.angle)*10;
  camera.position.z = localPlayer.y - Math.cos(localPlayer.angle)*10;
  camera.position.y = 8;
  camera.lookAt(localPlayer.x,1,localPlayer.y);
}
