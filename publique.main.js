// main.js - Three.js front-end prototype
const socketScript = '/socket.io/socket.io.js';

// UI
const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const livesSpan = document.getElementById('lives');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');

const canvas = document.getElementById('canvas3d');
const ctx3d = canvas;

let socket = null;
let roomId = null;
let playerId = null;
let players = {}; // remote players + self
let projectiles = [];

let localPlayer = {
  x: 400, y: 300, angle: 0, name: 'Chèvre', color: '#ff9966', lives: 3
};

let keys = {};
let controlMode = 'wasd';

startBtn.onclick = () => {
  const name = pseudoInput.value.trim() || 'Chèvre';
  controlMode = controlsSelect.value;
  localPlayer.name = name;
  localPlayer.color = colorInput.value || '#ff9966';

  socket = io();

  socket.emit('create_room', { name, color: localPlayer.color }, (res) => {
    if (!res || !res.ok) {
      alert('Impossible de créer la room');
      return;
    }
    roomId = res.roomId;
    playerId = socket.id;
    menu.style.display = 'none';
    init();
  });

  socket.on('room_update', (room) => {
    if (!room) return;
    // copy players state
    players = room.players || {};
    // extract local lives if present
    if (players[socket.id]) {
      localPlayer.lives = players[socket.id].lives;
      livesSpan.textContent = localPlayer.lives;
    }
    projectiles = room.projectiles || [];
  });

  socket.on('hit_effect', (d) => {
    // can show explosion at d.x,d.y
    spawnExplosion(d.x, d.y);
  });

  socket.on('you_died', () => {
    showEndScreen('Tu as perdu !');
  });

  socket.on('player_killed', (d) => {
    // could show message
    console.log('player_killed', d);
  });
};

backToMenu.onclick = () => {
  window.location.reload();
};

// --- Three.js setup ---
let scene, camera, renderer;
let playerMeshes = {}; // id -> mesh
let projectileMeshes = {};
let explosionParticles = [];

function initThree() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.width, canvas.height);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222233);

  camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 2000);
  camera.position.set(0, 200, 300);
  camera.lookAt(0, 0, 0);

  // light
  const amb = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(100, 200, 100);
  scene.add(dir);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 600),
    new THREE.MeshStandardMaterial({ color: 0x224422 })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);
}

function createPlayerMesh(id, info) {
  // simple goat-like placeholder: a box body + sphere head
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 12), new THREE.MeshStandardMaterial({ color: info.color || 0xff9966 }));
  body.position.y = 8;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  head.position.set(10, 16, 0);
  group.add(head);
  scene.add(group);
  playerMeshes[id] = group;
  return group;
}

function createProjectileMesh(id) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffff66 }));
  scene.add(m);
  projectileMeshes[id] = m;
  return m;
}

function spawnExplosion(x, y) {
  // create some simple particle spheres
  for (let i=0;i<12;i++){
    explosionParticles.push({
      x, y, vx: (Math.random()-0.5)*6, vy:(Math.random()-0.5)*6, life: 60,
      mesh: (() => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(2,6,6), new THREE.MeshStandardMaterial({ color: 0xffaa33 }));
        scene.add(s);
        return s;
      })()
    });
  }
}

// --- input handling ---
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

function showEndScreen(text) {
  endText.textContent = text;
  endScreen.style.display = 'flex';
}

function init() {
  initThree();
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  updateLocal();
  syncToServer();
  renderScene();
}

function updateLocal() {
  // movement
  const speedBase = keys['r'] ? 6 : 3;
  const keyMap = controlMode === 'zqsd' ? {fwd:'z', back:'s', left:'q', right:'d'} : {fwd:'w', back:'s', left:'a', right:'d'};

  // rotate (left/right) change angle
  if (keys[keyMap.left]) localPlayer.angle -= 0.06;
  if (keys[keyMap.right]) localPlayer.angle += 0.06;

  // move forward/back relative to angle (top-down)
  if (keys[keyMap.fwd]) {
    localPlayer.x += Math.cos(localPlayer.angle) * speedBase;
    localPlayer.y += Math.sin(localPlayer.angle) * speedBase;
  }
  if (keys[keyMap.back]) {
    localPlayer.x -= Math.cos(localPlayer.angle) * speedBase;
    localPlayer.y -= Math.sin(localPlayer.angle) * speedBase;
  }
  // jump (visual only)
  if (keys[' ']) {
    // simple visual jump: ignored server-side
  }
  // fire
  if (keys['f']) {
    // simple rate-limit: set lastFire on client
    if (!localPlayer._lastFire || Date.now() - localPlayer._lastFire > 300) {
      localPlayer._lastFire = Date.now();
      socket.emit('fire', { x: localPlayer.x, y: localPlayer.y });
    }
  }

  // clamp
  localPlayer.x = Math.max(10, Math.min(790, localPlayer.x));
  localPlayer.y = Math.max(10, Math.min(590, localPlayer.y));
}

let lastSync = 0;
function syncToServer() {
  if (!socket) return;
  // send state ~10hz
  if (Date.now() - lastSync > 100) {
    socket.emit('player_state', { x: localPlayer.x, y: localPlayer.y, angle: localPlayer.angle, name: localPlayer.name, color: localPlayer.color });
    lastSync = Date.now();
  }
}

function renderScene() {
  // update camera to follow player
  camera.position.x = localPlayer.x - 0;
  camera.position.z = 300;
  camera.position.y = 200;
  camera.lookAt(localPlayer.x, 0, localPlayer.y);

  // ensure meshes for players
  for (const id in players) {
    const p = players[id];
    if (!p) continue;
    if (!playerMeshes[id]) createPlayerMesh(id, p);
    const mesh = playerMeshes[id];
    mesh.position.set(p.x - 400, 0, p.y - 300); // center transform (world coords)
    mesh.rotation.y = -p.angle;
    // color
    const body = mesh.children[0];
    if (body && body.material) body.material.color.setStyle(p.color || '#ff9966');
  }
  // create mesh for local player if missing
  if (!playerMeshes[socket.id]) createPlayerMesh(socket.id, localPlayer);
  const myMesh = playerMeshes[socket.id];
  myMesh.position.set(localPlayer.x - 400, 0, localPlayer.y - 300);
  myMesh.rotation.y = -localPlayer.angle;

  // projectiles
  // sync meshes
  const ids = new Set(projectiles.map(p => p.id));
  // remove old
  for (const id of Object.keys(projectileMeshes)) {
    if (!ids.has(id)) {
      scene.remove(projectileMeshes[id]);
      delete projectileMeshes[id];
    }
  }
  // create/update
  for (const pr of projectiles) {
    if (!projectileMeshes[pr.id]) createProjectileMesh(pr.id);
    const m = projectileMeshes[pr.id];
    m.position.set(pr.x - 400, 6, pr.y - 300);
  }

  // explosions particles
  for (let i = explosionParticles.length - 1; i >= 0; i--) {
    const e = explosionParticles[i];
    e.x += e.vx;
    e.y += e.vy;
    e.life--;
    e.mesh.position.set(e.x - 400, 6, e.y - 300);
    if (e.life <= 0) {
      scene.remove(e.mesh);
      explosionParticles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}
