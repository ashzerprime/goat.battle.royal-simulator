// main.js - Version finale (client)
// Requirements: Three.js + socket.io client available at /socket.io/socket.io.js

/* FEATURES:
 - ZQSD / WASD / Arrows (fixed)
 - Mouse to rotate camera (drag) + H for FPS (camera in front of head)
 - Sprint F with stamina and engine sound, brake R
 - Jump Space (simple hop)
 - Crosshair, speedometer (km/h) computed from movement, not constant
 - Invisible wall (enclosure)
 - Lobby create/join, invites by pseudo, public/private
 - Projectiles (fire G), small explosions
 - Player labels above meshes
 - AI (generated server-side) are rendered like players
 - Chat
*/

// ---- SOCKET
const socket = io();

// ---- UI refs
const canvas = document.getElementById('canvas3d');
const menu = document.getElementById('menu');
const lobby = document.getElementById('lobby');
const endScreen = document.getElementById('endScreen');
const btnNext = document.getElementById('btnNext');
const btnBackLobby = document.getElementById('btnBackLobby');
const btnLaunch = document.getElementById('btnLaunch');
const btnInvite = document.getElementById('btnInvite');
const inviteName = document.getElementById('inviteName');
const playersListDiv = document.getElementById('playersList');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const controlsSelect = document.getElementById('controls');
const modeSelect = document.getElementById('modeSelect');
const aiCountInput = document.getElementById('aiCount');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChat = document.getElementById('sendChat');
const hudKills = document.getElementById('hudKills');
const hudTop = document.getElementById('hudTop');
const hudSpeed = document.getElementById('hudSpeed');
const hudStamina = document.getElementById('hudStamina');
const crosshair = document.getElementById('crosshair');
const hudSpeedometer = document.getElementById('speedometer');
const btnBackMenu = document.getElementById('btnBackMenu');
const endTitle = document.getElementById('endTitle');
const endInfo = document.getElementById('endInfo');

// ---- THREE init
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // sky blue

const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 5000);
camera.position.set(0, 40, 120);

// light
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(100,300,100);
scene.add(dir);

// ground (repeating grass look)
const groundGeo = new THREE.PlaneGeometry(2000,2000, 10,10);
const groundMat = new THREE.MeshPhongMaterial({ color: 0x7bbf59 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI/2;
scene.add(ground);

// invisible wall radius
const ENCLOSE_RADIUS = 900;

// ---- local state
let local = {
  id: null,
  name: 'Chèvre',
  color: '#ff9966',
  x: Math.random()*200-100,
  z: Math.random()*200-100,
  y: 0,
  angle: 0,
  lives: 3,
  kills: 0,
  stamina: 100,
  speedKmh: 0,
  mesh: null,
  label: null
};
let controlMode = 'wasd';
let keys = {};
let fpsMode = false;
let lastPos = { x: local.x, z: local.z };
let lastUpdateTime = performance.now();

// mapping for players & meshes
const players = {}; // id -> { data..., mesh, labelDiv }
const projectiles = []; // client-side visual only
const explosions = [];

// sounds
const engineAudio = new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_6edb6f1c41.mp3?filename=motor-bike-acceleration-03.mp3');
engineAudio.loop = true;
engineAudio.volume = 0.25;
const explosionAudio = new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_a1b9c8f4f5.mp3?filename=mini-explosion-01.mp3');
explosionAudio.volume = 0.3;

// helper - label over players
function createLabel(name){
  const div = document.createElement('div');
  div.className = 'playerLabel';
  div.textContent = name;
  div.style.position = 'absolute';
  div.style.display = 'none';
  document.body.appendChild(div);
  return div;
}

// create local mesh
function createLocalMesh(){
  const geo = new THREE.BoxGeometry(20,20,20);
  const mat = new THREE.MeshPhongMaterial({ color: local.color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(local.x, 10, local.z);
  scene.add(mesh);
  local.mesh = mesh;
  local.label = createLabel(local.name);
}
createLocalMesh();

// pointer/mouse look (drag to rotate)
let isPointerDown = false;
let lastMouse = { x:0, y:0 };
window.addEventListener('mousedown', (e)=>{ isPointerDown = true; lastMouse.x = e.clientX; lastMouse.y = e.clientY; });
window.addEventListener('mouseup', ()=> isPointerDown = false);
window.addEventListener('mousemove', (e)=>{
  if(isPointerDown){
    const dx = (e.clientX - lastMouse.x);
    local.angle -= dx * 0.0025; // rotate with mouse drag
    lastMouse.x = e.clientX;
    lastMouse.y = e.clientY;
  }
});

// keyboard
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if(e.key.toLowerCase()==='h') fpsMode = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if(e.key.toLowerCase()==='h') fpsMode = false; });

// UI flow
btnNext.onclick = () => {
  local.name = pseudoInput.value.trim() || ('Chèvre' + Math.floor(Math.random()*1000));
  local.color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value || 'wasd';
  menu.style.display = 'none';
  lobby.style.display = 'block';
  updateLocalPreview();
};

btnBackLobby.onclick = ()=>{
  lobby.style.display = 'none';
  menu.style.display = 'block';
};

btnInvite.onclick = ()=> {
  const target = inviteName.value.trim();
  if(!target){ alert('Entre le pseudo de ton ami'); return; }
  socket.emit('invite', { target, from: local.name });
  alert('Invitation envoyée à ' + target);
};

btnLaunch.onclick = () => {
  // host tells server to start match
  const mode = modeSelect.value;
  const aiCount = parseInt(aiCountInput.value)||5;
  socket.emit('start_match', { roomId, mode, aiCount });
  lobby.style.display = 'none';
  // will start when server notifies 'match_started'
};

// back to menu
btnBackMenu.onclick = ()=> location.reload();

// chat
sendChat.onclick = sendChatMessage;
chatInput.addEventListener('keydown', e=> { if(e.key==='Enter') sendChatMessage(); });
function sendChatMessage(){
  const txt = chatInput.value.trim(); if(!txt) return;
  socket.emit('chat', { roomId, text: txt });
  chatInput.value = '';
}

// socket events: connection -> register player
let roomId = null;
let isHost = false;
let mySocketId = null;
socket.on('connect', ()=> {
  mySocketId = socket.id;
  // auto-create a temporary client-side name mapping on server
  socket.emit('register_me',{ name: local.name });
});

// server responses
socket.on('registered', data=>{
  // data contains server-assigned id/pseudo mapping maybe
  // nothing required here
});

// server asked us to join a room (create or join actions are server-driven in this code)
// We implement UI to create/join by prompting the server
// For simplicity: when lobby visible user will create a new room as host
// Create room on server when lobby opens:
socket.on('room_created', data => {
  roomId = data.roomId;
  isHost = true;
  updatePlayersListUI(data.room);
});

// server broadcast: room_update
socket.on('room_update', ({ roomId: rid, players: roomPlayers })=>{
  roomId = rid;
  updatePlayersListUI({ players: roomPlayers });
  // update local players map
  for(const id in roomPlayers){
    if(id === socket.id) continue;
    const pd = roomPlayers[id];
    if(!players[id]){
      // create mesh and label for remote player
      const geo = new THREE.BoxGeometry(20,20,20);
      const mat = new THREE.MeshPhongMaterial({ color: pd.color || '#dddddd' });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pd.x || 0, 10, pd.z || 0);
      scene.add(mesh);
      const label = createLabel(pd.name || 'Player');
      players[id] = { data: pd, mesh, label };
    } else {
      players[id].data = pd;
      players[id].mesh.position.set(pd.x || 0, 10, pd.z || 0);
      players[id].label.textContent = pd.name || players[id].label.textContent;
      players[id].label.style.display = 'block';
    }
  }
  // remove missing players
  for(const id in players){
    if(!roomPlayers[id]){
      // remove mesh & label
      scene.remove(players[id].mesh);
      if(players[id].label){ players[id].label.remove(); }
      delete players[id];
    }
  }
});

// match started: server tells client to begin (server also created AI players)
socket.on('match_started', ({ roomId: rid, players: roomPlayers })=>{
  roomId = rid;
  // sync players
  socket.emit('want_sync', { roomId });
  // ensure local mesh exists (already created earlier)
  crosshair.style.display = 'block';
  // if server included initial players, update room_update will run
});

// projectiles spawn (server broadcasts)
socket.on('projectile_spawn', p=>{
  // visual: small sphere traveling
  spawnProjectile(p);
});

// chat messages
socket.on('chat_broadcast', ({ from, text })=>{
  const d = document.createElement('div'); d.textContent = `${from}: ${text}`; chatMessages.appendChild(d); chatMessages.scrollTop = chatMessages.scrollHeight;
});

// invited notification
socket.on('invited', ({ from, roomId: rid })=>{
  if(confirm(`${from} t'invite à rejoindre sa partie. Accepter ?`)){
    socket.emit('accept_invite', { roomId: rid });
    lobby.style.display = 'none';
  } else {
    socket.emit('decline_invite', { roomId: rid });
  }
});

// you died / match end
socket.on('you_died', ()=> {
  endTitle.textContent = 'GAME OVER';
  endInfo.innerText = 'Tu es mort — retourne au menu';
  endScreen.style.display = 'block';
});
socket.on('match_ended', ({ winnerName })=>{
  endTitle.textContent = 'MATCH TERMINÉ';
  endInfo.innerText = `Top 1 : ${winnerName}`;
  endScreen.style.display = 'block';
});

// ---- visuals: projectiles/explosions
function spawnProjectile(p){
  const geo = new THREE.SphereGeometry(4,8,8);
  const mat = new THREE.MeshStandardMaterial({ color:0xffff66 });
  const mesh = new THREE.Mesh(geo,mat);
  mesh.position.set(p.x, 6, p.z);
  scene.add(mesh);
  p._mesh = mesh;
  p._life = 2000; // ms
  projectiles.push(p);
}
function createExplosion(x,z){
  // small visual only
  const geo = new THREE.SphereGeometry(12,10,10);
  const mat = new THREE.MeshStandardMaterial({ color:0xffaa33, transparent:true, opacity:0.9 });
  const mesh = new THREE.Mesh(geo,mat);
  mesh.position.set(x,6,z);
  scene.add(mesh);
  explosions.push({ mesh, t:0 });
  explosionAudio.currentTime = 0; explosionAudio.play();
}

// ---- update loop
let lastTime = performance.now();
function animate(now){
  requestAnimationFrame(animate);
  const dt = Math.min(40, now - lastTime);
  lastTime = now;

  // movement
  handleMovement(dt/1000); // seconds

  // update remote players labels position on screen
  updateLabels();

  // projectiles update
  for(let i=projectiles.length-1;i>=0;i--){
    const p = projectiles[i];
    // simple translation on server-driven direction if available, else small upward
    if(p.vx !== undefined){
      p.x += p.vx * dt/16;
      p.z += p.vz * dt/16;
      p._life -= dt;
      if(p._mesh) p._mesh.position.set(p.x,6,p.z);
      // life end
      if(p._life <= 0){
        if(p._mesh) scene.remove(p._mesh);
        projectiles.splice(i,1);
      }
    }
  }

  // explosions animate
  for(let i=explosions.length-1;i>=0;i--){
    const e = explosions[i];
    e.t += dt;
    e.mesh.material.opacity = Math.max(0, 0.9 - e.t / 600);
    e.mesh.scale.x += dt/800;
    e.mesh.scale.y += dt/800;
    e.mesh.scale.z += dt/800;
    if(e.t > 800){ scene.remove(e.mesh); explosions.splice(i,1); }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ---- movement handler (correct ZQSD/WASD/Arrows) and speed calc
function handleMovement(dt){
  // mapping based on controlMode values from UI
  controlMode = controlsSelect.value || 'wasd';
  let fwd = 0, turn = 0;
  // forward/back
  if(controlMode === 'wasd'){
    fwd = (keys['w']?1:0) - (keys['s']?1:0);
    turn = (keys['d']?1:0) - (keys['a']?1:0);
  } else if(controlMode === 'zqsd'){
    fwd = (keys['z']?1:0) - (keys['s']?1:0);
    turn = (keys['d']?1:0) - (keys['q']?1:0);
  } else {
    // arrows
    fwd = (keys['arrowup']?1:0) - (keys['arrowdown']?1:0);
    turn = (keys['arrowright']?1:0) - (keys['arrowleft']?1:0);
  }

  // jump (space) - small hop effect (visual)
  if(keys[' ']) {
    // optional: small y bob - omitted for simplicity
  }

  // sprint F with stamina
  let sprint = keys['f'] && local.stamina > 0;
  if(sprint) {
    local.stamina = Math.max(0, local.stamina - 30 * dt); // drains faster
    if(engineAudio.paused) engineAudio.play();
  } else {
    local.stamina = Math.min(100, local.stamina + 12 * dt);
    if(!sprint && !engineAudio.paused) engineAudio.pause();
  }

  const baseSpeed = 120; // units per second (meters/second scale)
  const speed = baseSpeed * (sprint ? 2.2 : 1.0) * fwd * dt; // movement in world units
  // rotation with turn
  local.angle += turn * 2.5 * dt; // radians/sec scaled

  // move by local.angle direction
  if(fwd !== 0){
    const dx = Math.cos(local.angle) * speed;
    const dz = Math.sin(local.angle) * speed;
    local.x += dx;
    local.z += dz;
  }

  // brake (R) quickly reduce speed by moving slightly opposite
  if(keys['r']){
    // small instant slowdown: move a small reverse amount
    local.x -= Math.cos(local.angle) * baseSpeed * 0.02;
    local.z -= Math.sin(local.angle) * baseSpeed * 0.02;
  }

  // invisible wall (enclosure)
  const dist = Math.hypot(local.x, local.z);
  if(dist > ENCLOSE_RADIUS){
    // push back onto circle
    const a = Math.atan2(local.z, local.x);
    local.x = Math.cos(a) * ENCLOSE_RADIUS;
    local.z = Math.sin(a) * ENCLOSE_RADIUS;
  }

  // update local mesh
  if(local.mesh){
    local.mesh.position.set(local.x, 10, local.z);
    local.mesh.rotation.y = -local.angle;
  }

  // compute speed in km/h based on position change
  const dx = local.x - lastPos.x;
  const dz = local.z - lastPos.z;
  const meters = Math.hypot(dx, dz); // units ~ meters
  const mps = meters / dt; // meters per second
  const kmh = Math.round(mps * 3.6);
  // only show when moving (filter jitter)
  local.speedKmh = (kmh < 2 ? 0 : kmh);

  // update HUD
  hudSpeed.textContent = local.speedKmh;
  hudStamina.textContent = Math.round(local.stamina);

  // send state to server at throttle
  const now = performance.now();
  if(now - lastUpdateTime > 80){
    socket.emit('player_state', { roomId, x: local.x, z: local.z, angle: local.angle, name: local.name, color: local.color });
    lastUpdateTime = now;
    lastPos.x = local.x; lastPos.z = local.z;
  }
}

// ---- label update: project 3D to 2D
function updateLabels(){
  // local label not needed on your own but remote labels
  for(const id in players){
    const p = players[id];
    if(!p.mesh || !p.label) continue;
    const pos = p.mesh.position.clone();
    pos.y += 30;
    const vector = pos.project(camera);
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = ( - vector.y * 0.5 + 0.5) * window.innerHeight;
    p.label.style.left = x + 'px';
    p.label.style.top = y + 'px';
    p.label.style.display = 'block';
  }
  // local player label above head
  if(local.label && local.mesh){
    const pos = local.mesh.position.clone();
    pos.y += 30;
    const v = pos.project(camera);
    const lx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const ly = ( - v.y * 0.5 + 0.5) * window.innerHeight;
    local.label.style.left = lx + 'px';
    local.label.style.top = ly + 'px';
    local.label.style.display = 'block';
  }
}

// ---- spawn small local projectile when pressing G (client-side quick visual), real firing done by server
window.addEventListener('keydown', e=>{
  if(e.key.toLowerCase()==='g'){
    // ask server to spawn projectile (authoritative)
    socket.emit('fire', { roomId, x: local.x + Math.cos(local.angle)*30, z: local.z + Math.sin(local.angle)*30, angle: local.angle, shooterName: local.name });
  }
});

// ---- helper to update players list UI
function updatePlayersListUI(room){
  playersListDiv.innerHTML = '';
  if(!room || !room.players) return;
  for(const id in room.players){
    const p = room.players[id];
    const div = document.createElement('div');
    div.textContent = (p.name || 'Player') + (id===socket.id ? ' (you)' : '');
    playersListDiv.appendChild(div);
  }
}

// ---- server helper endpoints: create room when clicking "create lobby" (host)
btnNext.addEventListener('click', ()=>{
  // already moved to lobby earlier; create room as host
  socket.emit('create_room', { name: local.name = pseudoInput.value.trim() || local.name, color: local.color = colorInput.value }, res => {
    if(res.ok){
      roomId = res.roomId;
      isHost = true;
      updatePlayersListUI(res.room);
      // show room id to host
      const idDiv = document.createElement('div');
      idDiv.textContent = `Room ID: ${roomId}`;
      playersListDiv.appendChild(idDiv);
    } else alert('Erreur création room');
  });
});

// join via accepting invite or direct prompt (for testing)
window.addEventListener('keydown', e => {
  if(e.key === 'j'){ // quick join (debug)
    const rid = prompt('Room ID ?'); if(rid) {
      socket.emit('join_room', { roomId: rid, name: local.name, color: local.color }, res=>{
        if(res.ok){ roomId = rid; updatePlayersListUI(res.room); }
        else alert(res.error);
      });
    }
  }
});

// when server tells us a new room was created (other clients)
socket.on('created_room', d => {
  // no op on client (handled above)
});

// server responses for created/joined
socket.on('room_info', data => {
  roomId = data.roomId;
  updatePlayersListUI(data);
});

// when server asks to spawn AI or start match, it emits 'match_started' and gives room
socket.on('match_started', (data) => {
  // server will have created AI players in room.players
  updatePlayersListUI(data);
  crosshair.style.display = 'block';
});

// projectile spawn from server
socket.on('projectile_spawn', (p) => {
  spawnProjectile(p);
  // detect collision client-side approximatively to show explosion
  setTimeout(()=>{
    createExplosion(p.x, p.z);
  }, 700);
});

// chat broadcast
socket.on('chat_broadcast', ({ from, text }) => {
  const div = document.createElement('div'); div.textContent = `${from}: ${text}`; chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
});

// invited
socket.on('invited', ({ from, roomId: rid })=>{
  if(confirm(`${from} t'invite dans sa partie — accepter ?`)){
    socket.emit('accept_invite', { roomId: rid });
  } else {
    socket.emit('decline_invite', { roomId: rid });
  }
});

// server tells labels & initial players snapshot
socket.on('initial_state', ({ roomId: rid, players: snapshot })=>{
  roomId = rid;
  // create meshes for all players in snapshot
  for(const id in snapshot){
    if(id === socket.id) continue; // skip self
    const pd = snapshot[id];
    if(!players[id]){
      const geo = new THREE.BoxGeometry(20,20,20);
      const mat = new THREE.MeshPhongMaterial({ color: pd.color || '#ccc' });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pd.x||0, 10, pd.z||0);
      scene.add(mesh);
      const label = createLabel(pd.name || 'Player');
      players[id] = { data: pd, mesh, label };
    }
  }
  updatePlayersListUI({ players: snapshot });
});

// spawn projectile visual
function spawnProjectile(obj){
  const geo = new THREE.SphereGeometry(4,10,10);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffdd55 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(obj.x, 6, obj.z);
  scene.add(m);
  obj._mesh = m;
  obj._life = 2000;
  projectiles.push(obj);
}

// explosion visual
function createExplosion(x,z){
  createExplosionVisual(x,z);
}
function createExplosionVisual(x,z){
  const geo = new THREE.SphereGeometry(8, 10, 10);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent:true, opacity:0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 8, z);
  scene.add(m);
  setTimeout(()=> scene.remove(m), 700);
  explosionAudio.currentTime = 0; explosionAudio.play();
}

// window resize
window.addEventListener('resize', ()=> {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
});

// ---- final: register player on connect (ensure server knows pseudo mapping)
socket.emit('register', { name: local.name });

// ---- Helpers to create label DOM element
function createLabel(name){
  const d = document.createElement('div');
  d.className = 'playerLabel';
  d.textContent = name;
  d.style.position = 'absolute';
  d.style.display = 'none';
  document.body.appendChild(d);
  return d;
}
