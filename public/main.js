// public/main.js - Version finale client
// Dependencies: /socket.io/socket.io.js + three.js (loaded in index.html)

// ===== socket =====
const socket = io(); // assume same origin or proper host provided in index.html

// ===== UI refs (index.html expected ids) =====
const startBtn = document.getElementById('startBtn');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const controlsSelect = document.getElementById('controls');
const hudSpeed = document.getElementById('speed');
const hudLives = document.getElementById('lives');
const hudStamina = document.getElementById('hudStamina'); // might be absent in simple index, check
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');
const crosshair = document.getElementById('crosshair');

// if some HUD elements don't exist, create safe refs
function safeRef(id) { const e = document.getElementById(id); return e || { innerText: '' }; }
const _hudStamina = safeRef('hudStamina');

// ===== prevent page scroll / selection =====
window.addEventListener('wheel', e => e.preventDefault(), { passive: false });
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
}, { passive: false });
document.addEventListener('selectstart', e => e.preventDefault());

// ===== Three.js scene setup =====
const canvas = document.querySelector('canvas') || document.createElement('canvas');
if (!canvas.parentElement) document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 5000);
camera.position.set(0, 60, 140);

// lights
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(200, 400, 200);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x888888));

// ground (large)
const groundMat = new THREE.MeshLambertMaterial({ color: 0x7bbf59 });
const groundGeo = new THREE.PlaneGeometry(2000, 2000);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = false;
scene.add(ground);

// invisible enclosure radius
const ENCLOSE_RADIUS = 900;

// ==== Audio assets (public/free URLs) ====
const engineSound = new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_6edb6f1c41.mp3?filename=motor-bike-acceleration-03.mp3');
engineSound.loop = true; engineSound.volume = 0.25;
const shotSound = new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_7c3b8a6b7b.mp3?filename=gun-shot-2.mp3');
shotSound.volume = 0.6;
const explosionSound = new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_a1b9c8f4f5.mp3?filename=mini-explosion-01.mp3');
explosionSound.volume = 0.4;

// ===== player local state =====
let local = {
  id: null,
  name: 'Chèvre',
  color: '#ff9966',
  x: Math.random()*200 - 100,
  z: Math.random()*200 - 100,
  angle: 0,
  lives: 3,
  kills: 0,
  stamina: 100,
  speedKmh: 0,
  mesh: null,
  label: null,
  gun: null
};
let controlMode = 'zqsd'; // default to ZQSD per index.html
let keys = {};
let fpsHold = false;
let isPointerDown = false;
let lastMouseX = 0, lastMouseY = 0;
let lastPos = { x: local.x, z: local.z };
let lastUpdateTime = performance.now();
let roomId = null;
let isHost = false;

// maps for remote players & AI & projectiles visuals
const players = {}; // socketId -> {data, mesh, label}
const aiMap = {};   // aiId -> {data, mesh, label}
const visualsProjectiles = {}; // projId -> {mesh, life}

// ===== helpers: low-poly goat builder =====
function buildGoatMesh(colorHex){
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(22,14,12), new THREE.MeshStandardMaterial({ color: colorHex }));
  body.position.set(0, 10, 0); group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(10,8,8), new THREE.MeshStandardMaterial({ color: colorHex }));
  head.position.set(14, 16, 0); group.add(head);
  for (let px of [-6,6]) {
    for (let pz of [-4,4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(4,12,4), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
      leg.position.set(px, 6, pz);
      group.add(leg);
    }
  }
  const hornL = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,8,6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  hornL.position.set(18,20,-2); hornL.rotation.z = Math.PI/3; group.add(hornL);
  const hornR = hornL.clone(); hornR.position.set(18,20,2); hornR.rotation.z = -Math.PI/3; group.add(hornR);
  group.scale.set(1.3,1.3,1.3);
  return group;
}

// ===== UI helpers =====
function createLabelDOM(name){
  const d = document.createElement('div');
  d.className = 'playerLabel';
  d.style.position = 'absolute';
  d.style.display = 'none';
  d.style.padding = '4px 8px';
  d.style.background = 'rgba(0,0,0,0.6)';
  d.style.color = '#fff';
  d.style.borderRadius = '6px';
  d.textContent = name;
  document.body.appendChild(d);
  return d;
}

// ===== spawn local mesh & label & gun =====
function spawnLocalMesh(){
  if (local.mesh) scene.remove(local.mesh);
  if (local.label) local.label.remove();
  local.mesh = buildGoatMesh(local.color);
  local.mesh.position.set(local.x, 10, local.z);
  scene.add(local.mesh);
  local.label = createLabelDOM(local.name);
  // create gun object that will be positioned with camera in FPS
  createGun();
}

function createGun(){
  if (local.gun) { scene.remove(local.gun); local.gun = null; }
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 8, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0, 0);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  grip.position.set(-1.2, -0.8, -2);
  g.add(grip);
  scene.add(g);
  g.visible = false;
  local.gun = g;
}

// ===== input handling =====
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'h') fpsHold = true;
  // prevent page scroll with space/arrows
  if ([' ', 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
  if (e.key.toLowerCase() === 'h') fpsHold = false;
});
canvas.addEventListener('mousedown', e => { isPointerDown = true; lastMouseX = e.clientX; lastMouseY = e.clientY; });
window.addEventListener('mouseup', () => { isPointerDown = false; });
window.addEventListener('mousemove', e => {
  if (isPointerDown) {
    const dx = e.clientX - lastMouseX;
    local.angle -= dx * 0.003;
    lastMouseX = e.clientX;
  }
});

// block wheel scroll
window.addEventListener('wheel', e => e.preventDefault(), { passive: false });

// ===== camera follow & FPS logic =====
function updateCamera(dt){
  if (!local.mesh) return;
  if (fpsHold) {
    // position camera slightly in front of head
    const headPos = new THREE.Vector3();
    local.mesh.getWorldPosition(headPos);
    const dir = new THREE.Vector3(Math.cos(local.angle), 0, Math.sin(local.angle));
    const camPos = headPos.clone().add(new THREE.Vector3(0, 8, 0)).add(dir.clone().multiplyScalar(6));
    camera.position.lerp(camPos, 0.45);
    const lookTarget = headPos.clone().add(new THREE.Vector3(0, 8, 0)).add(dir.clone().multiplyScalar(80));
    camera.lookAt(lookTarget);
    crosshair.style.display = 'block';
    // show gun in front of camera
    if (local.gun) {
      local.gun.visible = true;
      // place gun relative to camera
      const gunOffset = new THREE.Vector3(0.5, -0.6, -1.2);
      gunOffset.applyQuaternion(camera.quaternion);
      const gunWorld = camera.position.clone().add(gunOffset);
      local.gun.position.lerp(gunWorld, 0.6);
      local.gun.quaternion.copy(camera.quaternion);
    }
  } else {
    // 3rd person: behind and above
    const target = local.mesh.position.clone();
    const behind = new THREE.Vector3(Math.cos(local.angle + Math.PI) * 80, 48, Math.sin(local.angle + Math.PI) * 80);
    const camPos = target.clone().add(behind);
    camera.position.lerp(camPos, 0.12);
    camera.lookAt(target.clone().add(new THREE.Vector3(0, 12, 0)));
    crosshair.style.display = 'none';
    if (local.gun) local.gun.visible = false;
  }
}

// ===== projectile visuals management =====
function spawnVisualProjectile(id, x, z, vx, vz){
  // create sphere mesh
  if (visualsProjectiles[id]) return;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffdd88 }));
  mesh.position.set(x, 6, z);
  scene.add(mesh);
  visualsProjectiles[id] = { mesh, x, z, vx, vz, life: 3000 };
}
function removeVisualProjectile(id){
  const v = visualsProjectiles[id];
  if (!v) return;
  scene.remove(v.mesh);
  delete visualsProjectiles[id];
}

// ===== explosion visual =====
function showExplosion(x, z){
  const geo = new THREE.SphereGeometry(10, 10, 10);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8c00, transparent: true, opacity: 0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 8, z);
  scene.add(m);
  explosionSound.currentTime = 0; explosionSound.play();
  setTimeout(()=> scene.remove(m), 800);
}

// ===== labels update: project 3D positions to screen for DOM labels =====
function updateLabels(){
  for (const id in players) {
    const remote = players[id];
    if (!remote.mesh || !remote.label) continue;
    const pos = remote.mesh.position.clone(); pos.y += 30;
    const v = pos.project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    remote.label.style.left = `${x}px`;
    remote.label.style.top = `${y}px`;
    remote.label.style.display = 'block';
  }
  // local label
  if (local.label && local.mesh) {
    const p = local.mesh.position.clone(); p.y += 30;
    const v = p.project(camera);
    local.label.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    local.label.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
    local.label.style.display = 'block';
  }
}

// ===== movement and physics (client -> server: send player_state) =====
let lastTick = performance.now();
function gameTick(now){
  requestAnimationFrame(gameTick);
  const dtMs = Math.min(60, now - lastTick);
  lastTick = now;
  const dt = dtMs / 1000;

  // input mapping
  controlMode = controlsSelect.value || 'zqsd';
  let forward = 0, turn = 0;
  if (controlMode === 'wasd') {
    forward = (keys['w'] ? 1 : 0) - (keys['s'] ? 1 : 0);
    turn    = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
  } else if (controlMode === 'zqsd') {
    forward = (keys['z'] ? 1 : 0) - (keys['s'] ? 1 : 0);
    turn    = (keys['d'] ? 1 : 0) - (keys['q'] ? 1 : 0);
  } else {
    // arrows
    forward = (keys['arrowup'] ? 1 : 0) - (keys['arrowdown'] ? 1 : 0);
    turn    = (keys['arrowright'] ? 1 : 0) - (keys['arrowleft'] ? 1 : 0);
  }

  // rotation (turn keys)
  local.angle += turn * 2.5 * dt; // radians/sec

  // mouse drag also modifies local.angle (handled in mousemove listener)

  // sprint
  const sprint = keys['f'] && local.stamina > 0;
  if (sprint) {
    local.stamina = Math.max(0, local.stamina - 28 * dt);
    if (engineSound.paused) engineSound.play();
  } else {
    local.stamina = Math.min(100, local.stamina + 18 * dt);
    if (!engineSound.paused) engineSound.pause();
  }

  // base speed (units per second)
  const baseSpeed = 6.5;
  const move = baseSpeed * (sprint ? 2.1 : 1.0) * forward;

  // apply movement along facing angle
  if (Math.abs(move) > 0.001) {
    local.x += Math.cos(local.angle) * move;
    local.z += Math.sin(local.angle) * move;
  }

  // brake
  if (keys['r']) {
    local.x -= Math.cos(local.angle) * baseSpeed * 0.06;
    local.z -= Math.sin(local.angle) * baseSpeed * 0.06;
  }

  // jump small visual only
  if (keys[' ']) {
    if (local.mesh) local.mesh.position.y = 10 + Math.abs(Math.sin(performance.now() / 140)) * 4;
  } else {
    if (local.mesh) local.mesh.position.y = 10;
  }

  // enforce enclosure invisible wall
  const dist = Math.hypot(local.x, local.z);
  if (dist > ENCLOSE_RADIUS - 10) {
    const a = Math.atan2(local.z, local.x);
    local.x = Math.cos(a) * (ENCLOSE_RADIUS - 10);
    local.z = Math.sin(a) * (ENCLOSE_RADIUS - 10);
  }

  // update local mesh if present
  if (local.mesh) {
    local.mesh.position.set(local.x, 10, local.z);
    local.mesh.rotation.y = -local.angle;
  }

  // speed KMH calc (filter low jitter)
  const dx = local.x - lastPos.x;
  const dz = local.z - lastPos.z;
  const meters = Math.hypot(dx, dz);
  const mps = meters / Math.max(dt, 0.0001);
  const kmh = Math.round(mps * 3.6);
  local.speedKmh = (kmh < 2 ? 0 : kmh);
  hudSpeed.innerText = `Vitesse: ${local.speedKmh} km/h`;
  if (_hudStamina) _hudStamina.innerText = Math.round(local.stamina);

  // send state to server intermittently
  const nowMs = performance.now();
  if (nowMs - lastUpdateTime > 80) {
    socket.emit('player_state', { roomId, x: local.x, z: local.z, angle: local.angle, name: local.name, color: local.color });
    lastUpdateTime = nowMs;
    lastPos.x = local.x; lastPos.z = local.z;
  }

  // update visuals projectiles
  for (const pid in visualsProjectiles) {
    const vp = visualsProjectiles[pid];
    vp.x += (vp.vx * dt);
    vp.z += (vp.vz * dt);
    vp.life -= dt * 1000;
    if (vp.mesh) vp.mesh.position.set(vp.x, 6, vp.z);
    if (vp.life <= 0) removeVisualProjectile(pid);
  }

  // update camera & labels & render
  updateCamera(dt);
  updateLabels();
  renderer.render(scene, camera);
}

// ===== server messages =====
// We expect server to reply with these events (server.js provided earlier)
socket.on('connect', () => {
  // register name at server (helpful for invites)
  const nm = pseudoInput.value.trim() || local.name;
  socket.emit('register', { name: nm });
});

// create_room callback -> server should respond with {ok:true, roomId, room}
startBtn.addEventListener('click', () => {
  local.name = pseudoInput.value.trim() || local.name;
  local.color = colorInput.value || local.color;
  controlMode = controlsSelect.value || controlMode;
  // ask server to create a room and be host
  socket.emit('create_room', { name: local.name, color: local.color }, res => {
    if (res && res.ok) {
      roomId = res.roomId;
      isHost = true;
      spawnLocalMesh();
      // hide menu (index.html shows menu by default)
      const menu = document.getElementById('menu');
      if (menu) menu.style.display = 'none';
      // show crosshair only after match started
      alert(`Salle créée (${roomId}). Clique "Lancer la partie" dans le lobby (host).`);
      // optionally open lobby UI in your index.html if present
    } else {
      console.error('create_room failed', res);
      alert('Impossible de créer la salle');
    }
  });
});

// accept invite example handled by server via 'invited' event
socket.on('invited', ({ from, roomId: rid }) => {
  if (confirm(`${from} t'invite dans sa partie. Accepter ?`)) {
    socket.emit('accept_invite', { roomId: rid });
    roomId = rid;
  } else {
    socket.emit('decline_invite', { roomId: rid });
  }
});

// match started - server should send snapshot after starting
socket.on('match_started', ({ roomId: rid, players: snapshot, ai }) => {
  roomId = rid;
  // spawn local in match
  spawnLocalMesh();
  // create remote and AI meshes from snapshot
  if (snapshot) {
    for (const id in snapshot) {
      if (id === socket.id) continue;
      const p = snapshot[id];
      if (!players[id]) {
        const m = buildGoatMesh(p.color || '#cccccc'); m.position.set(p.x || 0, 10, p.z || 0); scene.add(m);
        const label = createLabelDOM(p.name || 'Player');
        players[id] = { data: p, mesh: m, label };
      } else {
        players[id].data = p;
        players[id].mesh.position.set(p.x, 10, p.z);
      }
    }
  }
  if (ai) {
    for (const aid in ai) {
      const a = ai[aid];
      const mg = buildGoatMesh(a.color || '#888888'); mg.position.set(a.x||0, 10, a.z||0); scene.add(mg);
      const label = createLabelDOM(a.name || 'IA');
      aiMap[aid] = { data: a, mesh: mg, label };
    }
  }
});

// server broadcast room_update (players and ai positions)
socket.on('room_update', ({ roomId: rid, players: snapPlayers, ai }) => {
  // update players
  if (snapPlayers) {
    for (const id in snapPlayers) {
      if (id === socket.id) continue;
      const pd = snapPlayers[id];
      if (!players[id]) {
        const m = buildGoatMesh(pd.color || '#cccccc'); m.position.set(pd.x||0, 10, pd.z||0); scene.add(m);
        const label = createLabelDOM(pd.name || 'Player');
        players[id] = { data: pd, mesh: m, label };
      } else {
        players[id].data = pd;
        players[id].mesh.position.set(pd.x, 10, pd.z);
      }
    }
    // remove missing
    for (const id in players) if (!snapPlayers[id]) {
      scene.remove(players[id].mesh); players[id].label.remove(); delete players[id];
    }
    // update HUD lives/kills if local present
    if (snapPlayers[socket.id]) {
      local.lives = snapPlayers[socket.id].lives || local.lives;
      hudLives.innerText = `❤️ ${local.lives}`;
    }
  }
  // update AI
  if (ai) {
    for (const aid in ai) {
      const ad = ai[aid];
      if (!aiMap[aid]) {
        const m = buildGoatMesh(ad.color || '#888888'); m.position.set(ad.x||0, 10, ad.z||0); scene.add(m);
        const label = createLabelDOM(ad.name || 'IA');
        aiMap[aid] = { data: ad, mesh: m, label };
      } else {
        aiMap[aid].data = ad;
        aiMap[aid].mesh.position.set(ad.x, 10, ad.z);
      }
    }
    // remove dead ai
    for (const aid in aiMap) if (!ai[aid]) {
      scene.remove(aiMap[aid].mesh); aiMap[aid].label.remove(); delete aiMap[aid];
    }
  }
});

// projectile spawn from server
socket.on('projectile_spawn', ({ id, x, z, vx, vz, shooterName }) => {
  spawnVisualProjectile(id, x, z, vx, vz);
  // small chance to play shot sound (client also plays when firing)
  shotSound.currentTime = 0; shotSound.play();
});

// projectile hit or end
socket.on('projectile_hit', ({ id, x, z }) => {
  // show explosion and remove visual
  showExplosion(x, z);
  removeVisualProjectile(id);
});
socket.on('projectile_end', ({ id }) => {
  removeVisualProjectile(id);
});

// player hit / eliminated
socket.on('player_hit', ({ targetId, by }) => {
  if (targetId === socket.id) {
    local.lives = Math.max(0, local.lives - 1);
    hudLives.innerText = `❤️ ${local.lives}`;
    if (local.lives <= 0) {
      socket.emit('i_died', { roomId });
    }
  }
});
socket.on('player_eliminated', ({ id, byName }) => {
  if (id === socket.id) {
    endText.innerText = `Tu as été éliminé par ${byName}`;
    endScreen.style.display = 'flex';
  }
});

// AI killed
socket.on('ai_killed', ({ id, by }) => {
  if (local.kills !== undefined && by === local.name) {
    local.kills++;
  }
  // remove visual done in room_update or via separate event
  if (aiMap[id]) {
    scene.remove(aiMap[id].mesh); aiMap[id].label.remove(); delete aiMap[id];
  }
});

// chat broadcast
socket.on('chat_broadcast', ({ from, text }) => {
  const d = document.createElement('div'); d.textContent = `${from}: ${text}`; document.getElementById('chatMessages').appendChild(d);
});

// ===== firing (local) =====
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'g') {
    // fire request to server
    const px = local.x + Math.cos(local.angle) * 28;
    const pz = local.z + Math.sin(local.angle) * 28;
    socket.emit('fire', { roomId, x: px, z: pz, angle: local.angle, shooter: local.name });
    // play shot locally as immediate feedback
    shotSound.currentTime = 0; shotSound.play();
  }
});

// ===== helper to remove all visuals on leaving =====
function clearAllVisuals(){
  for (const id in players) { scene.remove(players[id].mesh); players[id].label.remove(); }
  for (const id in aiMap) { scene.remove(aiMap[id].mesh); aiMap[id].label.remove(); }
  for (const pid in visualsProjectiles) { removeVisualProjectile(pid); }
  if (local.mesh) scene.remove(local.mesh); if (local.label) local.label.remove();
}

// ===== spawnLocalMesh on start =====
function startLocalAndUI(){
  spawnLocalMesh();
  // update HUD
  hudLives.innerText = `❤️ ${local.lives}`;
  if (_hudStamina) _hudStamina.innerText = Math.round(local.stamina);
}

// ===== utility: create room join (index.html provides startBtn) =====
// startBtn handler already triggers create_room; server callback must call back; we handle via create_room response above

// ===== start the animation loop =====
let lastFrame = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  // throttle to keep smooth
  const dt = Math.min(60, now - lastFrame) / 1000;
  lastFrame = now;

  // update visuals projectiles movement (client side)
  for (const id in visualsProjectiles) {
    const v = visualsProjectiles[id];
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    if (v.mesh) v.mesh.position.set(v.x, 6, v.z);
    v.life -= dt * 1000;
    if (v.life <= 0) removeVisualProjectile(id);
  }

  // update camera & labels & render
  updateCamera(dt);
  updateLabels();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// start gameTick loop for movement + sending states
requestAnimationFrame(gameTick);

// ===== UI button hookups in index.html =====
backToMenu && backToMenu.addEventListener('click', () => {
  // reload to return to menu quickly
  location.reload();
});

// ensure startBtn exists - create room on click handled earlier above in startBtn listener
// If the UI differs (index.html variant), you can call spawnLocalMesh() and socket.emit('create_room', {...}) manually.

console.log('client main.js loaded');
