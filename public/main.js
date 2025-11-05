// main.js — Goat Battle Royale 🐐 FINAL EDITION
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161/build/three.module.js';

// --- Connexion au serveur ---
const socket = io();

// --- Éléments UI ---
const menu = document.getElementById('menu');
const lobby = document.getElementById('lobby');
const startBtn = document.getElementById('startBtn');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const pseudoInput = document.getElementById('pseudo');
const roomInput = document.getElementById('roomInput');
const chatInput = document.getElementById('chatInput');
const chatBox = document.getElementById('chatBox');

// --- Variables globales ---
let scene, camera, renderer;
let localPlayer, goats = {};
let bullets = [];
let isHost = false;
let roomId = null;
let keys = {};
let stamina = 10;
let speed = 0;

// --- Sons ---
const shootSound = new Audio("https://cdn.pixabay.com/download/audio/2021/09/20/audio_c2a28ef98b.mp3");
const sprintSound = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8a2f9651f.mp3");

// --- Initialisation Three.js ---
function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  scene.add(light);

  const groundGeo = new THREE.PlaneGeometry(2000, 2000);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 10, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
}

// --- Créer le joueur ---
function createPlayer(name, color) {
  const geometry = new THREE.BoxGeometry(2, 2, 4);
  const material = new THREE.MeshStandardMaterial({ color });
  const goat = new THREE.Mesh(geometry, material);
  goat.position.set(Math.random() * 100 - 50, 1, Math.random() * 100 - 50);
  goat.name = name;
  scene.add(goat);
  return goat;
}

// --- Boucle de rendu ---
function animate() {
  requestAnimationFrame(animate);

  // Gestion des touches
  let moveSpeed = 0.4;
  if (keys['f'] && stamina > 0) {
    moveSpeed = 1.2;
    stamina -= 0.05;
    sprintSound.play();
  } else if (stamina < 10) stamina += 0.02;

  const forward = keys['z'] || keys['w'] || keys['arrowup'];
  const back = keys['s'] || keys['arrowdown'];
  const left = keys['q'] || keys['a'] || keys['arrowleft'];
  const right = keys['d'] || keys['arrowright'];

  if (localPlayer) {
    if (forward) localPlayer.position.z -= moveSpeed;
    if (back) localPlayer.position.z += moveSpeed;
    if (left) localPlayer.position.x -= moveSpeed;
    if (right) localPlayer.position.x += moveSpeed;
    camera.position.lerp(
      new THREE.Vector3(localPlayer.position.x, localPlayer.position.y + 10, localPlayer.position.z + 20),
      0.1
    );
    camera.lookAt(localPlayer.position);
  }

  // Déplacement des balles
  bullets.forEach((b, i) => {
    b.position.add(b.userData.velocity);
    if (b.position.length() > 1000) {
      scene.remove(b);
      bullets.splice(i, 1);
    }
  });

  renderer.render(scene, camera);
}

// --- Tir ---
function shoot() {
  if (!localPlayer) return;
  shootSound.currentTime = 0;
  shootSound.play();
  const bulletGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const bullet = new THREE.Mesh(bulletGeo, bulletMat);
  bullet.position.copy(localPlayer.position);
  bullet.userData.velocity = new THREE.Vector3(0, 0, -2).applyEuler(localPlayer.rotation);
  scene.add(bullet);
  bullets.push(bullet);
  socket.emit('shoot', { roomId });
}

// --- Chat ---
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    socket.emit('chat_message', { roomId, msg: chatInput.value });
    chatInput.value = '';
  }
});

socket.on('chat_message', data => {
  const msg = document.createElement('div');
  msg.textContent = `${data.name}: ${data.msg}`;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// --- Connexion Socket.io ---
socket.on('connect', () => console.log('✅ Connecté au serveur'));
socket.on('room_joined', data => {
  roomId = data.roomId;
  isHost = data.isHost;
  menu.style.display = 'none';
  lobby.style.display = 'block';
});
socket.on('game_start', data => {
  lobby.style.display = 'none';
  init3D();
  localPlayer = createPlayer(data.name, data.color);
  animate();
});

// --- Création & rejoindre ---
createBtn.onclick = () => {
  const name = pseudoInput.value.trim() || "Chèvre";
  socket.emit('create_room', { name }, res => {
    if (res.ok) console.log('Salle créée', res.roomId);
  });
};

joinBtn.onclick = () => {
  const name = pseudoInput.value.trim() || "Chèvre";
  const room = roomInput.value.trim();
  socket.emit('join_room', { name, roomId: room }, res => {
    if (res.ok) console.log('Rejoint la salle', room);
  });
};

// --- Lancer la partie ---
startBtn.onclick = () => {
  if (!isHost) return alert("Seul l'hôte peut lancer !");
  socket.emit('start_game', { roomId });
};

// --- Touches ---
document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'g') shoot();
});
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
