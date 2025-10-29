// main.js - Goat Battle Royale 3D prototype

// ---- UI ----
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

// ---- Variables ----
let socket = null;
let roomId = null;
let playerId = null;
let players = {};
let projectiles = [];
let localPlayer = {
  x: 400, y: 300, angle: 0, name: 'Chèvre', color: '#ff9966', lives: 3
};
let keys = {};
let controlMode = 'wasd';

// ---- Connexion Socket.IO ----
socket = io('https://goatbattleroyal-simulator-production.up.railway.app');

socket.on('connect', () => {
  console.log('Connecté au serveur, id:', socket.id);
  playerId = socket.id;
});

// ---- Écoute des événements serveur ----
socket.on('room_update', (room) => {
  players = room.players;
  // TODO : mettre à jour affichage des joueurs
});

socket.on('match_started', (data) => {
  console.log('La partie commence !', data);
  menu.style.display = 'none';
  // TODO : lancer le rendu 3D
});

socket.on('you_died', () => {
  console.log('Vous êtes mort !');
  endScreen.style.display = 'block';
  endText.innerText = 'Vous êtes mort ! Retour au menu.';
});

// ---- Boutons menu ----
startBtn.onclick = () => {
  const name = pseudoInput.value.trim() || 'Chèvre';
  const color = colorInput.value || '#ff9966';
  controlMode = controlsSelect.value || 'wasd';

  localPlayer.name = name;
  localPlayer.color = color;

  // Créer une salle
  socket.emit('create_room', { name, color }, (res) => {
    if (res.ok) {
      roomId = res.roomId;
      console.log('Salle créée ! Room ID :', roomId);
      menu.style.display = 'none';
      startGame();
    } else {
      console.log('Erreur création salle :', res.error);
    }
  });
});

backToMenu.onclick = () => {
  endScreen.style.display = 'none';
  menu.style.display = 'block';
  // Reset joueur
  localPlayer.lives = 3;
};

// ---- Gestion touches ----
document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// ---- Fonction principale du jeu ----
function startGame() {
  // Exemple minimal : mettre à jour la position et envoyer au serveur
  function gameLoop() {
    handleInput();
    sendPlayerState();
    render();
    requestAnimationFrame(gameLoop);
  }
  gameLoop();
}

// ---- Déplacement joueur ----
function handleInput() {
  const speed = keys['r'] ? 4 : 2; // R pour sprint
  const jump = keys[' ']; // SPACE pour sauter
  let forward = 0, turn = 0;

  if (controlMode === 'wasd') {
    forward = (keys['w'] ? 1 : 0) - (keys['s'] ? 1 : 0);
    turn = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
  } else {
    forward = (keys['z'] ? 1 : 0) - (keys['s'] ? 1 : 0);
    turn = (keys['q'] ? 1 : 0) - (keys['d'] ? 1 : 0);
  }

  localPlayer.angle += turn * 0.05;
  localPlayer.x += Math.cos(localPlayer.angle) * forward * speed;
  localPlayer.y += Math.sin(localPlayer.angle) * forward * speed;

  if (keys['f']) { // tirer
    socket.emit('fire', { x: localPlayer.x, y: localPlayer.y });
  }
}

// ---- Envoyer état joueur ----
function sendPlayerState() {
  socket.emit('player_state', {
    x: localPlayer.x,
    y: localPlayer.y,
    angle: localPlayer.angle,
    name: localPlayer.name,
    color: localPlayer.color
  });
}

// ---- Rendu minimal ----
function render() {
  ctx3d.width = canvas.clientWidth;
  ctx3d.height = canvas.clientHeight;
  const ctx = ctx3d.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dessiner tous les joueurs
  for (const id in players) {
    const p = players[id];
    ctx.fillStyle = p.color || '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI*2);
    ctx.fill();

    // pseudo
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.fillText(p.name, p.x - 16, p.y - 20);
  }

  // Dessiner projectiles
  projectiles.forEach(proj => {
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 5, 0, Math.PI*2);
    ctx.fill();
  });
}
