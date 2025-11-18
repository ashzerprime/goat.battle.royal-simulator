/* main.js - VERSION CORRIGÉE */

// Attendre que THREE et socket soient chargés
function initGame() {
  const THREE = window.THREE;
  const socket = window.socket;
  
  if (!THREE) {
    console.error('THREE.js not loaded!');
    return;
  }
  
  if (!socket) {
    console.error('Socket.io not loaded!');
    alert('Erreur de connexion au serveur. Veuillez rafraîchir la page.');
    return;
  }

  console.log('✅ Game initialization started');
  console.log('Socket ID:', socket.id);
  console.log('Socket connected:', socket.connected);

  // UI refs
  const menu = document.getElementById('menu');
  const goatPreview = document.getElementById('goatPreview');
  const lobbyUi = document.getElementById('lobby');
  const chatLog = document.getElementById('chatLog');
  const chatInput = document.getElementById('chatInput');
  const mobileControls = document.getElementById('mobileControls');

  // UI Elements
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
  const weaponHUD = document.getElementById('weaponHUD');
  const timerHUD = document.getElementById('timerHUD');
  const crosshair = document.getElementById('crosshair');
  const sniperScope = document.getElementById('sniperScope');
  const endScreen = document.getElementById('endScreen');
  const backToMenu = document.getElementById('backToMenu');
  const backToLobbyBtn = document.getElementById('backToLobbyBtn');
  const statsBody = document.getElementById('statsBody');
  const soundEnabledCheck = document.getElementById('soundEnabled');
  const motorSoundEnabledCheck = document.getElementById('motorSoundEnabled');
  const openSettings = document.getElementById('openSettings');
  const closeSettings = document.getElementById('closeSettings');
  const settingsModal = document.getElementById('settingsModal');

  // Settings buttons
  openSettings.onclick = () => {
    console.log('Opening settings...');
    settingsModal.classList.add('active');
  };

  closeSettings.onclick = () => {
    console.log('Closing settings...');
    settingsModal.classList.remove('active');
  };

  // Mobile elements
  const joystickContainer = document.getElementById('joystickContainer');
  const joystickStick = document.getElementById('joystickStick');
  const mobileShoot = document.getElementById('mobileShoot');
  const mobileAim = document.getElementById('mobileAim');
  const mobileJump = document.getElementById('mobileJump');
  const mobileReload = document.getElementById('mobileReload');

  // State
  let myName = null;
  let myColor = '#ff9966';
  let myRoom = null;
  let amIHost = false;
  let controlMode = 'zqsd';
  let isMobileMode = false;
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
  let deaths = 0;
  let isJumping = false;
  let jumpVelocity = 0;
  let weaponPowerUps = [];
  let haybales = [];
  let isCrouching = false;
  let currentWeapon = 'pistol';
  let ammo = { pistol: Infinity, ak47: 30, sniper: 1 };
  let isReloading = false;
  let canShoot = true;
  let lastShot = 0;
  let matchStartTime = null;
  let previewScene, previewCamera, previewRenderer, previewGoat;
  let joystickActive = false;
  let joystickVector = { x: 0, y: 0 };
  let touchControls = { shoot: false, aim: false, jump: false, reload: false };

  const MAP_SIZE = 600;
  const SPAWN_AREA = 150;

  const weaponStats = {
    pistol: { damage: 20, fireRate: 300, reloadTime: 800, magSize: 6, auto: false, speed: 3 },
    ak47: { damage: 15, fireRate: 100, reloadTime: 2000, magSize: 30, auto: true, speed: 2.5 },
    sniper: { damageBody: 30, damageHead: 80, fireRate: 1500, reloadTime: 2000, magSize: 1, auto: false, speed: 4 }
  };

  // Sounds
  let sounds = { pistol: null, ak47: null, sniper: null, reload: null, explosion: null, motor: null };
  let soundsEnabled = true;
  let motorSoundEnabled = true;

  soundEnabledCheck.onchange = () => { soundsEnabled = soundEnabledCheck.checked; };
  motorSoundEnabledCheck.onchange = () => { motorSoundEnabled = motorSoundEnabledCheck.checked; };

  function playSound(soundName) {
    if (!soundsEnabled || !sounds[soundName]) return;
    try {
      sounds[soundName].play();
    } catch(e) {}
  }

  // Three.js setup
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

  // Fence
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

  createFence(0, MAP_SIZE/2, MAP_SIZE, 3);
  createFence(0, -MAP_SIZE/2, MAP_SIZE, 3);
  createFence(MAP_SIZE/2, 0, 3, MAP_SIZE);
  createFence(-MAP_SIZE/2, 0, 3, MAP_SIZE);

  // Haybales
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

  // Mountains
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

  // Farm
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

  // Goat mesh
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

    // Weapon holder
    const weaponHolder = new THREE.Group();
    weaponHolder.position.set(0.8, 1.3, 0.5);
    weaponHolder.rotation.y = Math.PI / 6;
    group.add(weaponHolder);
    group.userData.weaponHolder = weaponHolder;

    return group;
  }

  // Preview
  function initPreview() {
    previewRenderer = new THREE.WebGLRenderer({ canvas: goatPreview, antialias: true, alpha: true });
    previewRenderer.setSize(500, 500);
    previewScene = new THREE.Scene();
    
    previewCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    previewCamera.position.set(5, 3, 8);
    previewCamera.lookAt(0, 1, 0);
    
    const previewLight = new THREE.DirectionalLight(0xffffff, 1);
    previewLight.position.set(5, 10, 5);
    previewScene.add(previewLight);
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    
    previewGoat = makeGoatMesh('#ff9966');
    previewGoat.position.y = 0;
    previewScene.add(previewGoat);
    
    console.log('✅ Preview initialized');
    
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

  // Weapon meshes and other functions...
  // (Le reste du code reste identique, je continue avec les fonctions importantes)

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

  // Network events
  createRoomBtn.onclick = () => {
    console.log('🔵 CREATE ROOM clicked');
    
    const name = createName.value.trim();
    if (!name) {
      alert('Choose a username');
      return;
    }
    
    myName = name;
    myColor = createColor.value || '#ff9966';
    controlMode = controlsSelect.value;
    isMobileMode = controlMode === 'mobile' || controlMode === 'mobile-touch';
    
    console.log('Sending create_room...');
    socket.emit('create_room', { name, color: myColor, mode: modeSelect.value }, (res) => {
      console.log('Response:', res);
      if (res && res.ok) {
        myRoom = res.roomId;
        amIHost = true;
        showLobby(res.roomId);
      } else {
        alert(res?.error || 'Creation error');
      }
    });
  };

  joinRoomBtn.onclick = () => {
    console.log('🔵 JOIN ROOM clicked');
    
    const name = createName.value.trim();
    const rid = joinRoomId.value.trim();
    
    if (!name) {
      alert('Choose a username');
      return;
    }
    if (!rid) {
      alert('Enter room code');
      return;
    }
    
    myName = name;
    myColor = createColor.value || '#ff9966';
    controlMode = controlsSelect.value;
    isMobileMode = controlMode === 'mobile' || controlMode === 'mobile-touch';
    
    console.log('Sending join_room...');
    socket.emit('join_room', { roomId: rid, name, color: myColor }, (res) => {
      console.log('Response:', res);
      if (res && res.ok) {
        myRoom = res.roomId;
        amIHost = false;
        showLobby(res.roomId);
      } else {
        alert(res?.error || 'Cannot join');
      }
    });
  };

  function showLobby(roomId) {
    console.log('📺 Showing lobby:', roomId);
    menu.style.display = 'none';
    lobbyUi.style.display = 'block';
    roomLabel.textContent = roomId;
    
    if (isMobileMode) {
      mobileControls.classList.add('active');
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // Socket events
  socket.on('joined_room', ({ roomId, isHost }) => {
    console.log('Joined room:', roomId);
    myRoom = roomId;
    amIHost = isHost;
    showLobby(roomId);
  });

  socket.on('room_update', (room) => {
    console.log('Room update:', room);
    playersList.innerHTML = '';
    roomLabel.textContent = room.roomId;
    
    for (const sid in room.players) {
      const p = room.players[sid];
      const div = document.createElement('div');
      div.textContent = `${p.name}${sid === socket.id ? ' (You)' : ''}${room.host === sid ? ' [HOST]' : ''}`;
      playersList.appendChild(div);
    }
  });

  // Game loop
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (previewRenderer && previewCamera) {
      previewRenderer.setSize(500, 500);
    }
  });

  console.log('✅ Game initialized successfully');
}

// Attendre que tout soit chargé
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initGame, 100);
  });
} else {
  setTimeout(initGame, 100);
}
