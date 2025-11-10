/* public/main.js - VERSION ULTRA AMÉLIORÉE
   Toutes les nouvelles fonctionnalités :
   - Mode précision (maintenir H) avec arme visible
   - Sauter (ESPACE)
   - Sons (moto, tir, explosion)
   - Power-ups
   - Balles visibles avec traînée
   - Collisions joueurs/IA/murs/bottes de foin
   - Mort et respawn
   - Grand enclos avec murs invisibles
   - Herbe infinie
   - Bottes de foin avec collisions
*/

const socket = io();

// UI refs
const menu = document.getElementById('menu');
const lobbyUi = document.getElementById('lobby');
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const joinRoomId = document.getElementById('joinRoomId');
const createName = document.getElementById('pseudo');
const createColor = document.getElementById('color');
const controlsSelect = document.getElementById('controls');
const modeSelect = document.getElementById('mode');
const playersList = document.getElementById('playersList');
const roomLabel = document.getElementById('roomLabel');
const inviteName = document.getElementById('inviteName');
const inviteBtn = document.getElementById('inviteBtn');
const startGameBtn = document.getElementById('startGameBtn');
const leaveBtn = document.getElementById('leaveBtn');
const speedHUD = document.getElementById('speedHUD');
const endScreen = document.getElementById('endScreen');
const backToMenu = document.getElementById('backToMenu');

// State
let myName = null;
let myColor = '#ff9966';
let myRoom = null;
let amIHost = false;
let controlMode = 'zqsd';
let localPlayer = null;
let players = {};
let aiList = [];
let bullets = [];
let keys = {};
let stamina = 100;
let precisionMode = false;
let gunMesh = null;
let hp = 3;
let kills = 0;
let isJumping = false;
let jumpVelocity = 0;
let powerUps = [];
let haybales = [];
const MAP_SIZE = 400;

// Audio contexts (Web Audio API)
let audioCtx;
let motorSound = null;
let motorGain = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Moteur continu
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 80;
    motorGain = audioCtx.createGain();
    motorGain.gain.value = 0;
    oscillator.connect(motorGain);
    motorGain.connect(audioCtx.destination);
    oscillator.start();
    motorSound = { osc: oscillator, gain: motorGain };
  }
}

function playShootSound() {
  if (!audioCtx) initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 200;
  osc.type = 'square';
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

function playExplosionSound() {
  if (!audioCtx) initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 50;
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

// Three.js
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, MAP_SIZE * 0.6);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 25);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dl = new THREE.DirectionalLight(0xffffff, 0.8);
dl.position.set(100, 150, 100);
dl.castShadow = true;
dl.shadow.mapSize.width = 2048;
dl.shadow.mapSize.height = 2048;
dl.shadow.camera.left = -MAP_SIZE/2;
dl.shadow.camera.right = MAP_SIZE/2;
dl.shadow.camera.top = MAP_SIZE/2;
dl.shadow.camera.bottom = -MAP_SIZE/2;
scene.add(dl);

// Ground INFINI (répété)
const groundTex = new THREE.TextureLoader().load('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzNhYTA0NyIvPjwvc3ZnPg==');
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(200, 200);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2),
  new THREE.MeshLambertMaterial({ map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Murs invisibles (collisions)
const wallHeight = 20;
const wallThickness = 2;
const wallMat = new THREE.MeshBasicMaterial({ visible: false });

function createInvisibleWall(x, z, width, depth) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat);
  wall.position.set(x, wallHeight / 2, z);
  wall.userData.isWall = true;
  scene.add(wall);
  return wall;
}

createInvisibleWall(0, MAP_SIZE/2, MAP_SIZE, wallThickness);    // Nord
createInvisibleWall(0, -MAP_SIZE/2, MAP_SIZE, wallThickness);   // Sud
createInvisibleWall(MAP_SIZE/2, 0, wallThickness, MAP_SIZE);    // Est
createInvisibleWall(-MAP_SIZE/2, 0, wallThickness, MAP_SIZE);   // Ouest

// Bottes de foin
function createHaybale(x, z) {
  const hay = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2.5, 3),
    new THREE.MeshLambertMaterial({ color: 0xdaa520 })
  );
  hay.position.set(x, 1.25, z);
  hay.castShadow = true;
  hay.receiveShadow = true;
  hay.userData.isHaybale = true;
  scene.add(hay);
  haybales.push(hay);
}

// Spawn 30 bottes aléatoires
for (let i = 0; i < 30; i++) {
  createHaybale(
    (Math.random() - 0.5) * (MAP_SIZE - 20),
    (Math.random() - 0.5) * (MAP_SIZE - 20)
  );
}

// Build goat mesh
function makeGoatMesh(color = '#ff9966') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3.2), bodyMat);
  body.position.set(0, 0.9, 0);
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 1.1), bodyMat);
  head.position.set(0, 1.25, 1.8);
  head.castShadow = true;
  group.add(head);

  const hornMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), hornMat);
  hornL.position.set(-0.25, 1.7, 2.25);
  hornL.rotation.set(-0.6, 0, -0.5);
  group.add(hornL);
  const hornR = hornL.clone();
  hornR.position.set(0.25, 1.7, 2.25);
  hornR.rotation.set(-0.6, 0, 0.5);
  group.add(hornR);

  const legMat = new THREE.MeshStandardMaterial({ color: 0x6b4f2b });
  const legGeom = new THREE.BoxGeometry(0.3, 1, 0.3);
  [[-.7,0,-1],[.7,0,-1],[-.7,0,1],[.7,0,1]].forEach(o => {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(o[0], 0.2, o[2]);
    leg.castShadow = true;
    group.add(leg);
  });

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6), bodyMat);
  tail.position.set(0, 1.05, -1.75);
  tail.rotation.x = 0.6;
  group.add(tail);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
  eyeL.position.set(-0.18, 1.3, 2.15);
  const eyeR = eyeL.clone();
  eyeR.position.set(0.18, 1.3, 2.15);
  group.add(eyeL, eyeR);

  return group;
}

function makeGunMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), mat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.1, -0.4);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.15), mat);
  grip.position.set(0, -0.25, 0);
  g.add(grip);
  return g;
}

function spawnLocal(name, color) {
  const mesh = makeGoatMesh(color);
  mesh.position.set((Math.random()-0.5)*50, 0.5, (Math.random()-0.5)*50);
  scene.add(mesh);
  localPlayer = { id: socket.id, name, color, mesh, hp: 3 };
  players[socket.id] = { name, color, mesh, hp: 3 };
  
  gunMesh = makeGunMesh();
  camera.add(gunMesh);
  gunMesh.position.set(0.3, -0.3, -0.5);
  gunMesh.visible = false;
  
  hp = 3;
  initAudio();
}

function spawnRemote(id, name, color, x, z) {
  if (players[id]) return;
  const mesh = makeGoatMesh(color);
  mesh.position.set(x || 0, 0.5, z || 0);
  scene.add(mesh);
  players[id] = { name, color, mesh, hp: 3 };
}

function spawnAI(count) {
  for (let i = 0; i < count; i++) {
    const id = 'AI_' + Date.now().toString(36) + '_' + i;
    const mesh = makeGoatMesh('#c95a3c');
    mesh.position.set((Math.random()-0.5)*(MAP_SIZE-40), 0.5, (Math.random()-0.5)*(MAP_SIZE-40));
    scene.add(mesh);
    aiList.push({ id, mesh, hp: 3, lastFire: 0, lastMove: 0 });
  }
}

// Power-ups
function spawnPowerUp(x, z, type = 'health') {
  const geom = type === 'health' 
    ? new THREE.SphereGeometry(0.5, 8, 8)
    : new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshBasicMaterial({ 
    color: type === 'health' ? 0x00ff00 : 0xffff00 
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, 1, z);
  scene.add(mesh);
  powerUps.push({ mesh, type, time: Date.now() });
}

// Spawn 5 power-ups aléatoires
for (let i = 0; i < 5; i++) {
  spawnPowerUp(
    (Math.random()-0.5)*(MAP_SIZE-40),
    (Math.random()-0.5)*(MAP_SIZE-40),
    Math.random() > 0.5 ? 'health' : 'speed'
  );
}

function spawnBullet(x, y, z, dirVec, ownerId) {
  const bGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const bMat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
  const b = new THREE.Mesh(bGeo, bMat);
  b.position.set(x, y, z);
  b.userData = { dir: dirVec.clone().normalize(), ownerId, trail: [] };
  scene.add(b);
  bullets.push(b);
}

// Explosion visuelle
function createExplosion(x, y, z) {
  playExplosionSound();
  const particles = [];
  for (let i = 0; i < 20; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xff6600 })
    );
    p.position.set(x, y, z);
    p.userData.vel = new THREE.Vector3(
      (Math.random()-0.5)*2,
      Math.random()*2,
      (Math.random()-0.5)*2
    );
    scene.add(p);
    particles.push(p);
    setTimeout(() => scene.remove(p), 1000);
  }
  // Animate particles
  const anim = () => {
    particles.forEach(p => {
      if (p.parent) {
        p.position.add(p.userData.vel);
        p.userData.vel.y -= 0.05;
      }
    });
    if (particles[0] && particles[0].parent) requestAnimationFrame(anim);
  };
  anim();
}

function checkCollision(pos, radius = 2) {
  // Check haybales
  for (const hay of haybales) {
    const dx = pos.x - hay.position.x;
    const dz = pos.z - hay.position.z;
    if (Math.abs(dx) < radius + 1.5 && Math.abs(dz) < radius + 1.5) {
      return true;
    }
  }
  // Check walls
  if (Math.abs(pos.x) > MAP_SIZE/2 - radius || Math.abs(pos.z) > MAP_SIZE/2 - radius) {
    return true;
  }
  return false;
}

function checkBulletCollisions() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    
    // Collision haybales
    for (const hay of haybales) {
      if (b.position.distanceTo(hay.position) < 1.8) {
        scene.remove(b);
        bullets.splice(i, 1);
        break;
      }
    }
    if (i >= bullets.length) continue;
    
    // Collision AI
    for (let j = aiList.length - 1; j >= 0; j--) {
      const ai = aiList[j];
      if (b.position.distanceTo(ai.mesh.position) < 1.2) {
        ai.hp -= 1;
        scene.remove(b);
        bullets.splice(i, 1);
        if (ai.hp <= 0) {
          createExplosion(ai.mesh.position.x, ai.mesh.position.y, ai.mesh.position.z);
          scene.remove(ai.mesh);
          aiList.splice(j, 1);
          kills++;
          // Respawn power-up
          spawnPowerUp(ai.mesh.position.x, ai.mesh.position.z, Math.random() > 0.5 ? 'health' : 'speed');
        }
        break;
      }
    }
    if (i >= bullets.length) continue;
    
    // Collision players
    for (const pid in players) {
      if (pid === b.userData.ownerId) continue;
      const p = players[pid];
      if (!p || !p.mesh) continue;
      if (b.position.distanceTo(p.mesh.position) < 1.2) {
        scene.remove(b);
        bullets.splice(i, 1);
        
        if (pid === socket.id) {
          hp--;
          if (hp <= 0) {
            createExplosion(localPlayer.mesh.position.x, localPlayer.mesh.position.y, localPlayer.mesh.position.z);
            alert('Tu es mort! Respawn...');
            localPlayer.mesh.position.set((Math.random()-0.5)*50, 0.5, (Math.random()-0.5)*50);
            hp = 3;
          }
        }
        break;
      }
    }
  }
}

// AI behavior
function updateAI() {
  const now = Date.now();
  aiList.forEach(ai => {
    if (now - ai.lastMove > 100) {
      const target = localPlayer && localPlayer.mesh ? localPlayer.mesh.position : null;
      if (target) {
        const dx = target.x - ai.mesh.position.x;
        const dz = target.z - ai.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist > 5 && dist < 40) {
          const newX = ai.mesh.position.x + (dx/dist) * 0.08;
          const newZ = ai.mesh.position.z + (dz/dist) * 0.08;
          if (!checkCollision(new THREE.Vector3(newX, 0, newZ), 1.5)) {
            ai.mesh.position.x = newX;
            ai.mesh.position.z = newZ;
            ai.mesh.lookAt(target);
          }
        }
        
        if (dist < 30 && now - ai.lastFire > 2000) {
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          spawnBullet(ai.mesh.position.x, ai.mesh.position.y + 1, ai.mesh.position.z, dir, ai.id);
          ai.lastFire = now;
        }
      }
      ai.lastMove = now;
    }
  });
}

// Power-up collection
function checkPowerUpCollection() {
  if (!localPlayer || !localPlayer.mesh) return;
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    if (localPlayer.mesh.position.distanceTo(pu.mesh.position) < 2) {
      if (pu.type === 'health') {
        hp = Math.min(3, hp + 1);
      } else if (pu.type === 'speed') {
        stamina = 100;
      }
      scene.remove(pu.mesh);
      powerUps.splice(i, 1);
    }
  }
}

// Network
createRoomBtn.onclick = () => {
  const name = createName.value.trim();
  if (!name) return alert('Choisis un pseudo');
  myName = name;
  myColor = createColor.value || '#ff9966';
  controlMode = controlsSelect.value;
  socket.emit('create_room', { name, color: myColor, mode: modeSelect.value }, (res) => {
    if (res && res.ok) {
      myRoom = res.roomId;
      amIHost = true;
      showLobby(res.roomId);
      spawnLocal(name, myColor);
    } else {
      alert(res && res.error ? res.error : 'Erreur création');
    }
  });
};

joinRoomBtn.onclick = () => {
  const name = createName.value.trim();
  const rid = joinRoomId.value.trim();
  if (!name) return alert('Choisis un pseudo');
  if (!rid) return alert('Entre un ID de salle');
  myName = name;
  myColor = createColor.value || '#ff9966';
  controlMode = controlsSelect.value;
  socket.emit('join_room', { roomId: rid, name, color: myColor }, (res) => {
    if (res && res.ok) {
      myRoom = res.roomId;
      amIHost = false;
      showLobby(res.roomId);
      spawnLocal(name, myColor);
    } else {
      alert(res && res.error ? res.error : 'Impossible de rejoindre');
    }
  });
};

inviteBtn.onclick = () => {
  const target = inviteName.value.trim();
  if (!target) return alert('Entrez le pseudo à inviter');
  socket.emit('invite', { targetName: target }, (res) => {
    if (res && res.ok) {
      appendChat('SYSTEM', `Invitation envoyée à ${target}`);
    } else {
      appendChat('SYSTEM', res && res.error ? res.error : 'Échec invitation');
    }
  });
};

leaveBtn.onclick = () => {
  socket.emit('leave_room', {}, () => location.reload());
};

startGameBtn.onclick = () => {
  if (!amIHost) return alert('Seul l\'hôte peut lancer');
  socket.emit('start_match', { aiCount: 8 });
};

function appendChat(name, text) {
  const d = document.createElement('div');
  d.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
  chatLog.appendChild(d);
  chatLog.scrollTop = chatLog.scrollHeight;
}

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const t = chatInput.value.trim();
    if (!t || !myRoom) return;
    socket.emit('lobby_chat', { text: t });
    chatInput.value = '';
  }
});

// Socket events
socket.on('connect', () => console.log('✅ Connecté:', socket.id));

socket.on('joined_room', ({ roomId, isHost }) => {
  myRoom = roomId;
  amIHost = isHost;
  showLobby(roomId);
});

socket.on('room_update', (room) => {
  playersList.innerHTML = '';
  roomLabel.textContent = `#${room.roomId}`;
  
  for (const sid in room.players) {
    const p = room.players[sid];
    const div = document.createElement('div');
    div.textContent = `${p.name}${sid === socket.id ? ' (Moi)' : ''}${room.host === sid ? ' ⭐' : ''}`;
    playersList.appendChild(div);
    
    if (sid !== socket.id && !players[sid]) {
      spawnRemote(sid, p.name, p.color, p.x, p.z);
    }
  }
});

socket.on('player_update', ({ playerId, state }) => {
  if (players[playerId] && players[playerId].mesh) {
    players[playerId].mesh.position.x = state.x;
    players[playerId].mesh.position.z = state.z;
    players[playerId].mesh.rotation.y = state.angle;
  }
});

socket.on('invite_request', ({ fromName, roomId }) => {
  const accept = confirm(`${fromName} t'invite dans ${roomId}. Accepter ?`);
  socket.emit('invite_response', { fromName, roomId, accept });
});

socket.on('invite_response', ({ from, accept }) => {
  appendChat('SYSTEM', `${from} a ${accept ? 'accepté' : 'refusé'}`);
});

socket.on('lobby_chat', ({ name, text }) => appendChat(name, text));

socket.on('match_started', ({ IA }) => {
  console.log('🎯 Match démarré');
  menu.style.display = 'none';
  lobbyUi.style.display = 'none';
  
  aiList.forEach(ai => scene.remove(ai.mesh));
  aiList = [];
  
  if (IA && IA.length) {
    IA.forEach(a => {
      const mesh = makeGoatMesh('#c95a3c');
      mesh.position.set(a.x, 0.5, a.z);
      scene.add(mesh);
      aiList.push({ id: a.id, mesh, hp: a.lives, lastFire: 0, lastMove: 0 });
    });
  }
  
  appendChat('SYSTEM', 'Partie lancée !');
});

socket.on('fire', ({ shooter, shooterName, x, y, z, dir }) => {
  const dirV = new THREE.Vector3(dir.x, dir.y, dir.z);
  spawnBullet(x, y, z, dirV, shooter);
});

function showLobby(roomId) {
  menu.style.display = 'none';
  lobbyUi.style.display = 'block';
  roomLabel.textContent = `#${roomId}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Game loop
function animate() {
  requestAnimationFrame(animate);

  if (localPlayer && localPlayer.mesh) {
    let mv = 0, tr = 0;
    
    if (controlMode === 'zqsd') {
      if (keys['z']) mv = 1;
      if (keys['s']) mv = -1;
      if (keys['q']) tr = 1;
      if (keys['d']) tr = -1;
    } else if (controlMode === 'wasd') {
      if (keys['w']) mv = 1;
      if (keys['s']) mv = -1;
      if (keys['a']) tr = 1;
      if (keys['d']) tr = -1;
    } else {
      if (keys['arrowup']) mv = 1;
      if (keys['arrowdown']) mv = -1;
      if (keys['arrowleft']) tr = 1;
      if (keys['arrowright']) tr = -1;
    }

    // Sprint + son moteur
    let speed = 0.15;
    if (keys['f'] && stamina > 0) {
      speed = 0.4;
      stamina -= 0.5;
      if (motorGain) motorGain.gain.value = Math.min(0.15, motorGain.gain.value + 0.02);
    } else {
      stamina = Math.min(100, stamina + 0.3);
      if (motorGain) motorGain.gain.value = Math.max(0, motorGain.gain.value - 0.02);
    }

    // Jump
    if (isJumping) {
      localPlayer.mesh.position.y += jumpVelocity;
      jumpVelocity -= 0.02;
      if (localPlayer.mesh.position.y <= 0.5) {
        localPlayer.mesh.position.y = 0.5;
        isJumping = false;
        jumpVelocity = 0;
      }
    }

    // Rotation
    localPlayer.mesh.rotation.y += tr * 0.06;
    
    // New position
    const newX = localPlayer.mesh.position.x + Math.sin(localPlayer.mesh.rotation.y) * mv * speed;
    const newZ = localPlayer.mesh.position.z + Math.cos(localPlayer.mesh.rotation.y) * mv * speed;
    
    if (!checkCollision(new THREE.Vector3(newX, 0, newZ), 1.5)) {
      localPlayer.mesh.position.x = newX;
      localPlayer.mesh.position.z = newZ;
    }

    // Mode précision (maintenir H)
    if (precisionMode) {
      // Zoom + arme visible + tête chèvre visible
      camera.fov = 40;
      camera.updateProjectionMatrix();
      
      const headPos = localPlayer.mesh.position.clone();
      headPos.y += 2.5;
      headPos.x -= Math.sin(localPlayer.mesh.rotation.y) * 2;
      headPos.z -= Math.cos(localPlayer.mesh.rotation.y) * 2;
      
      camera.position.lerp(headPos, 0.2);
      camera.lookAt(
        localPlayer.mesh.position.x + Math.sin(localPlayer.mesh.rotation.y) * 50,
        localPlayer.mesh.position.y + 1,
        localPlayer.mesh.position.z + Math.cos(localPlayer.mesh.rotation.y) * 50
      );
      
      if (gunMesh) {
        gunMesh.visible = true;
        gunMesh.position.set(0.4, -0.2, -0.8);
      }
      localPlayer.mesh.visible = true;
    } else {
      // Mode normal 3ème personne
      camera.fov = 75;
      camera.updateProjectionMatrix();
      
      camera.position.lerp(
        new THREE.Vector3(
          localPlayer.mesh.position.x - Math.sin(localPlayer.mesh.rotation.y) * 8,
          6,
          localPlayer.mesh.position.z - Math.cos(localPlayer.mesh.rotation.y) * 8
        ),
        0.12
      );
      camera.lookAt(localPlayer.mesh.position);
      
      if (gunMesh) gunMesh.visible = false;
      localPlayer.mesh.visible = true;
    }

    // Send state
    socket.emit('player_state', {
      x: localPlayer.mesh.position.x,
      z: localPlayer.mesh.position.z,
      angle: localPlayer.mesh.rotation.y
    });

    // Update HUD
    const kmh = Math.round(Math.abs(mv * speed * 1000));
    speedHUD.innerText = `${kmh} km/h | HP: ${hp}/3 | Kills: ${kills} | Stamina: ${Math.round(stamina)}%`;
  }

  // Power-ups rotation
  powerUps.forEach(pu => {
    pu.mesh.rotation.y += 0.02;
    pu.mesh.position.y = 1 + Math.sin(Date.now() * 0.003) * 0.3;
  });

  // Advance bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.addScaledVector(b.userData.dir, 1.2);
    
    // Trail effect
    if (b.userData.trail.length < 5) {
      const trailPoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 })
      );
      trailPoint.position.copy(b.position);
      scene.add(trailPoint);
      b.userData.trail.push(trailPoint);
      setTimeout(() => scene.remove(trailPoint), 200);
    }
    
    if (Math.abs(b.position.x) > MAP_SIZE/2 || Math.abs(b.position.z) > MAP_SIZE/2) {
      scene.remove(b);
      bullets.splice(i, 1);
    }
  }

  checkBulletCollisions();
  checkPowerUpCollection();
  updateAI();
  
  renderer.render(scene, camera);
}

animate();

// Input
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;
  
  // Tir (G)
  if (key === 'g') {
    if (localPlayer && localPlayer.mesh) {
      playShootSound();
      const from = localPlayer.mesh.position.clone();
      from.y += 1.2;
      const dir = new THREE.Vector3(
        Math.sin(localPlayer.mesh.rotation.y),
        0,
        Math.cos(localPlayer.mesh.rotation.y)
      ).normalize();
      
      spawnBullet(from.x, from.y, from.z, dir, socket.id);
      socket.emit('fire', { 
        x: from.x, 
        y: from.y, 
        z: from.z, 
        dir: { x: dir.x, y: dir.y, z: dir.z } 
      });
    }
  }
  
  // Mode précision (maintenir H)
  if (key === 'h') {
    precisionMode = true;
  }
  
  // Saut (ESPACE)
  if (e.code === 'Space' && !isJumping && localPlayer) {
    isJumping = true;
    jumpVelocity = 0.25;
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  keys[key] = false;
  
  if (key === 'h') {
    precisionMode = false;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

backToMenu.addEventListener('click', () => location.reload());
