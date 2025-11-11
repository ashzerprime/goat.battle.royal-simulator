/* public/main.js - VERSION ULTRA PROFESSIONNELLE
   Améliorations majeures :
   - Menu noir/blanc professionnel avec preview 3D de la chèvre
   - Système HP en % (100% max)
   - Dégâts réalistes : Sniper headshot -80%, body -30% | AK -20% | Pistol -20%
   - Zone de spawn large (150x150)
   - Visée style Fortnite (légèrement à côté)
   - Scope sniper réaliste avec cercle et traits
   - Indicateurs de dégâts au-dessus des joueurs
   - Chèvres sur rollers low-poly
   - Ferme inaccessible au loin
   - Enclos carré avec clôtures
   - Explosion réaliste particules
   - Sons moteur réalistes
   - Mouvements fluides (lerp amélioré)
   - Balles plus rapides
*/

const socket = io();

// UI refs
const menu = document.getElementById('menu');
const goatPreview = document.getElementById('goatPreview');
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
const crosshair = document.getElementById('crosshair');
const sniperScope = document.getElementById('sniperScope');
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
let hp = 100;
let kills = 0;
let isJumping = false;
let jumpVelocity = 0;
let powerUps = [];
let weaponPowerUps = [];
let haybales = [];
let isCrouching = false;
let currentWeapon = 'pistol';
let ammo = { pistol: Infinity, ak47: 30, sniper: 5 };
let isReloading = false;
let canShoot = true;
let lastShot = 0;
let matchStartTime = null;
let previewScene, previewCamera, previewRenderer, previewGoat;

const MAP_SIZE = 600; // Grand enclos carré
const SPAWN_AREA = 150; // Zone spawn 150x150

const weaponStats = {
  pistol: { damage: 20, fireRate: 300, reloadTime: 800, magSize: 6, auto: false, speed: 3 },
  ak47: { damage: 20, fireRate: 100, reloadTime: 2000, magSize: 30, auto: true, speed: 2.5 },
  sniper: { damageBody: 30, damageHead: 80, fireRate: 1500, reloadTime: 2000, magSize: 1, auto: false, speed: 4 }
};

// Mobile controls
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let touchControls = {
  moveX: 0,
  moveY: 0,
  shoot: false,
  aim: false,
  jump: false,
  reload: false
};

// Audio
let audioCtx;
let motorOsc = null;
let motorGain = null;
let noiseBuffer = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Créer noise buffer pour moteur réaliste
    const bufferSize = audioCtx.sampleRate * 2;
    noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }
}

function startMotorSound() {
  if (!audioCtx) initAudio();
  if (motorOsc) return;
  
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = engineSound === 'sport' ? 200 : engineSound === 'diesel' ? 100 : 300;
  
  motorGain = audioCtx.createGain();
  motorGain.gain.value = 0;
  
  noise.connect(noiseFilter);
  noiseFilter.connect(motorGain);
  motorGain.connect(audioCtx.destination);
  noise.start();
  
  motorOsc = { source: noise, filter: noiseFilter };
}

function updateMotorSound(speed) {
  if (!motorGain || !motorOsc) return;
  const targetGain = speed > 0.1 ? Math.min(0.08, speed * 0.2) : 0;
  motorGain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.1);
  
  const baseFreq = engineSound === 'sport' ? 200 : engineSound === 'diesel' ? 100 : 300;
  motorOsc.filter.frequency.linearRampToValueAtTime(
    baseFreq + speed * 300 + Math.sin(Date.now() * 0.01) * 20,
    audioCtx.currentTime + 0.1
  );
}

function playShootSound(weapon) {
  if (!audioCtx) initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  if (weapon === 'pistol') {
    osc.frequency.value = 180;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (weapon === 'ak47') {
    osc.frequency.value = 140;
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.stop(audioCtx.currentTime + 0.08);
  } else {
    osc.frequency.value = 80;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.stop(audioCtx.currentTime + 0.4);
  }
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
}

function playReloadSound() {
  if (!audioCtx) initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 400;
  osc.type = 'square';
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

function playExplosionSound() {
  if (!audioCtx) initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 40;
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.6);
}

// Three.js main scene
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 150, MAP_SIZE * 0.9);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 25);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dl = new THREE.DirectionalLight(0xffffff, 0.8);
dl.position.set(150, 200, 150);
dl.castShadow = true;
dl.shadow.mapSize.width = 2048;
dl.shadow.mapSize.height = 2048;
dl.shadow.camera.left = -MAP_SIZE/2;
dl.shadow.camera.right = MAP_SIZE/2;
dl.shadow.camera.top = MAP_SIZE/2;
dl.shadow.camera.bottom = -MAP_SIZE/2;
scene.add(dl);

// Ground
const groundTex = new THREE.TextureLoader().load('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzNhYTA0NyIvPjwvc3ZnPg==');
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(300, 300);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2),
  new THREE.MeshLambertMaterial({ map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Enclos carré avec clôtures
function createFence(x, z, width, depth) {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
  
  const numPosts = Math.floor((width > depth ? width : depth) / 5);
  for (let i = 0; i <= numPosts; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), woodMat);
    const offset = (i / numPosts - 0.5) * (width > depth ? width : depth);
    if (width > depth) {
      post.position.set(offset, 2, 0);
    } else {
      post.position.set(0, 2, offset);
    }
    post.castShadow = true;
    group.add(post);
  }
  
  for (let h = 0; h < 3; h++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(width > depth ? width : 0.3, 0.25, width > depth ? 0.3 : depth),
      woodMat
    );
    plank.position.y = 1.2 + h;
    plank.castShadow = true;
    group.add(plank);
  }
  
  group.position.set(x, 0, z);
  group.userData.isFence = true;
  scene.add(group);
  return group;
}

// Clôtures formant un carré
createFence(0, MAP_SIZE/2, MAP_SIZE, 3);
createFence(0, -MAP_SIZE/2, MAP_SIZE, 3);
createFence(MAP_SIZE/2, 0, 3, MAP_SIZE);
createFence(-MAP_SIZE/2, 0, 3, MAP_SIZE);

// Bottes de foin low-poly
function createHaybale(x, z) {
  const group = new THREE.Group();
  const hayMat = new THREE.MeshLambertMaterial({ color: 0xdaa520 });
  
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 6), hayMat);
  body.position.y = 1.1;
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x654321 });
  for (let i = -0.6; i <= 0.6; i += 0.6) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 4, 8), ropeMat);
    rope.position.set(i * 2, 1.1, 0);
    rope.rotation.y = Math.PI / 2;
    group.add(rope);
  }
  
  group.position.set(x, 0, z);
  group.userData.isHaybale = true;
  scene.add(group);
  haybales.push(group);
}

for (let i = 0; i < 50; i++) {
  createHaybale(
    (Math.random() - 0.5) * (MAP_SIZE - 50),
    (Math.random() - 0.5) * (MAP_SIZE - 50)
  );
}

// Montagnes au loin
function createMountain(x, z, scale) {
  const geo = new THREE.ConeGeometry(30 * scale, 60 * scale, 6);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
  const mountain = new THREE.Mesh(geo, mat);
  mountain.position.set(x, 30 * scale, z);
  mountain.receiveShadow = true;
  scene.add(mountain);
}

createMountain(-MAP_SIZE * 0.9, -MAP_SIZE * 0.9, 2.5);
createMountain(MAP_SIZE * 0.8, -MAP_SIZE, 2);
createMountain(-MAP_SIZE * 0.7, MAP_SIZE * 0.8, 1.8);
createMountain(MAP_SIZE, MAP_SIZE * 0.7, 2.3);

// Ferme au loin (inaccessible)
function createFarm() {
  const group = new THREE.Group();
  
  const barn = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 25),
    new THREE.MeshLambertMaterial({ color: 0x8b0000 })
  );
  barn.position.y = 6;
  barn.castShadow = true;
  group.add(barn);
  
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(16, 8, 4),
    new THREE.MeshLambertMaterial({ color: 0x654321 })
  );
  roof.position.y = 16;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  
  const silo = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 20, 8),
    new THREE.MeshLambertMaterial({ color: 0xcccccc })
  );
  silo.position.set(18, 10, 0);
  silo.castShadow = true;
  group.add(silo);
  
  const siloTop = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 5, 8),
    new THREE.MeshLambertMaterial({ color: 0x333333 })
  );
  siloTop.position.set(18, 22.5, 0);
  group.add(siloTop);
  
  group.position.set(MAP_SIZE * 0.6, 0, MAP_SIZE * 0.6);
  scene.add(group);
}

createFarm();

// Goat sur rollers
function makeGoatMesh(color = '#ff9966') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3.2), bodyMat);
  body.position.set(0, 1.2, 0);
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 1.1), bodyMat);
  head.position.set(0, 1.6, 1.8);
  head.castShadow = true;
  group.add(head);

  const hornMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), hornMat);
  hornL.position.set(-0.25, 2.05, 2.25);
  hornL.rotation.set(-0.6, 0, -0.5);
  group.add(hornL);
  const hornR = hornL.clone();
  hornR.position.set(0.25, 2.05, 2.25);
  hornR.rotation.set(-0.6, 0, 0.5);
  group.add(hornR);

  // Rollers (roues low-poly)
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const rollerPositions = [[-.7,0.3,-1],[.7,0.3,-1],[-.7,0.3,1],[.7,0.3,1]];
  rollerPositions.forEach(o => {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8), rollerMat);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(o[0], o[1], o[2]);
    roller.castShadow = true;
    group.add(roller);
  });

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.6), bodyMat);
  tail.position.set(0, 1.4, -1.75);
  tail.rotation.x = 0.6;
  group.add(tail);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
  eyeL.position.set(-0.18, 1.65, 2.15);
  const eyeR = eyeL.clone();
  eyeR.position.set(0.18, 1.65, 2.15);
  group.add(eyeL, eyeR);

  return group;
}

// Preview 3D dans le menu
function initPreview() {
  previewRenderer = new THREE.WebGLRenderer({ canvas: goatPreview, antialias: true, alpha: true });
  previewRenderer.setSize(500, window.innerHeight);
  previewScene = new THREE.Scene();
  
  previewCamera = new THREE.PerspectiveCamera(50, 500 / window.innerHeight, 0.1, 100);
  previewCamera.position.set(5, 3, 8);
  previewCamera.lookAt(0, 1, 0);
  
  const previewLight = new THREE.DirectionalLight(0xffffff, 1);
  previewLight.position.set(5, 10, 5);
  previewScene.add(previewLight);
  previewScene.add(new THREE.AmbientLight(0xffffff, 0.5));
  
  previewGoat = makeGoatMesh('#ff9966');
  previewGoat.position.y = 0;
  previewScene.add(previewGoat);
  
  function animatePreview() {
    requestAnimationFrame(animatePreview);
    if (previewGoat) previewGoat.rotation.y += 0.01;
    previewRenderer.render(previewScene, previewCamera);
  }
  animatePreview();
}

createColor.addEventListener('input', (e) => {
  if (previewGoat) {
    previewGoat.traverse(child => {
      if (child.isMesh && child.material.color) {
        child.material.color.set(e.target.value);
      }
    });
  }
});

initPreview();

// Armes
function makeGunMesh(type) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
  
  if (type === 'pistol') {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), mat);
    barrel.position.set(0, -0.1, -0.35);
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.12), mat);
    grip.position.set(0, -0.26, 0);
    g.add(grip);
  } else if (type === 'ak47') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.3), mat);
    body.position.set(0, -0.1, -0.65);
    g.add(body);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.2), mat);
    mag.position.set(0, -0.35, -0.3);
    g.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), mat);
    stock.position.set(0, -0.05, 0.35);
    g.add(stock);
  } else {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.8, 8), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.05, -0.9);
    g.add(barrel);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), mat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.08, -0.4);
    g.add(scope);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.7), new THREE.MeshStandardMaterial({ color: 0x654321 }));
    stock.position.set(0, -0.1, 0.4);
    g.add(stock);
  }
  
  return g;
}

function spawnLocal(name, color) {
  const mesh = makeGoatMesh(color);
  mesh.position.set(
    (Math.random() - 0.5) * SPAWN_AREA,
    0.5,
    (Math.random() - 0.5) * SPAWN_AREA
  );
  scene.add(mesh);
  localPlayer = { id: socket.id, name, color, mesh, hp: 100, velocity: new THREE.Vector3() };
  players[socket.id] = { name, color, mesh, hp: 100 };
  
  gunMesh = makeGunMesh('pistol');
  camera.add(gunMesh);
  gunMesh.position.set(0.3, -0.3, -0.5);
  gunMesh.visible = false;
  
  hp = 100;
  currentWeapon = 'pistol';
  initAudio();
  startMotorSound();
}

function spawnRemote(id, name, color, x, z) {
  if (players[id]) return;
  const mesh = makeGoatMesh(color);
  mesh.position.set(x || 0, 0.5, z || 0);
  scene.add(mesh);
  players[id] = { name, color, mesh, hp: 100 };
}

function spawnAI(count) {
  for (let i = 0; i < count; i++) {
    const id = 'AI_' + Date.now().toString(36) + '_' + i;
    const mesh = makeGoatMesh('#c95a3c');
    mesh.position.set(
      (Math.random()-0.5)*(MAP_SIZE-60),
      0.5,
      (Math.random()-0.5)*(MAP_SIZE-60)
    );
    scene.add(mesh);
    aiList.push({ id, mesh, hp: 100, lastFire: 0, lastMove: 0, weapon: 'pistol' });
  }
}

// Power-ups armes
function spawnWeaponPowerUp(x, z, weapon) {
  let mesh;
  if (weapon === 'ak47') {
    mesh = makeGunMesh('ak47');
    mesh.scale.set(2.5, 2.5, 2.5);
  } else {
    mesh = makeGunMesh('sniper');
    mesh.scale.set(2.5, 2.5, 2.5);
  }
  mesh.position.set(x, 1.8, z);
  scene.add(mesh);
  weaponPowerUps.push({ mesh, weapon, time: Date.now() });
}

for (let i = 0; i < 4; i++) {
  spawnWeaponPowerUp(
    (Math.random()-0.5)*(MAP_SIZE-60),
    (Math.random()-0.5)*(MAP_SIZE-60),
    Math.random() > 0.5 ? 'ak47' : 'sniper'
  );
}

function spawnBullet(x, y, z, dirVec, ownerId, weapon) {
  const stats = weaponStats[weapon];
  const bGeo = new THREE.SphereGeometry(weapon === 'sniper' ? 0.25 : 0.15, 8, 8);
  const bMat = new THREE.MeshBasicMaterial({ 
    color: weapon === 'sniper' ? 0xff0000 : weapon === 'ak47' ? 0xffaa00 : 0xffdd33 
  });
  const b = new THREE.Mesh(bGeo, bMat);
  b.position.set(x, y, z);
  b.userData = { 
    dir: dirVec.clone().normalize(), 
    ownerId, 
    weapon,
    speed: stats.speed
  };
  scene.add(b);
  bullets.push(b);
}

function spawnShell(x, y, z) {
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.9 })
  );
  shell.position.set(x, y, z);
  shell.userData.vel = new THREE.Vector3(
    (Math.random()-0.5)*0.25,
    Math.random()*0.35 + 0.25,
    (Math.random()-0.5)*0.25
  );
  shell.rotation.set(Math.random(), Math.random(), Math.random());
  scene.add(shell);
  
  const anim = () => {
    if (!shell.parent) return;
    shell.position.add(shell.userData.vel);
    shell.userData.vel.y -= 0.012;
    shell.rotation.x += 0.12;
    shell.rotation.z += 0.06;
    if (shell.position.y > 0.1) {
      requestAnimationFrame(anim);
    } else {
      setTimeout(() => scene.remove(shell), 4000);
    }
  };
  anim();
}

// Explosion réaliste avec particules
function createExplosion(x, y, z) {
  playExplosionSound();
  
  // Sphère d'explosion
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff6600 })
  );
  sphere.position.set(x, y, z);
  scene.add(sphere);
  
  let scale = 0.1;
  const expandSphere = () => {
    scale += 0.3;
    sphere.scale.set(scale, scale, scale);
    sphere.material.opacity = 1 - (scale / 10);
    sphere.material.transparent = true;
    if (scale < 10) {
      requestAnimationFrame(expandSphere);
    } else {
      scene.remove(sphere);
    }
  };
  expandSphere();
  
  // Particules
  for (let i = 0; i < 30; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff6600 : 0x000000 })
    );
    p.position.set(x, y, z);
    p.userData.vel = new THREE.Vector3(
      (Math.random()-0.5)*3,
      Math.random()*3,
      (Math.random()-0.5)*3
    );
    scene.add(p);
    
    const animParticle = () => {
      if (p.parent) {
        p.position.add(p.userData.vel);
        p.userData.vel.y -= 0.08;
        p.userData.vel.multiplyScalar(0.95);
        if (p.position.y > 0.1) {
          requestAnimationFrame(animParticle);
        } else {
          scene.remove(p);
        }
      }
    };
    animParticle();
  }
}

// Indicateur de dégâts
function showDamageIndicator(damage, x, y, z) {
  const div = document.createElement('div');
  div.className = 'damage-indicator';
  div.textContent = `-${damage}%`;
  document.body.appendChild(div);
  
  const vector = new THREE.Vector3(x, y + 2, z);
  vector.project(camera);
  
  const screenX = (vector.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-vector.y * 0.5 + 0.5) * window.innerHeight;
  
  div.style.left = screenX + 'px';
  div.style.top = screenY + 'px';
  
  setTimeout(() => div.remove(), 1000);
}

function checkCollision(pos, radius = 2) {
  for (const hay of haybales) {
    const dx = pos.x - hay.position.x;
    const dz = pos.z - hay.position.z;
    if (Math.abs(dx) < radius + 1.8 && Math.abs(dz) < radius + 1.8) {
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
      if (b.position.distanceTo(hay.position) < 2) {
        scene.remove(b);
        bullets.splice(i, 1);
        break;
      }
    }
    if (i >= bullets.length) continue;
    
    // Collision AI
    for (let j = aiList.length - 1; j >= 0; j--) {
      const ai = aiList[j];
      const dist = b.position.distanceTo(ai.mesh.position);
      if (dist < 1.5) {
        let damage;
        if (b.userData.weapon === 'sniper') {
          // Headshot detection (hauteur > 1.5)
          damage = b.position.y > ai.mesh.position.y + 1.5 ? 80 : 30;
        } else {
          damage = weaponStats[b.userData.weapon].damage;
        }
        
        ai.hp -= damage;
        showDamageIndicator(damage, ai.mesh.position.x, ai.mesh.position.y, ai.mesh.position.z);
        scene.remove(b);
        bullets.splice(i, 1);
        
        if (ai.hp <= 0) {
          createExplosion(ai.mesh.position.x, ai.mesh.position.y, ai.mesh.position.z);
          scene.remove(ai.mesh);
          aiList.splice(j, 1);
          if (b.userData.ownerId === socket.id) kills++;
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
      const dist = b.position.distanceTo(p.mesh.position);
      if (dist < 1.5) {
        let damage;
        if (b.userData.weapon === 'sniper') {
          damage = b.position.y > p.mesh.position.y + 1.5 ? 80 : 30;
        } else {
          damage = weaponStats[b.userData.weapon].damage;
        }
        
        scene.remove(b);
        bullets.splice(i, 1);
        
        if (pid === socket.id) {
          hp -= damage;
          showDamageIndicator(damage, localPlayer.mesh.position.x, localPlayer.mesh.position.y, localPlayer.mesh.position.z);
          if (hp <= 0) {
            createExplosion(localPlayer.mesh.position.x, localPlayer.mesh.position.y, localPlayer.mesh.position.z);
            alert('You died! Respawning...');
            localPlayer.mesh.position.set(
              (Math.random()-0.5)*SPAWN_AREA,
              0.5,
              (Math.random()-0.5)*SPAWN_AREA
            );
            hp = 100;
          }
        } else {
          p.hp -= damage;
          showDamageIndicator(damage, p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
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
    if (now - ai.lastMove < 100) return;
    
    let closestTarget = null;
    let closestDist = Infinity;
    
    for (const pid in players) {
      const p = players[pid];
      if (!p || !p.mesh) continue;
      const dist = ai.mesh.position.distanceTo(p.mesh.position);
      if (dist < closestDist && dist < 60) {
        closestDist = dist;
        closestTarget = p.mesh;
      }
    }
    
    aiList.forEach(otherAI => {
      if (otherAI.id === ai.id) return;
      const dist = ai.mesh.position.distanceTo(otherAI.mesh.position);
      if (dist < closestDist && dist < 50) {
        closestDist = dist;
        closestTarget = otherAI.mesh;
      }
    });
    
    if (closestTarget) {
      const dx = closestTarget.position.x - ai.mesh.position.x;
      const dz = closestTarget.position.z - ai.mesh.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      
      if (dist > 10 && dist < 60) {
        const newX = ai.mesh.position.x + (dx/dist) * 0.12;
        const newZ = ai.mesh.position.z + (dz/dist) * 0.12;
        if (!checkCollision(new THREE.Vector3(newX, 0, newZ), 1.5)) {
          ai.mesh.position.x = newX;
          ai.mesh.position.z = newZ;
          ai.mesh.lookAt(closestTarget.position);
        }
      }
      
      if (dist < 40 && now - ai.lastFire > 1800) {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        spawnBullet(ai.mesh.position.x, ai.mesh.position.y + 1.2, ai.mesh.position.z, dir, ai.id, ai.weapon);
        ai.lastFire = now;
      }
    }
    
    ai.lastMove = now;
  });
}

function checkPowerUpCollection() {
  if (!localPlayer || !localPlayer.mesh) return;
  
  for (let i = weaponPowerUps.length - 1; i >= 0; i--) {
    const wp = weaponPowerUps[i];
    if (localPlayer.mesh.position.distanceTo(wp.mesh.position) < 3) {
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
  weaponHUD.innerText = `${currentWeapon.toUpperCase()} | ${ammoText}`;
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
  from.y += isCrouching ? 1 : 1.4;
  
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
  
  if (gunMesh) {
    const origZ = gunMesh.position.z;
    gunMesh.position.z += 0.15;
    setTimeout(() => gunMesh.position.z = origZ, 60);
  }
  
  if (currentWeapon === 'sniper') {
    setTimeout(() => reload(), 300);
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
  if (!name) return alert('Choose a username');
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
      alert(res && res.error ? res.error : 'Creation error');
    }
  });
};

joinRoomBtn.onclick = () => {
  const name = createName.value.trim();
  const rid = joinRoomId.value.trim();
  if (!name) return alert('Choose a username');
  if (!rid) return alert('Enter room code');
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
      alert(res && res.error ? res.error : 'Cannot join');
    }
  });
};

inviteBtn.onclick = () => {
  const target = inviteName.value.trim();
  if (!target) return alert('Enter username to invite');
  socket.emit('invite', { targetName: target }, (res) => {
    if (res && res.ok) {
      appendChat('SYSTEM', `Invitation sent to ${target}`);
    } else {
      appendChat('SYSTEM', res && res.error ? res.error : 'Invite failed');
    }
  });
};

leaveBtn.onclick = () => {
  socket.emit('leave_room', {}, () => location.reload());
};

startGameBtn.onclick = () => {
  if (!amIHost) return alert('Only host can start');
  socket.emit('start_match', { aiCount: 12 });
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
socket.on('connect', () => console.log('Connected:', socket.id));

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
    div.textContent = `${p.name}${sid === socket.id ? ' (You)' : ''}${room.host === sid ? ' [HOST]' : ''}`;
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
  const accept = confirm(`${fromName} invites you to ${roomId}. Accept?`);
  socket.emit('invite_response', { fromName, roomId, accept });
});

socket.on('invite_response', ({ from, accept }) => {
  appendChat('SYSTEM', `${from} ${accept ? 'accepted' : 'declined'}`);
});

socket.on('lobby_chat', ({ name, text }) => appendChat(name, text));

socket.on('match_started', ({ IA }) => {
  console.log('Match started');
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
      aiList.push({ id: a.id, mesh, hp: 100, lastFire: 0, lastMove: 0, weapon: 'pistol' });
    });
  }
  
  appendChat('SYSTEM', 'Match started!');
});

socket.on('fire', ({ shooter, x, y, z, dir, weapon }) => {
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

// Game loop avec mouvements fluides
let lastFrameTime = Date.now();

function animate() {
  requestAnimationFrame(animate);
  const now = Date.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
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

    let speed = isCrouching ? 0.1 : 0.18;
    let actualSpeed = Math.abs(mv * speed);
    
    if (keys['shift'] && stamina > 0 && !isCrouching) {
      speed = 0.45;
      actualSpeed = Math.abs(mv * speed);
      stamina -= 0.6;
    } else {
      stamina = Math.min(100, stamina + 0.4);
    }
    
    updateMotorSound(actualSpeed);

    // Jump
    if (isJumping) {
      localPlayer.mesh.position.y += jumpVelocity;
      jumpVelocity -= 0.025;
      if (localPlayer.mesh.position.y <= 0.5) {
        localPlayer.mesh.position.y = 0.5;
        isJumping = false;
        jumpVelocity = 0;
      }
    }

    // Crouch
    if (isCrouching) {
      localPlayer.mesh.scale.y = THREE.MathUtils.lerp(localPlayer.mesh.scale.y, 0.6, 0.2);
      localPlayer.mesh.position.y = 0.35;
    } else {
      localPlayer.mesh.scale.y = THREE.MathUtils.lerp(localPlayer.mesh.scale.y, 1, 0.2);
      if (!isJumping) localPlayer.mesh.position.y = 0.5;
    }

    // Rotation fluide
    localPlayer.mesh.rotation.y += tr * 0.07;
    
    // Velocity-based movement (fluide)
    const targetVelX = Math.sin(localPlayer.mesh.rotation.y) * mv * speed;
    const targetVelZ = Math.cos(localPlayer.mesh.rotation.y) * mv * speed;
    
    localPlayer.velocity.x = THREE.MathUtils.lerp(localPlayer.velocity.x, targetVelX, 0.3);
    localPlayer.velocity.z = THREE.MathUtils.lerp(localPlayer.velocity.z, targetVelZ, 0.3);
    
    const newX = localPlayer.mesh.position.x + localPlayer.velocity.x;
    const newZ = localPlayer.mesh.position.z + localPlayer.velocity.z;
    
    if (!checkCollision(new THREE.Vector3(newX, 0, newZ), 1.5)) {
      localPlayer.mesh.position.x = newX;
      localPlayer.mesh.position.z = newZ;
    } else {
      localPlayer.velocity.x *= 0.5;
      localPlayer.velocity.z *= 0.5;
    }

    // Caméra style Fortnite (légèrement à côté)
    if (precisionMode) {
      if (currentWeapon === 'sniper') {
        // Scope sniper
        camera.fov = THREE.MathUtils.lerp(camera.fov, 30, 0.2);
        camera.updateProjectionMatrix();
        sniperScope.classList.add('active');
        crosshair.style.display = 'none';
        
        const offset = new THREE.Vector3(
          Math.sin(localPlayer.mesh.rotation.y + Math.PI/2) * 2,
          0,
          Math.cos(localPlayer.mesh.rotation.y + Math.PI/2) * 2
        );
        
        const headPos = localPlayer.mesh.position.clone();
        headPos.y += 3.2;
        headPos.add(offset);
        headPos.x -= Math.sin(localPlayer.mesh.rotation.y) * 1.5;
        headPos.z -= Math.cos(localPlayer.mesh.rotation.y) * 1.5;
        
        camera.position.lerp(headPos, 0.25);
        camera.lookAt(
          localPlayer.mesh.position.x + Math.sin(localPlayer.mesh.rotation.y) * 150,
          localPlayer.mesh.position.y + 1.5,
          localPlayer.mesh.position.z + Math.cos(localPlayer.mesh.rotation.y) * 150
        );
        
        if (gunMesh) {
          gunMesh.visible = true;
          gunMesh.position.x = THREE.MathUtils.lerp(gunMesh.position.x, 0.6, 0.2);
          gunMesh.position.y = THREE.MathUtils.lerp(gunMesh.position.y, -0.1, 0.2);
        }
      } else {
        // Visée normale style Fortnite
        camera.fov = THREE.MathUtils.lerp(camera.fov, 55, 0.2);
        camera.updateProjectionMatrix();
        sniperScope.classList.remove('active');
        crosshair.style.display = 'block';
        
        const offset = new THREE.Vector3(
          Math.sin(localPlayer.mesh.rotation.y + Math.PI/2) * 1.2,
          0,
          Math.cos(localPlayer.mesh.rotation.y + Math.PI/2) * 1.2
        );
        
        const headPos = localPlayer.mesh.position.clone();
        headPos.y += 2.8;
        headPos.add(offset);
        headPos.x -= Math.sin(localPlayer.mesh.rotation.y) * 2.5;
        headPos.z -= Math.cos(localPlayer.mesh.rotation.y) * 2.5;
        
        camera.position.lerp(headPos, 0.25);
        camera.lookAt(
          localPlayer.mesh.position.x + Math.sin(localPlayer.mesh.rotation.y) * 60,
          localPlayer.mesh.position.y + 1.2,
          localPlayer.mesh.position.z + Math.cos(localPlayer.mesh.rotation.y) * 60
        );
        
        if (gunMesh) gunMesh.visible = true;
      }
      localPlayer.mesh.visible = true;
    } else {
      // Vue normale 3ème personne
      camera.fov = THREE.MathUtils.lerp(camera.fov, 75, 0.15);
      camera.updateProjectionMatrix();
      sniperScope.classList.remove('active');
      crosshair.style.display = 'block';
      
      const targetCamPos = new THREE.Vector3(
        localPlayer.mesh.position.x - Math.sin(localPlayer.mesh.rotation.y) * 9,
        isCrouching ? 4.5 : 6.5,
        localPlayer.mesh.position.z - Math.cos(localPlayer.mesh.rotation.y) * 9
      );
      
      camera.position.lerp(targetCamPos, 0.15);
      camera.lookAt(localPlayer.mesh.position);
      
      if (gunMesh) gunMesh.visible = false;
      localPlayer.mesh.visible = true;
    }

    socket.emit('player_state', {
      x: localPlayer.mesh.position.x,
      z: localPlayer.mesh.position.z,
      angle: localPlayer.mesh.rotation.y
    });

    const kmh = Math.round(actualSpeed * 4200);
    speedHUD.innerText = `${kmh} km/h | HP: ${hp}% | Kills: ${kills}`;
  }

  // Timer
  if (matchStartTime) {
    const elapsed = Math.floor((now - matchStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    timerHUD.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Power-ups rotation
  weaponPowerUps.forEach(wp => {
    wp.mesh.rotation.y += 0.035;
    wp.mesh.position.y = 1.8 + Math.sin(now * 0.004) * 0.5;
  });

  // Bullets rapides
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.addScaledVector(b.userData.dir, b.userData.speed);
    
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
  
  if (key === 'e' || e.code === 'Space') {
    if (weaponStats[currentWeapon].auto) {
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
  
  if (key === 'h' || key === 'c') {
    precisionMode = true;
  }
  
  if (key === 'v' && !isJumping && localPlayer && !isCrouching) {
    isJumping = true;
    jumpVelocity = 0.3;
  }
  
  if (key === 'control') {
    isCrouching = true;
  }
  
  if (key === 'r') {
    reload();
  }
  
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
  
  if (previewRenderer && previewCamera) {
    previewCamera.aspect = 500 / window.innerHeight;
    previewCamera.updateProjectionMatrix();
    previewRenderer.setSize(500, window.innerHeight);
  }
});

backToMenu.addEventListener('click', () => location.reload());
