// main.js - Goat Battle Royale 🐐

// --- Connexion au serveur ---
const socket = io('https://goatbattleroyal-simulator-production.up.railway.app');

// --- Sélection UI ---
const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const inviteBtn = document.getElementById('inviteBtn');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const livesSpan = document.getElementById('lives');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');
const canvas = document.getElementById('canvas3d');
const ctx = canvas.getContext('2d');

let players = {};
let projectiles = [];
let explosions = [];
let obstacles = [];
let localPlayer = { x: 400, y: 300, angle: 0, name: 'Chèvre', color: '#ff9966', lives: 3 };
let controlMode = 'wasd';
let keys = {};
let roomId = null;

// --- Effet sonore léger ---
const explosionSound = new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_cdb9d1e66c.mp3?filename=small-explosion-6821.mp3");

// --- Gestion du clavier ---
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- Bouton Jouer ---
startBtn.onclick = () => {
  const name = pseudoInput.value.trim() || 'Chèvre';
  const color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value;

  localPlayer.name = name;
  localPlayer.color = color;

  socket.emit('create_room', { name, color }, res => {
    if (res.ok) {
      roomId = res.roomId;
      menu.style.display = 'none';
      initObstacles();
      gameLoop();
    } else {
      alert('Erreur : ' + res.error);
    }
  });
};

// --- Bouton Inviter ---
inviteBtn.onclick = () => {
  if (!roomId) {
    alert("Crée une partie d'abord !");
    return;
  }
  navigator.clipboard.writeText(window.location.href + '?room=' + roomId);
  alert('Lien copié ! Envoie-le à ton ami 🐐');
};

// --- Retour au menu ---
backToMenu.onclick = () => {
  endScreen.style.display = 'none';
  menu.style.display = 'flex';
  localPlayer.lives = 3;
};

// --- Événements serveur ---
socket.on('connect', () => console.log('✅ Connecté au serveur'));
socket.on('room_update', room => { players = room.players; });
socket.on('match_started', () => console.log('🎮 Match commencé !'));
socket.on('you_died', () => showEnd("💀 Tu as explosé !"));
socket.on('match_ended', winner => showEnd(`🏆 ${winner} est le Top 1 !`));

// --- Explosion animée ---
function createExplosion(x, y) {
  explosions.push({ x, y, r: 10, alpha: 1 });
  explosionSound.currentTime = 0;
  explosionSound.play();
}

// --- Créer obstacles (bots de foin) ---
function initObstacles() {
  obstacles = [];
  for (let i = 0; i < 8; i++) {
    obstacles.push({
      x: 150 + Math.random() * 500,
      y: 150 + Math.random() * 300,
      w: 50,
      h: 50
    });
  }
}

// --- Mouvement du joueur ---
function handleInput() {
  let speed = 2.2;
  const fwd = (keys['w'] || keys['z']) ? 1 : (keys['s'] ? -1 : 0);
  const turn = (keys['d'] ? 1 : 0) - (keys['a'] || keys['q'] ? 1 : 0);

  localPlayer.angle += turn * 0.05;
  const newX = localPlayer.x + Math.cos(localPlayer.angle) * fwd * speed;
  const newY = localPlayer.y + Math.sin(localPlayer.angle) * fwd * speed;

  // Collision avec les bords de l'enclos
  if (newX > 50 && newX < 750 && newY > 50 && newY < 550) {
    localPlayer.x = newX;
    localPlayer.y = newY;
  }

  // Tir
  if (keys['f']) {
    socket.emit('fire', { x: localPlayer.x, y: localPlayer.y });
  }

  socket.emit('player_state', localPlayer);
}

// --- Boucle principale ---
function gameLoop() {
  handleInput();
  render();
  requestAnimationFrame(gameLoop);
}

// --- Affichage ---
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // fond coloré doux
  const t = Date.now() * 0.0001;
  ctx.fillStyle = `hsl(${(t * 360) % 360}, 50%, 70%)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Enclos
  ctx.strokeStyle = '#654321';
  ctx.lineWidth = 10;
  ctx.strokeRect(40, 40, 720, 520);

  // Obstacles
  ctx.fillStyle = '#c2a34a';
  for (let o of obstacles) ctx.fillRect(o.x, o.y, o.w, o.h);

  // Joueurs
  for (const id in players) {
    const p = players[id];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.fillRect(-15, -15, 30, 30);
    ctx.restore();

    ctx.fillStyle = 'black';
    ctx.font = '14px Arial';
    ctx.fillText(p.name, p.x - 20, p.y - 25);
  }

  // Explosion
  explosions.forEach((e, i) => {
    ctx.fillStyle = `rgba(255,150,0,${e.alpha})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    e.r += 3;
    e.alpha -= 0.05;
    if (e.alpha <= 0) explosions.splice(i, 1);
  });

  // Vies
  livesSpan.textContent = localPlayer.lives;
}

// --- Écran de fin ---
function showEnd(text) {
  endText.innerText = text;
  endScreen.style.display = 'flex';
  createExplosion(localPlayer.x, localPlayer.y);
}
