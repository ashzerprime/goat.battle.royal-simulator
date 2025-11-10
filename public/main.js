/* public/main.js - VERSION FINALE ULTRA COMPLÈTE
   Nouvelles fonctionnalités :
   - Armes : 9mm, AK-47, Sniper avec changement (touches 1,2,3)
   - Sons réalistes pour chaque arme
   - Rafale pour AK, rechargement sniper
   - Douilles qui tombent
   - Power-ups armes qui spawn aléatoirement
   - Bottes de foin low-poly
   - Clôtures en bois aux bordures
   - Montagnes et ferme au loin
   - Zoom sniper décalé
   - IA s'entretuent
   - Collisions complètes
   - Se baisser (Ctrl)
   - Compteur de vitesse réel
   - Choix bruit moteur
   - Pas de rafale involontaire
   - Invitations corrigées
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
const engineSelect = document.getElementById('engineSound');
const playersList = document.getElementById('playersList');
const roomLabel = document.getElementById('roomLabel');
const inviteName = document.getElementById('inviteName');
const inviteBtn = document.getElementById('inviteBtn');
const startGameBtn = document.getElementById('startGameBtn');
const leaveBtn = document.getElementById('leaveBtn');
const speedHUD = document.getElementById('speedHUD');
const weaponHUD = document.getElementById('weaponHUD');
const timerHUD = document.getElementById('timerHUD');
const endScreen = document.getElementById('endScreen');
const backToMenu = document.getElementById('backToMenu');

// State
let myName = null;
let myColor = '#ff9966';
let myRoom = null;
let amIHost = false;
let controlMode = 'zqsd';
let engineSound = 'sport';
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
let weaponPowerUps = [];
let haybales = [];
let isCrouching = false;
let currentWeapon = 'pistol'; // pistol, ak47, sniper
let ammo = { pistol: Infinity, ak47: 30, sniper: 5 };
let isReloading = false;
let canShoot = true;
let lastShot = 0;
let matchStartTime = null;

const MAP_SIZE = 400;

const weaponStats = {
  pistol: { damage: 1, fireRate: 300, reloadTime: 1000, magSize: 12, auto: false },
  ak47: { damage: 1, fireRate: 100, reloadTime: 2000, magSize: 30, auto: true },
  sniper: { damage: 3, fireRate: 1500, reloadTime: 2500, magSize: 5, auto: false }
};

// Audio contexts
let audioCtx;
let motorOsc = null;
let motorGain = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function startMotorSound() {
  if (!audioCtx) initAudio();
  if (motorOsc) return;
  
  motorOsc = audioCtx.createOscillator();
  motorGain = audioCtx.createGain();
  
  if (engineSound === 'sport') {
    motorOsc.type = 'sawtooth';
    motorOsc.frequency.value = 80;
  } else if (engineSound === 'diesel') {
    motorOsc.type = 'square';
    motorOsc.frequency.value = 50;
  } else {
    motorOsc.type = 'triangle';
    motorOsc.frequency.value = 100;
  }
  
  motorGain.gain.value = 0;
  motorOsc.connect(motorGain);
  motorGain.connect(audioCtx.destination);
  motorOsc.start();
}

function updateMotorSound(speed) {
  if (!motorGain || !motorOsc) return;
  const targetGain = speed > 0.1 ? Math.min(0.2, speed * 0.5) : 0;
  motorGain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.1);
  
  // Variation fréquence
  const baseFreq = engineSound === 'sport' ? 80 : engineSound === 'diesel' ? 50 : 100;
  motorOsc.frequency.linearRampToValueAtTime(
    baseFreq + speed * 100 + Math.random() * 10,
    audioCtx.currentTime + 0.1
  );
}

function playShootSound(weapon) {
  if (!audioCtx) initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  if (weapon === 'pistol') {
    osc.frequency.value = 200;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.stop(audioCtx.currentTime + 0.08);
  } else if (weapon === 'ak47') {
    osc.frequency.value = 150;
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.06);
    osc.stop(audioCtx.currentTime + 0.06);
  } else {
    osc.frequency.value = 100;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.stop(audioCtx.currentTime + 0.3);
  }
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
}

function playReloadSound() {
  if (!audioCtx) initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 300;
  osc.type = 'square';
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
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
scene.fog = new THREE.Fog(0x87ceeb, 100, MAP_SIZE * 0.8);

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

// Ground infini
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

// Clôtures en bois (remplacent murs invisibles)
function createFence(x, z, width, depth, rotY = 0) {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
  
  const numPosts = Math.floor((width > depth ? width : depth) / 4);
  for (let i = 0; i <= numPosts; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), woodMat);
    const offset = (i / numPosts - 0.5) * (width > depth ? width : depth);
    if (width > depth) {
      post.position.set(offset, 1.5, 0);
    } else {
      post.position.set(0, 1.5, offset);
    }
    post.castShadow = true;
    group.add(post);
  }
  
  // Planches horizontales
  for (let h = 0; h < 2; h++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(width > depth ? width : 0.2, 0.2, width > depth ? 0.2 : depth),
      woodMat
    );
    plank.position.y = 1 + h * 0.8;
    plank.castShadow = true;
    group.add(plank);
  }
  
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  group.userData.isFence = true;
  scene.add(group);
  return group;
}

createFence(0, MAP_SIZE/2, MAP_SIZE, 2);
createFence(0, -MAP_SIZE/2, MAP_SIZE, 2);
createFence(MAP_SIZE/2, 0, 2, MAP_SIZE, Math.PI/2);
createFence(-MAP_SIZE/2, 0, 2, MAP_SIZE, Math.PI/2);

// Bottes de foin low-poly
function createHaybale(x, z) {
  const group = new THREE.Group();
  const hayMat = new THREE.MeshLambertMaterial({ color: 0xdaa520 });
  
  // Corps principal (cylindre à 6 faces pour low-poly)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 6), hayMat);
  body.position.y = 1;
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  // Ficelles (détails)
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x654321 });
  for (let i = -0.5; i <= 0.5; i += 0.5) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.05, 4, 8), ropeMat);
    rope.position.set(i * 2, 1, 0);
    rope.rotation.y = Math.PI / 2;
    group.add(rope);
  }
  
  group.position.set(x, 0, z);
  group.userData.isHaybale = true;
  scene.add(group);
  haybales.push(group);
}

// 40 bottes aléatoires
for (let i = 0; i < 40; i++) {
  createHaybale(
    (Math.random() - 0.5) * (MAP_SIZE - 30),
    (Math.random() - 0.5) * (MAP_SIZE - 30)
  );
}

// Montagnes au loin
function createMountain(x, z, scale) {
  const geo = new THREE.ConeGeometry(20 * scale, 40 * scale, 6);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
  const mountain = new THREE.Mesh(geo, mat);
  mountain.position.set(x, 20 * scale, z);
  mountain.receiveShadow = true;
  scene.add(mountain);
}

createMountain(-MAP_SIZE * 0.7, -MAP_SIZE * 0.7, 2);
createMountain(MAP_SIZE * 0.6, -MAP_SIZE * 0.8, 1.8);
createMountain(-MAP_SIZE * 0.5, MAP_SIZE * 0.6, 1.5);
createMountain(MAP_SIZE * 0.8, MAP_SIZE * 0.5, 2.2);

// Ferme au loin
function createFarm() {
  const group = new THREE.Group();
  
  // Grange
  const barn = new THREE.Mesh(
    new THREE.BoxGeometry(15, 10, 20),
    new THREE.MeshLambertMaterial({ color: 0x8b0000 })
  );
  barn.position.y = 5;
  barn.castShadow = true;
  group.add(barn);
  
  // Toit
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(12, 6, 4),
    new THREE.MeshLambertMaterial({ color: 0x654321 })
  );
  roof.position.y = 13;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  
  // Silo
  const silo = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 15, 8),
    new THREE.MeshLambertMaterial({ color: 0xcccccc })
  );
  silo.position.set(12, 7.5, 0);
  silo.castShadow = true;
  group.add(silo);
  
  const siloTop = new THREE.Mesh(
    new THREE.ConeGeometry(3.5, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0x333333 })
  );
  siloTop.position.set(12, 17, 0);
  group.add(siloTop);
  
  group.position.set(MAP_SIZE * 0.4, 0, MAP_SIZE * 0.4);
  scene.add(group);
}

createFarm();

// Goat mesh
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

// Armes
function makeGunMesh(type) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
  
  if (type === 'pistol') {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), mat);
    barrel.position.set(0, -0.1, -0.3);
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), mat);
    grip.position.set(0, -0.25, 0);
    g.add(grip);
  } else if (type === 'ak47') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.2), mat);
    body.position.set(0, -0.1, -0.6);
    g.add(body);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.2), mat);
    mag.position.set(0, -0.3, -0.3);
    g.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), mat);
    stock.position.set(0, -0.05, 0.3);
    g.add(stock);
  } else {
    // Sniper
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.05, -0.75);
    g.add(barrel);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), mat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.05, -0.3);
    g.add(scope);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x654321 }));
    stock.position.set(0, -0.1, 0.3);
    g.add(stock);
  }
  
  return g;
}

function spawnLocal(name, color) {
  const mesh = makeGoatMesh(color);
  mesh.position.set((Math.random()-0.5)*50, 0.5, (Math.random()-0.5)*50);
  scene.add(mesh);
  localPlayer = { id: socket.id, name, color, mesh, hp: 3 };
  players[socket.id] = { name, color, mesh, hp: 3 };
  
  gunMesh = makeGunMesh('pistol');
  camera.add(gunMesh);
  gunMesh.position.set(0.3, -0.3, -0.5);
  gunMesh.visible = false;
  
  hp = 3;
  currentWeapon = 'pistol';
  initAudio();
  startMotorSound();
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
    aiList.push({ id, mesh, hp: 3, lastFire: 0, lastMove: 0, weapon: 'pistol' });
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

// Power-ups armes
function spawnWeaponPowerUp(x, z, weapon) {
  let mesh;
  if (weapon === 'ak47') {
    mesh = makeGunMesh('ak47');
    mesh.scale.set(2, 2, 2);
  } else {
    mesh = makeGunMesh('sniper');
    mesh.scale.set(2, 2, 2);
  }
  mesh.position.set(x, 1.5, z);
  scene.add(mesh);
  weaponPowerUps.push({ mesh, weapon, time: Date.now() });
}

// Spawn 3 armes aléatoires
for (let i = 0; i < 3; i++) {
  spawnWeaponPowerUp(
    (Math.random()-0.5)*(MAP_SIZE-40),
    (Math.random()-0.5)*(MAP_SIZE-40),
    Math.random() > 0.5 ? 'ak47' : 'sniper'
  );
}

// 5 power-ups santé
for (let i = 0; i < 5; i++) {
  spawnPowerUp(
    (Math.random()-0.5)*(MAP_SIZE-40),
    (Math.random()-0.5)*(MAP_SIZE-40),
    Math.random() > 0.5 ? 'health' : 'speed'
  );
}

function spawnBullet(x, y, z, dirVec, ownerId, weapon) {
  const bGeo = new THREE.SphereGeometry(weapon === 'sniper' ? 0.2 : 0.12, 8, 8);
  const bMat = new THREE.MeshBasicMaterial({ 
    color: weapon === 'sniper' ? 0xff0000 : 0xffdd33 
  });
  const b = new THREE.Mesh(bGeo, bMat);
  b.position.set(x, y, z);
  b.userData = { 
    dir: dirVec.clone().normalize(), 
    ownerId, 
    weapon,
    damage: weaponStats[weapon].damage 
  };
  scene.add(b);
  bullets.push(b);
}

// Douille
function spawnShell(x, y, z) {
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.15, 6),
    new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.8 })
  );
  shell.position.set(x, y, z);
  shell.userData.vel = new THREE.Vector3(
    (Math.random()-0.5)*0.2,
    Math.random()*0.3 + 0.2,
    (Math.random()-0.5)*0.2
  );
  shell.rotation.set(Math.random(), Math.random(), Math.random());
  scene.add(shell);
  
  const anim = () => {
    if (!shell.parent) return;
    shell.position.add(shell.userData.vel);
    shell.userData.vel.y -= 0.01;
    shell.rotation.x += 0.1;
    shell.rotation.z += 0.05;
    if (shell.position.y > 0.1) {
      requestAnimationFrame(anim);
    } else {
      setTimeout(() => scene.remove(shell), 3000);
    }
  };
  anim();
}

// Explosion
function createExplosion(x, y, z) {
  playExplosionSound();
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
    setTimeout(() => scene.remove(p), 1000);
    
    const anim = () => {
      if (p.parent) {
        p.position.add(p.userData.vel);
        p.userData.vel.y -= 0.05;
        requestAnimationFrame(anim);
      }
    };
    anim();
  }
}

function checkCollision(pos, radius = 2) {
  for (const hay of haybales) {
    const dx = pos.x - hay.position.x;
    const dz = pos.z - hay.position.z;
    if (Math.abs(dx) < radius + 1.5 && Math.abs(dz) < radius + 1.5) {
      return true;
    }
  }
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
        ai.hp -= b.userData.damage;
        scene.remove(b);
        bullets.splice(i, 1);
        if (ai.hp <= 0) {
          createExplosion(ai.mesh.position.x, ai.mesh.position.y, ai.mesh.position.z);
          scene.remove(ai.mesh);
          aiList.splice(j, 1);
          if (b.userData.ownerId === socket.id) kills++;
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
          hp -= b.userData.damage;
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

// AI behavior amélioré
function updateAI() {
  const now = Date.now();
  
  // IA s'entretuent et attaquent joueurs
  aiList.forEach(ai => {
    if (now - ai.lastMove < 100) return;
    
    // Trouver cible la plus proche (joueur ou autre IA)
    let closestTarget = null;
    let closestDist = Infinity;
    
    // Check joueurs
    for (const pid in players) {
      const p = players[pid];
      if (!p || !p.mesh) continue;
      const dist = ai.mesh.position.distanceTo(p.mesh.position);
      if (dist < closestDist && dist < 50) {
        closestDist = dist;
        closestTarget = p.mesh;
      }
    }
    
    // Check autres IA
    aiList.forEach(otherAI => {
      if (otherAI.id === ai.id) return;
      const dist = ai.mesh.position.distanceTo(otherAI.mesh.position);
      if (dist < closestDist && dist < 40) {
        closestDist = dist;
        closestTarget = otherAI.mesh;
      }
    });
    
    if (closestTarget) {
      const dx = closestTarget.position.x - ai.mesh.position.x;
      const dz = closestTarget.position.z - ai.mesh.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      
      // Se déplacer si assez loin
      if (dist > 8 && dist < 50) {
        const newX = ai.mesh.position.x + (dx/dist) * 0.1;
        const newZ = ai.mesh.position.z + (dz/dist) * 0.1;
        if (!checkCollision(new THREE.Vector3(newX, 0, newZ), 1.5)) {
          ai.mesh.position.x = newX;
          ai.mesh.position.z = newZ;
          ai.mesh.lookAt(closestTarget.position);
        }
      }
      
      // Tirer si à portée
      if (dist < 35 && now - ai.lastFire > 1500) {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        spawnBullet(ai.mesh.position.x, ai.mesh.position.y + 1, ai.mesh.position.z, dir, ai.id, ai.weapon);
        ai.lastFire = now;
      }
    }
    
    ai.lastMove = now;
  });
}

// Collection power-ups
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
  
  for (let i = weaponPowerUps.length - 1; i >= 0; i--) {
    const wp = weaponPowerUps[i];
    if (localPlayer.mesh.position.distanceTo(wp.mesh.position) < 2.5) {
      currentWeapon = wp.weapon;
      ammo[wp.weapon] = weaponStats[wp.weapon].magSize;
      switchWeapon(wp.weapon);
      scene.remove(wp.mesh);
      weaponPowerUps.splice(i, 1);
      updateWeaponHUD();
    }
  }
}

function switchWeapon(weapon) {
  currentWeapon = weapon;
  if (gunMesh) camera.remove(gunMesh);
  gunMesh = makeGunMesh(weapon);
  camera.add(gunMesh);
  
  if (weapon === 'pistol') {
    gunMesh.position.set(0.3, -0.3, -0.5);
  } else if (weapon === 'ak47') {
    gunMesh.position.set(0.25, -0.25, -0.6);
  } else {
    gunMesh.position.set(0.2, -0.2, -0.7);
  }
  
  gunMesh.visible = precisionMode;
  updateWeaponHUD();
}

function updateWeaponHUD() {
  const ammoText = ammo[currentWeapon] === Infinity ? '∞' : ammo[currentWeapon];
  weaponHUD.innerText = `Arme: ${currentWeapon.toUpperCase()} | Munitions: ${ammoText}`;
}

function shoot() {
  if (!canShoot || isReloading || !localPlayer || !localPlayer.mesh) return;
  
  const stats = weaponStats[currentWeapon];
  const now = Date.now();
  
  if (now - lastShot < stats.fireRate) return;
  
  if (ammo[currentWeapon] !== Infinity) {
    if (ammo[currentWeapon] <= 0) {
      reload();
      return;
    }
    ammo[currentWeapon]--;
  }
  
  playShootSound(currentWeapon);
  lastShot = now;
  
  const from = localPlayer.mesh.position.clone();
  from.y += isCrouching ? 0.8 : 1.2;
  
  const dir = new THREE.Vector3(
    Math.sin(localPlayer.mesh.rotation.y),
    0,
    Math.cos(localPlayer.mesh.rotation.y)
  ).normalize();
  
  spawnBullet(from.x, from.y, from.z, dir, socket.id, currentWeapon);
  spawnShell(from.x, from.y, from.z);
  
  socket.emit('fire', { 
    x: from.x, 
    y: from.y, 
    z: from.z, 
    dir: { x: dir.x, y: dir.y, z: dir.z },
    weapon: currentWeapon
  });
  
  updateWeaponHUD();
  
  // Animation recul arme
  if (gunMesh) {
    const origZ = gunMesh.position.z;
    gunMesh.position.z += 0.1;
    setTimeout(() => gunMesh.position.z = origZ, 50);
  }
  
  // Rechargement auto sniper
  if (currentWeapon === 'sniper') {
    setTimeout(() => reload(), 200);
  }
}

function reload() {
  if (isReloading || ammo[currentWeapon] === Infinity) return;
  if (ammo[currentWeapon] === weaponStats[currentWeapon].magSize) return;
  
  isReloading = true;
  playReloadSound();
  
  setTimeout(() => {
    ammo[currentWeapon] = weaponStats[currentWeapon].magSize;
    isReloading = false;
    updateWeaponHUD();
  }, weaponStats[currentWeapon].reloadTime);
}

// Network
createRoomBtn.onclick = () => {
  const name = createName.value.trim();
  if (!name) return alert('Choisis un pseudo');
  myName = name;
  myColor = createColor.value || '#ff9966';
  controlMode = controlsSelect.value;
  engineSound = engineSelect.value;
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
  engineSound = engineSelect.value;
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
  socket.emit('start_match', { aiCount: 10 });
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
socket.on('connect', () => console.log('Connecté:', socket.id));

socket.on('joined_room', ({ roomId, isHost }) => {
  myRoom = roomId;
  amIHost = isHost;
  showLobby(roomId);
});

socket.on('room_update', (room) => {
  playersList.innerHTML = '';
  roomLabel.textContent = `${room.roomId}`;
  
  for (const sid in room.players) {
    const p = room.players[sid];
    const div = document.createElement('div');
    div.textContent = `${p.name}${sid === socket.id ? ' (Moi)' : ''}${room.host === sid ? ' HOST' : ''}`;
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
  console.log('Match démarré');
  menu.style.display = 'none';
  lobbyUi.style.display = 'none';
  matchStartTime = Date.now();
  
  aiList.forEach(ai => scene.remove(ai.mesh));
  aiList = [];
  
  if (IA && IA.length) {
    IA.forEach(a => {
      const mesh = makeGoatMesh('#c95a3c');
      mesh.position.set(a.x, 0.5, a.z);
      scene.add(mesh);
      aiList.push({ id: a.id, mesh, hp: a.lives, lastFire: 0, lastMove: 0, weapon: 'pistol' });
    });
  }
  
  appendChat('SYSTEM', 'Partie lancée !');
});

socket.on('fire', ({ shooter, shooterName, x, y, z, dir, weapon }) => {
  const dirV = new THREE.Vector3(dir.x, dir.y, dir.z);
  spawnBullet(x, y, z, dirV, shooter, weapon || 'pistol');
});

function showLobby(roomId) {
  menu.style.display = 'none';
  lobbyUi.style.display = 'block';
  roomLabel.textContent = `${roomId}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Game loop
let lastFrameTime = Date.now();

function animate() {
  requestAnimationFrame(animate);
  const now = Date.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

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

    // Sprint
    let speed = isCrouching ? 0.08 : 0.15;
    let actualSpeed = Math.abs(mv * speed);
    
    if (keys['shift'] && stamina > 0 && !isCrouching) {
      speed = 0.4;
      actualSpeed = Math.abs(mv * speed);
      stamina -= 0.5;
    } else {
      stamina = Math.min(100, stamina + 0.3);
    }
    
    updateMotorSound(actualSpeed);

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

    // Crouch
    if (isCrouching) {
      localPlayer.mesh.scale.y = 0.6;
      localPlayer.mesh.position.y = 0.3;
    } else {
      localPlayer.mesh.scale.y = 1;
      localPlayer.mesh.position.y = isJumping ? localPlayer.mesh.position.y : 0.5;
    }

    // Rotation
    localPlayer.mesh.rotation.y += tr * 0.06;
    
    // Position
    const newX = localPlayer.mesh.position.x + Math.sin(localPlayer.mesh.rotation.y) * mv * speed;
    const newZ = localPlayer.mesh.position.z + Math.cos(localPlayer.mesh.rotation.y) * mv * speed;
    
    if (!checkCollision(new THREE.Vector3(newX, 0, newZ), 1.5)) {
      localPlayer.mesh.position.x = newX;
      localPlayer.mesh.position.z = newZ;
    }

    // Mode précision
    if (precisionMode && currentWeapon === 'sniper') {
      // Zoom sniper décalé
      camera.fov = 25;
      camera.updateProjectionMatrix();
      
      const offset = new THREE.Vector3(
        Math.sin(localPlayer.mesh.rotation.y + Math.PI/2) * 1.5,
        0,
        Math.cos(localPlayer.mesh.rotation.y + Math.PI/2) * 1.5
      );
      
      const headPos = localPlayer.mesh.position.clone();
      headPos.y += 2.8;
      headPos.add(offset);
      headPos.x -= Math.sin(localPlayer.mesh.rotation.y) * 1;
      headPos.z -= Math.cos(localPlayer.mesh.rotation.y) * 1;
      
      camera.position.lerp(headPos, 0.2);
      camera.lookAt(
        localPlayer.mesh.position.x + Math.sin(localPlayer.mesh.rotation.y) * 100,
        localPlayer.mesh.position.y + 1,
        localPlayer.mesh.position.z + Math.cos(localPlayer.mesh.rotation.y) * 100
      );
      
      if (gunMesh) {
        gunMesh.visible = true;
        gunMesh.position.set(0.5, -0.15, -1);
      }
      localPlayer.mesh.visible = true;
    } else if (precisionMode) {
      // Zoom normal
      camera.fov = 50;
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
      
      if (gunMesh) gunMesh.visible = true;
      localPlayer.mesh.visible = true;
    } else {
      // Vue normale
      camera.fov = 75;
      camera.updateProjectionMatrix();
      
      camera.position.lerp(
        new THREE.Vector3(
          localPlayer.mesh.position.x - Math.sin(localPlayer.mesh.rotation.y) * 8,
          isCrouching ? 4 : 6,
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
    const kmh = Math.round(actualSpeed * 3600); // Conversion réaliste
    speedHUD.innerText = `${kmh} km/h | HP: ${hp}/3 | Kills: ${kills} | Stamina: ${Math.round(stamina)}%`;
  }

  // Timer
  if (matchStartTime) {
    const elapsed = Math.floor((now - matchStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    timerHUD.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Power-ups rotation
  powerUps.forEach(pu => {
    pu.mesh.rotation.y += 0.02;
    pu.mesh.position.y = 1 + Math.sin(now * 0.003) * 0.3;
  });
  
  weaponPowerUps.forEach(wp => {
    wp.mesh.rotation.y += 0.03;
    wp.mesh.position.y = 1.5 + Math.sin(now * 0.004) * 0.4;
  });

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const speed = b.userData.weapon === 'sniper' ? 2 : 1.2;
    b.position.addScaledVector(b.userData.dir, speed);
    
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
  
  // Tir
  if (key === 'e' || e.code === 'Space') {
    if (weaponStats[currentWeapon].auto) {
      // Rafale auto pour AK
      if (!keys['shooting']) {
        keys['shooting'] = true;
        const shootInterval = setInterval(() => {
          if (!keys['shooting']) {
            clearInterval(shootInterval);
            return;
          }
          shoot();
        }, weaponStats[currentWeapon].fireRate);
      }
    } else {
      shoot();
    }
  }
  
  // Précision
  if (key === 'h' || key === 'c') {
    precisionMode = true;
  }
  
  // Saut
  if (key === 'v' && !isJumping && localPlayer && !isCrouching) {
    isJumping = true;
    jumpVelocity = 0.25;
  }
  
  // Se baisser
  if (key === 'control') {
    isCrouching = true;
  }
  
  // Rechargement
  if (key === 'r') {
    reload();
  }
  
  // Changement d'arme
  if (key === '1') switchWeapon('pistol');
  if (key === '2' && ammo.ak47 !== undefined) switchWeapon('ak47');
  if (key === '3' && ammo.sniper !== undefined) switchWeapon('sniper');
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  keys[key] = false;
  
  if (key === 'h' || key === 'c') {
    precisionMode = false;
  }
  
  if (key === 'control') {
    isCrouching = false;
  }
  
  if (key === 'e' || e.code === 'Space') {
    keys['shooting'] = false;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

backToMenu.addEventListener('click', () => location.reload());
