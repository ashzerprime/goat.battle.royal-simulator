// main.js - Goat Battle Royale 3D
const socket = io({ transports: ['websocket'] });

// UI
const menu = document.getElementById('menu');
const menu2 = document.getElementById('menu2');
const startBtn = document.getElementById('startBtn');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const controlsSelect = document.getElementById('controls');
const inviteInput = document.getElementById('inviteInput');
const inviteBtn = document.getElementById('inviteBtn');
const startGameBtn = document.getElementById('startGameBtn');
const gameModeSelect = document.getElementById('gameMode');
const aiCountInput = document.getElementById('aiCount');
const backToMenu = document.getElementById('backToMenu');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const roomInfo = document.getElementById('roomInfo');
const chatDiv = document.getElementById('chat');
const chatInput = document.getElementById('chatInput');

const canvas = document.getElementById('gameCanvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Three.js
let scene, camera, renderer, playerMesh;
let isFPS = false;
let clock = new THREE.Clock();

// Game state
let roomId = null;
let localPlayer = { x:0, y:0, z:0, angle:0, name:'Chèvre', color:'#ff9966', lives:3, stamina:100, speed:0 };
let players = {};
let projectiles = [];
let IAplayers = [];
let obstacles = [];
let keys = {};

// ---- Three.js init ----
function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 2000);
    renderer = new THREE.WebGLRenderer({canvas});
    renderer.setSize(window.innerWidth, window.innerHeight);

    // sol
    const groundGeo = new THREE.PlaneGeometry(2000,2000);
    const groundMat = new THREE.MeshStandardMaterial({color:0x228B22});
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    // lumière
    const ambient = new THREE.AmbientLight(0xffffff,0.7);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff,0.5);
    dirLight.position.set(50,100,50);
    scene.add(dirLight);

    // joueur mesh
    const geom = new THREE.BoxGeometry(2,2,2);
    const mat = new THREE.MeshStandardMaterial({color: localPlayer.color});
    playerMesh = new THREE.Mesh(geom, mat);
    scene.add(playerMesh);

    // obstacles
    initObstacles();

    animate();
}

function initObstacles(){
    obstacles = [];
    for(let i=0;i<10;i++){
        const geom = new THREE.BoxGeometry(5,5,5);
        const mat = new THREE.MeshStandardMaterial({color:0xC2A34A});
        const obs = new THREE.Mesh(geom, mat);
        obs.position.set(Math.random()*100-50,2.5,Math.random()*100-50);
        obstacles.push(obs);
        scene.add(obs);
    }
}

// ---- Input ----
document.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

chatInput.addEventListener('keypress', e=>{
    if(e.key==='Enter'){
        const msg = chatInput.value.trim();
        if(msg){
            socket.emit('chat_message', {room: roomId, text:msg});
            chatInput.value='';
        }
    }
});

// ---- Buttons ----
startBtn.onclick = ()=>{
    localPlayer.name = pseudoInput.value.trim()||'Chèvre';
    localPlayer.color = colorInput.value;
    localPlayer.control = controlsSelect.value;

    socket.emit('create_room',{name:localPlayer.name,color:localPlayer.color},res=>{
        if(res.ok){
            roomId = res.roomId;
            menu.style.display='none';
            menu2.style.display='flex';
            roomInfo.innerText = `Salle: ${roomId}`;
        }else{
            alert('Erreur:'+res.error);
        }
    });
};

inviteBtn.onclick = ()=>{
    const target = inviteInput.value.trim();
    if(target) socket.emit('invite',{room:roomId,target});
};

startGameBtn.onclick = ()=>{
    const mode = gameModeSelect.value;
    const aiCount = parseInt(aiCountInput.value);
    socket.emit('start_game',{room:roomId,mode,aiCount});
};

backToMenu.onclick = ()=>{
    endScreen.style.display='none';
    menu.style.display='flex';
    players={};
    IAplayers=[];
};

// ---- Socket.IO events ----
socket.on('room_update',data=>{players=data.players; IAplayers=data.IAplayers || []});
socket.on('game_started',data=>{
    menu2.style.display='none';
    initThree();
});
socket.on('player_died',data=>{
    showEnd(data.msg);
});
socket.on('chat_message',data=>{
    const div = document.createElement('div');
    div.innerText = `${data.name}: ${data.text}`;
    chatDiv.appendChild(div);
    chatDiv.scrollTop = chatDiv.scrollHeight;
});

// ---- Movement & update ----
function handleInput(dt){
    let speed=keys['f']&&localPlayer.stamina>0?0.5:0.2;
    if(keys[' ']) localPlayer.y+=5*dt;
    let forward=0, turn=0;
    if(localPlayer.control==='wasd'){
        forward = (keys['z']?1:0)-(keys['s']?1:0);
        turn = (keys['d']?1:0)-(keys['q']?1:0);
    }else{
        forward = (keys['arrowup']?1:0)-(keys['arrowdown']?1:0);
        turn = (keys['arrowright']?1:0)-(keys['arrowleft']?1:0);
    }
    localPlayer.angle += turn*2*dt;
    playerMesh.position.x += Math.cos(localPlayer.angle)*forward*speed*50*dt;
    playerMesh.position.z += Math.sin(localPlayer.angle)*forward*speed*50*dt;
    camera.position.set(playerMesh.position.x,playerMesh.position.y+5,playerMesh.position.z+10);
    camera.lookAt(playerMesh.position);
    socket.emit('player_state',localPlayer);
}

// ---- End ----
function showEnd(msg){
    endText.innerText=msg;
    endScreen.style.display='flex';
}

// ---- Animate ----
function animate(){
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    handleInput(dt);
    renderer.render(scene,camera);
}
