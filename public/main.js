// main.js - Goat Battle Royale 🐐 3D prototype

// ---- UI ----
const menu = document.getElementById('menu');
const lobbyMenu = document.getElementById('lobbyMenu');
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
const speedSpan = document.getElementById('speed');

// ---- Variables ----
let socket = io('https://goatbattleroyal-simulator-production.up.railway.app', { transports:['websocket'] });
let players = {};
let projectiles = [];
let explosions = [];
let obstacles = [];
let localPlayer = { x:400, y:300, angle:0, name:'Chèvre', color:'#ff9966', lives:3, kills:0, stamina:100, speed:0 };
let controlMode = 'wasd';
let keys = {};
let roomId = null;
let host = false;
let gameStarted = false;

// ---- Sons ----
const explosionSound = new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_cdb9d1e66c.mp3?filename=small-explosion-6821.mp3");

// ---- Clavier ----
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// ---- Menu ----
startBtn.onclick = () => {
    const name = pseudoInput.value.trim() || 'Chèvre';
    const color = colorInput.value || '#ff9966';
    controlMode = controlsSelect.value;

    localPlayer.name = name;
    localPlayer.color = color;

    socket.emit('create_room', { name, color }, res => {
        if(res.ok){
            roomId = res.roomId;
            host = true;
            menu.style.display = 'none';
            lobbyMenu.style.display = 'flex';
        } else alert(res.error);
    });
};

inviteBtn.onclick = () => {
    if(!roomId) return alert("Crée une partie d'abord !");
    const friendName = prompt("Entrez le pseudo de votre ami :");
    if(friendName) socket.emit('invite_friend', friendName);
};

// ---- Retour au menu ----
backToMenu.onclick = () => {
    endScreen.style.display = 'none';
    menu.style.display = 'flex';
    resetPlayer();
};

// ---- Événements serveur ----
socket.on('connect', () => console.log('✅ Connecté au serveur'));
socket.on('room_update', room => { players = room.players; });
socket.on('match_started', () => { 
    lobbyMenu.style.display = 'none';
    gameStarted = true;
    initObstacles();
    gameLoop();
});
socket.on('you_died', () => showEnd("💀 GAME OVER !"));
socket.on('match_ended', winner => showEnd(`🏆 ${winner} est le Top 1 !`));
socket.on('projectile_fired', proj => projectiles.push(proj));

// ---- Fonctions ----
function resetPlayer(){
    localPlayer.lives = 3;
    localPlayer.kills = 0;
    localPlayer.stamina = 100;
    localPlayer.speed = 0;
    gameStarted = false;
}

function showEnd(text){
    endText.innerText = text;
    endScreen.style.display = 'flex';
    gameStarted = false;
}

function createExplosion(x,y){
    explosions.push({x,y,r:10,alpha:1});
    explosionSound.currentTime=0; explosionSound.play();
}

function initObstacles(){
    obstacles = [];
    for(let i=0;i<10;i++){
        obstacles.push({x:50+Math.random()*700, y:50+Math.random()*500, w:50, h:50});
    }
}

// ---- Mouvement et actions ----
function handleInput(){
    if(!gameStarted) return;

    // ---- Sprint & Stamina ----
    const sprintKey = keys['f']; // F pour sprint
    let speed = sprintKey && localPlayer.stamina>0 ? 5 : 2;
    if(sprintKey) localPlayer.stamina = Math.max(0, localPlayer.stamina-1);
    else localPlayer.stamina = Math.min(100, localPlayer.stamina+0.5);

    // ---- Avancer / tourner ----
    let forward=0, turn=0;
    if(controlMode==='wasd'){
        forward = (keys['w'] ? 1:0) - (keys['s']?1:0);
        turn = (keys['d']?1:0) - (keys['a']?1:0);
    } else { // flèches
        forward = (keys['ArrowUp']?1:0) - (keys['ArrowDown']?1:0);
        turn = (keys['ArrowRight']?1:0) - (keys['ArrowLeft']?1:0);
    }

    localPlayer.angle += turn*0.05;
    let newX = localPlayer.x + Math.cos(localPlayer.angle)*forward*speed;
    let newY = localPlayer.y + Math.sin(localPlayer.angle)*forward*speed;

    // Collision enclos
    if(newX>50 && newX<750 && newY>50 && newY<550){
        localPlayer.x = newX;
        localPlayer.y = newY;
    }

    // Tir
    if(keys['g']){
        socket.emit('fire',{x:localPlayer.x,y:localPlayer.y});
    }

    // Compteur vitesse
    localPlayer.speed = forward*speed*60; // simplifié km/h
    speedSpan.innerText = Math.round(localPlayer.speed);

    socket.emit('player_state', localPlayer);
}

// ---- Boucle principale ----
function gameLoop(){
    handleInput();
    render();
    requestAnimationFrame(gameLoop);
}

// ---- Rendu ----
function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Fond
    ctx.fillStyle='#a3d9a5';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // Enclos
    ctx.strokeStyle='#654321';
    ctx.lineWidth=10;
    ctx.strokeRect(40,40,720,520);

    // Obstacles
    ctx.fillStyle='#c2a34a';
    for(let o of obstacles) ctx.fillRect(o.x,o.y,o.w,o.h);

    // Joueurs
    for(const id in players){
        const p = players[id];
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-15,-15,30,30);
        ctx.restore();
        ctx.fillStyle='black';
        ctx.font='14px Arial';
        ctx.fillText(p.name,p.x-20,p.y-25);
    }

    // Projectiles
    for(let proj of projectiles){
        ctx.fillStyle='#ff0';
        ctx.beginPath();
        ctx.arc(proj.x,proj.y,5,0,Math.PI*2);
        ctx.fill();
    }

    // Explosions
    for(let i=explosions.length-1;i>=0;i--){
        const e = explosions[i];
        ctx.fillStyle=`rgba(255,150,0,${e.alpha})`;
        ctx.beginPath();
        ctx.arc(e.x,e.y,e.r,0,Math.PI*2);
        ctx.fill();
        e.r+=3;
        e.alpha-=0.05;
        if(e.alpha<=0) explosions.splice(i,1);
    }

    // UI
    livesSpan.innerText = localPlayer.lives;
}
