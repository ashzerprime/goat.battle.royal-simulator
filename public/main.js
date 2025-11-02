// --- Connexion Socket.IO ---
const socket = io({ transports: ['websocket'] });

// --- UI ---
const menu1 = document.getElementById('menu');
const menu2 = document.getElementById('menu2');
const startBtn = document.getElementById('startBtn');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const controlsSelect = document.getElementById('controls');

const inviteInput = document.getElementById('invitePseudo');
const inviteBtn = document.getElementById('inviteBtn');
const launchBtn = document.getElementById('launchBtn');
const backMenu1Btn = document.getElementById('backMenu1Btn');
const playerListSpan = document.getElementById('playerList');
const iaCountInput = document.getElementById('iaCount');

const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const speedDiv = document.getElementById('speed');

// --- Variables ---
let scene, camera, renderer;
let localPlayer = { name:'Chèvre', color:'#ff9966', x:0, y:0, z:0, rotY:0, lives:3, stamina:100, speed:0 };
let players = {}; // autres joueurs + self
let projectiles = [];
let keys = {};
let controlMode = 'wasd';
let roomId = null;
let host = false;
let countdown = 5;
let mode = 'public';
let iaCount = 3;

// --- Three.js init ---
function init3D() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // lumière
    const light = new THREE.DirectionalLight(0xffffff,1);
    light.position.set(0,50,50);
    scene.add(light);

    // sol
    const geometry = new THREE.PlaneGeometry(1000,1000);
    const material = new THREE.MeshStandardMaterial({ color:0x228822 });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI/2;
    scene.add(floor);

    // Joueur local (cube temporaire)
    const geometryCube = new THREE.BoxGeometry(5,5,5);
    const materialCube = new THREE.MeshStandardMaterial({ color:localPlayer.color });
    localPlayer.mesh = new THREE.Mesh(geometryCube, materialCube);
    localPlayer.mesh.position.set(localPlayer.x,2.5,localPlayer.z);
    scene.add(localPlayer.mesh);

    camera.position.set(localPlayer.x,20,localPlayer.z+20);
    camera.lookAt(localPlayer.mesh.position);
}

// --- Input ---
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- Menu 1 ---
startBtn.onclick = () => {
    localPlayer.name = pseudoInput.value.trim() || 'Chèvre';
    localPlayer.color = colorInput.value || '#ff9966';
    controlMode = controlsSelect.value;
    menu1.style.display='none';
    menu2.style.display='flex';
};

// --- Menu 2 ---
backMenu1Btn.onclick = ()=> { menu2.style.display='none'; menu1.style.display='flex'; }
launchBtn.onclick = () => {
    iaCount = parseInt(iaCountInput.value);
    mode = document.querySelector('input[name="mode"]:checked').value;
    socket.emit('launch_game',{ roomId, mode, iaCount });
};

// --- Invitations ---
inviteBtn.onclick = ()=>{
    const target = inviteInput.value.trim();
    if(target) socket.emit('invite_player', { roomId, target });
};

// --- Chat ---
chatInput.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
        const msg = chatInput.value.trim();
        if(msg){
            socket.emit('chat_message', msg);
            chatInput.value='';
        }
    }
});
socket.on('chat_message', data=>{
    const div = document.createElement('div');
    div.textContent = data;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// --- Socket events ---
socket.on('connect', ()=> console.log('Connecté au serveur'));
socket.on('room_update', data => {
    players = data.players;
    playerListSpan.textContent = Object.values(players).map(p=>p.name).join(', ');
});
socket.on('game_started', ()=>{ menu2.style.display='none'; init3D(); animate(); });

// --- Mouvements & logique ---
function updatePlayer(){
    let fwd=0, turn=0;
    if(controlMode==='wasd'){ fwd=(keys['w']?1:0)-(keys['s']?1:0); turn=(keys['d']?1:0)-(keys['a']?1:0); }
    else if(controlMode==='zqsd'){ fwd=(keys['z']?1:0)-(keys['s']?1:0); turn=(keys['d']?1:0)-(keys['q']?1:0); }
    else{ fwd=(keys['ArrowUp']?1:0)-(keys['ArrowDown']?1:0); turn=(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0); }

    const sprint = keys['f'] && localPlayer.stamina>0;
    const speed = sprint?0.8:0.4;
    localPlayer.rotY += turn*0.05;
    localPlayer.x += Math.sin(localPlayer.rotY)*fwd*speed;
    localPlayer.z += Math.cos(localPlayer.rotY)*fwd*speed;

    if(sprint) localPlayer.stamina-=0.5;
    else if(localPlayer.stamina<100) localPlayer.stamina+=0.3;

    localPlayer.speed = fwd*speed*100; // km/h pour affichage
    localPlayer.mesh.position.set(localPlayer.x,2.5,localPlayer.z);
    localPlayer.mesh.rotation.y = localPlayer.rotY;

    socket.emit('player_state', localPlayer);
}

// --- Animation 3D ---
function animate(){
    requestAnimationFrame(animate);
    updatePlayer();
    renderer.render(scene,camera);
    camera.position.set(localPlayer.x,20,localPlayer.z+20);
    camera.lookAt(localPlayer.mesh.position);
    speedDiv.textContent = `Vitesse: ${Math.round(localPlayer.speed*3)} km/h`;
}
