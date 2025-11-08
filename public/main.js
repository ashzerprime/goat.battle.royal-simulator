/* public/main.js
   Goat Battle Royale — client final
   - chèvres low-poly (construites en géométries)
   - lobby / chat / invites / host start
   - match immediate start (pas de countdown)
   - ZQSD / WASD / flèches
   - sprint (F), jump not implemented, shoot (G), FPS (H)
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
let localPlayer = null; // goat mesh
let players = {}; // socketId -> { name,color,mesh }
let aiList = [];
let bullets = [];
let keys = {};
let stamina = 100;

// Three.js
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 25);

// lights
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dl = new THREE.DirectionalLight(0xffffff, 0.6);
dl.position.set(50, 100, 50);
scene.add(dl);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: 0x3aa047 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// helpers: build a low-poly goat (combination of shapes)
function makeGoatMesh(color = '#ff9966') {
  const group = new THREE.Group();

  // body
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3.2), bodyMat);
  body.position.set(0, 0.9, 0);
  group.add(body);

  // head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 1.1), bodyMat);
  head.position.set(0, 1.25, 1.8);
  group.add(head);

  // horns (two cones)
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), hornMat);
  hornL.position.set(-0.25, 1.7, 2.25);
  hornL.rotation.set(-0.6, 0, -0.5);
  group.add(hornL);
  const hornR = hornL.clone();
  hornR.position.set(0.25, 1.7, 2.25);
  hornR.rotation.set(-0.6, 0, 0.5);
  group.add(hornR);

  // legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x6b4f2b });
  const legGeom = new THREE.BoxGeometry(0.3, 1, 0.3);
  const legOffsets = [
    [-0.7, 0.0, -1.0],
    [0.7, 0.0, -1.0],
    [-0.7, 0.0, 1.0],
    [0.7, 0.0, 1.0]
  ];
  legOffsets.forEach((o) => {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(o[0], 0.2, o[2]);
    group.add(leg);
  });

  // tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6), bodyMat);
  tail.position.set(0, 1.05, -1.75);
  tail.rotation.x = 0.6;
  group.add(tail);

  // simple eyes (black spheres) on head front
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
  eyeL.position.set(-0.18, 1.3, 2.15);
  const eyeR = eyeL.clone();
  eyeR.position.set(0.18, 1.3, 2.15);
  group.add(eyeL, eyeR);

  return group;
}

// small gun low-poly (attached to camera in FPS)
function makeGunMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), mat);
  barrel.position.set(0, -0.12, -0.4);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.25), mat);
  grip.position.set(0, -0.25, -0.05);
  g.add(grip);
  return g;
}

// spawn local player goat
function spawnLocal(name, color) {
  const mesh = makeGoatMesh(color);
  mesh.position.set( (Math.random()-0.5)*30, 0.5, (Math.random()-0.5)*30 );
  scene.add(mesh);
  localPlayer = { id: socket.id, name, color, mesh };
  players[socket.id] = { name, color, mesh };
  // attach gun to camera for FPS view
  gunMesh = makeGunMesh();
  camera.add(gunMesh);
  gunMesh.position.set(0.2, -0.4, -0.6);
}

// spawn remote player
function spawnRemote(id, name, color, x, z) {
  if (players[id]) return;
  const mesh = makeGoatMesh(color);
  mesh.position.set(x || 0, 0.5, z || 0);
  scene.add(mesh);
  players[id] = { name, color, mesh };
}

// spawn AI
function spawnAI(count) {
  for (let i = 0; i < count; i++) {
    const id = 'AI_' + Date.now().toString(36) + '_' + i;
    const mesh = makeGoatMesh('#c95a3c');
    mesh.position.set((Math.random()-0.5)*60, 0.5, (Math.random()-0.5)*60);
    scene.add(mesh);
    aiList.push({ id, mesh, hp: 3, lastFire: 0 });
  }
}

// bullets management (simple spheres)
function spawnBullet(x,y,z,dirVec, ownerId) {
  const bGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const bMat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
  const b = new THREE.Mesh(bGeo, bMat);
  b.position.set(x,y,z);
  b.userData = { dir: dirVec.clone().normalize(), ownerId };
  scene.add(b);
  bullets.push(b);
}

// basic collision check between bullet and goat mesh (distance)
function checkBulletCollisions() {
  for (let i = bullets.length-1; i >= 0; i--) {
    const b = bullets[i];
    // collides with AI
    for (let j = aiList.length-1; j >= 0; j--) {
      const ai = aiList[j];
      const d = b.position.distanceTo(ai.mesh.position);
      if (d < 1.0) {
        // hit
        ai.hp -= 1;
        scene.remove(b);
        bullets.splice(i,1);
        if (ai.hp <= 0) {
          scene.remove(ai.mesh);
          aiList.splice(j,1);
        }
        break;
      }
    }
    // collides with remote players
    for (const pid in players) {
      if (pid === b.userData.ownerId) continue;
      const p = players[pid];
      if (!p || !p.mesh) continue;
      const d = b.position.distanceTo(p.mesh.position);
      if (d < 1.0) {
        scene.remove(b);
        bullets.splice(i,1);
        // optionally mark death etc. (simple)
        break;
      }
    }
  }
}

// network: create/join/invite/start
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
      // spawn local for preview
      spawnLocal(name, myColor);
    } else alert(res && res.error ? res.error : 'Erreur création');
  });
};

joinRoomBtn.onclick = () => {
  const name = createName.value.trim();
  const rid = joinRoomId.value.trim();
  if (!name) return alert('Choisis un pseudo');
  myName = name;
  myColor = createColor.value || '#ff9966';
  controlMode = controlsSelect.value;
  socket.emit('join_room', { roomId: rid, name, color: myColor }, (res) => {
    if (res && res.ok) {
      myRoom = res.roomId;
      amIHost = res.isHost || false;
      showLobby(res.roomId);
      spawnLocal(name, myColor);
    } else alert(res && res.error ? res.error : 'Impossible de rejoindre');
  });
};

// invite an user by name
inviteBtn.onclick = () => {
  const target = inviteName.value.trim();
  if (!target) return alert('Entrez le pseudo à inviter');
  socket.emit('invite', { targetName: target }, (res) => {
    if (res && res.ok) {
      appendChat('SYSTEM', `Invitation envoyée à ${target}`);
    } else {
      appendChat('SYSTEM', res && res.error ? res.error : 'Inviter a échoué');
    }
  });
};

// leave
leaveBtn.onclick = () => {
  socket.emit('leave_room', {}, () => {
    location.reload();
  });
};

// start game (host)
startGameBtn.onclick = () => {
  if (!amIHost) { alert('Seul l’hôte peut lancer'); return; }
  socket.emit('start_match', { aiCount: 6 });
};

// chat UI
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

// server events
socket.on('connect', () => {
  console.log('connect', socket.id);
});
socket.on('room_update', (room) => {
  // update UI list
  playersList.innerHTML = '';
  roomLabel.textContent = `#${room.roomId}`;
  for (const sid in room.players) {
    const p = room.players[sid];
    const div = document.createElement('div');
    div.textContent = `${p.name}${sid === socket.id ? ' (Moi)' : ''}${room.host === sid ? ' ⭐' : ''}`;
    playersList.appendChild(div);
    // spawn remote if not exist
    if (!players[sid]) spawnRemote(sid, p.name, p.color, p.x, p.z);
  }
});

socket.on('invite_request', ({ fromName, roomId }) => {
  const accept = confirm(`${fromName} t'invite dans la salle ${roomId}. Accepter ?`);
  socket.emit('invite_response', { fromName, roomId, accept });
});

socket.on('invite_response', ({ from, accept }) => {
  appendChat('SYSTEM', `${from} a ${accept ? 'accepté' : 'refusé'} l'invitation`);
});

socket.on('lobby_chat', ({ name, text }) => {
  appendChat(name, text);
});

socket.on('match_started', ({ IA }) => {
  // hide lobby and show canvas (already present)
  menu.style.display = 'none';
  lobbyUi.style.display = 'none';
  // spawn AI from server-provided positions if any
  if (IA && IA.length) {
    spawnAI(0); // clear existing
    IA.forEach(a => {
      const mesh = makeGoatMesh('#c95a3c');
      mesh.position.set(a.x, 0.5, a.z);
      scene.add(mesh);
      aiList.push({ id: a.id, mesh, hp: a.lives });
    });
  } else {
    spawnAI(6);
  }
  appendChat('SYSTEM', 'La partie a commencé !');
});

// fire broadcast (someone shot) -> spawn bullet client-side so each client sees bullets
socket.on('fire', ({ shooter, x, y, z, dir }) => {
  // dir as object {x,y,z}
  const dirV = new THREE.Vector3(dir.x, dir.y, dir.z);
  spawnBullet(x,y,z,dirV, shooter);
});

// utilities
function showLobby(roomId) {
  menu.style.display = 'none';
  lobbyUi.style.display = 'block';
  roomLabel.textContent = `#${roomId}`;
  appendChat('SYSTEM', `Salle créée / rejointe : ${roomId}`);
}

// game loop
function animate() {
  requestAnimationFrame(animate);

  // input & movement local player
  if (localPlayer && localPlayer.mesh) {
    let mv = 0, tr = 0;
    if (controlMode === 'zqsd') {
      if (keys['z']) mv = 1;
      if (keys['s']) mv = -1;
      if (keys['q']) tr = -1;
      if (keys['d']) tr = 1;
    } else if (controlMode === 'wasd') {
      if (keys['w']) mv = 1;
      if (keys['s']) mv = -1;
      if (keys['a']) tr = -1;
      if (keys['d']) tr = 1;
    } else { // arrows
      if (keys['arrowup']) mv = 1;
      if (keys['arrowdown']) mv = -1;
      if (keys['arrowleft']) tr = -1;
      if (keys['arrowright']) tr = 1;
    }

    // sprint F
    let speed = 0.12;
    if (keys['f'] && stamina > 0) { speed = 0.35; stamina -= 0.6; } else { stamina = Math.min(100, stamina + 0.2); }
    // update pos
    localPlayer.mesh.rotation.y += tr * 0.06;
    localPlayer.mesh.position.x += Math.sin(localPlayer.mesh.rotation.y) * mv * speed * -1;
    localPlayer.mesh.position.z += Math.cos(localPlayer.mesh.rotation.y) * mv * speed;

    // camera follow
    camera.position.lerp(
      new THREE.Vector3(localPlayer.mesh.position.x - Math.sin(localPlayer.mesh.rotation.y) * 6, 5, localPlayer.mesh.position.z - Math.cos(localPlayer.mesh.rotation.y) * 6),
      0.12
    );
    camera.lookAt(localPlayer.mesh.position);

    // send state periodically
    socket.emit('player_state', {
      x: localPlayer.mesh.position.x,
      z: localPlayer.mesh.position.z,
      angle: localPlayer.mesh.rotation.y
    });

    // update speed HUD
    const kmh = Math.round(Math.abs(mv * speed * 1000));
    speedHUD.innerText = `${kmh} km/h`;
  }

  // advance bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.addScaledVector(b.userData.dir, 0.9);
    // out of bound cleanup
    if (Math.abs(b.position.x) > 200 || Math.abs(b.position.z) > 200) {
      scene.remove(b);
      bullets.splice(i, 1);
      continue;
    }
  }

  // detect collisions
  checkBulletCollisions();

  renderer.render(scene, camera);
}
animate();

// input listeners
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'g') {
    // shoot: spawn bullet and notify server
    if (localPlayer && localPlayer.mesh) {
      const from = localPlayer.mesh.position.clone();
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(localPlayer.mesh.quaternion).normalize();
      spawnBullet(from.x, from.y + 0.8, from.z, dir, socket.id);
      socket.emit('fire', { x: from.x, y: from.y+0.8, z: from.z, dir: { x: dir.x, y: dir.y, z: dir.z } });
    }
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// simple helper to escape HTML
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// helper: spawn remote when room update is received and not yet present
socket.on('room_update', (room) => {
  myRoom = room.roomId;
  playersList.innerHTML = '';
  for (const sid in room.players) {
    const p = room.players[sid];
    const div = document.createElement('div');
    div.textContent = `${p.name}${sid === socket.id ? ' (Moi)' : ''}${room.host === sid ? ' ⭐' : ''}`;
    playersList.appendChild(div);

    if (!players[sid]) {
      const mesh = makeGoatMesh(p.color || '#dddddd');
      mesh.position.set(p.x || 0, 0.5, p.z || 0);
      scene.add(mesh);
      players[sid] = { name: p.name, color: p.color, mesh };
    } else {
      // update remote positions smoothly
      players[sid].mesh.position.x = p.x || players[sid].mesh.position.x;
      players[sid].mesh.position.z = p.z || players[sid].mesh.position.z;
      players[sid].mesh.rotation.y = p.angle || players[sid].mesh.rotation.y;
    }
  }
});

// utility: when server tells us we joined/created
socket.on('joined_room', ({ roomId, isHost }) => {
  myRoom = roomId;
  amIHost = isHost;
  showLobby(roomId);
});

// show lobby
function showLobby(roomId) {
  menu.style.display = 'none';
  lobbyUi.style.display = 'block';
  roomLabel.innerText = roomId;
  chatLog.style.display = 'block';
  chatInput.style.display = 'block';
}

// append chat when server broadcasts
socket.on('lobby_chat', ({ name, text }) => appendChat(name, text));
function appendChat(name, text) { chatLog.appendChild(Object.assign(document.createElement('div'), { innerHTML: `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}` })); chatLog.scrollTop = chatLog.scrollHeight; }

// server invites handling done earlier (invite_request/invite_response)
socket.on('invite_request', ({ fromName, roomId }) => {
  const ok = confirm(`${fromName} t'invite dans la salle ${roomId}. Accepter ?`);
  socket.emit('invite_response', { fromName, roomId, accept: ok });
});

// when server asks us to spawn local (game_start)
socket.on('match_started', (data) => {
  menu.style.display = 'none';
  lobbyUi.style.display = 'none';
  spawnAI(data.IA && data.IA.length ? 0 : 8);
  appendChat('SYSTEM', 'Match démarré');
});

// simple leave/back
backToMenu.addEventListener('click', () => location.reload());
