// main.js

const socket = io({ transports: ['websocket'] });

// UI
const menu = document.getElementById('menu');
const menu2 = document.getElementById('menu2');
const startBtn = document.getElementById('startBtn');
const backMenu1Btn = document.getElementById('backMenu1Btn');
const launchBtn = document.getElementById('launchBtn');
const inviteBtn = document.getElementById('inviteBtn');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const controlsSelect = document.getElementById('controls');
const iaCountDiv = document.getElementById('iaCountDiv');
const iaCount = document.getElementById('iaCount');
const modeRadios = document.getElementsByName('mode');
const invitePseudo = document.getElementById('invitePseudo');
const playerList = document.getElementById('playerList');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const speedDisplay = document.getElementById('speed');

let roomId = null;
let playerId = null;
let localPlayer = { x:0,y:0,z:0, angle:0, name:'', color:'#ff9966', lives:3 };
let players = {};
let projectiles = [];
let iaPlayers = [];
let keys = {};
let controlMode = 'wasd';
let scene, camera, renderer, loader;
let goatModels = {};

// --- Menus ---
startBtn.onclick = () => {
    localPlayer.name = pseudoInput.value.trim() || 'Chèvre';
    localPlayer.color = colorInput.value || '#ff9966';
    controlMode = controlsSelect.value;
    socket.emit('create_room', { name: localPlayer.name, color: localPlayer.color }, res => {
        if(res.ok){
            roomId = res.roomId;
            playerId = socket.id;
            menu.style.display='none';
            menu2.style.display='flex';
            updateIAOptions();
        }
    });
};

function updateIAOptions(){
    if(getMode()=='private') iaCountDiv.style.display='block';
    else iaCountDivDiv.style.display='none';
}

function getMode(){
    for(const r of modeRadios) if(r.checked) return r.value;
    return 'public';
}

backMenu1Btn.onclick=()=>{
    menu.style.display='flex';
    menu2.style.display='none';
}

launchBtn.onclick=()=>{
    socket.emit('start_match',{mode:getMode(), ia:parseInt(iaCount.value)});
    menu2.style.display='none';
    init3D();
}

inviteBtn.onclick=()=>{
    const target = invitePseudo.value.trim();
    if(target) socket.emit('invite',{to:target});
};

backToMenu.onclick=()=>{
    endScreen.style.display='none';
    menu.style.display='flex';
};

// --- Chat ---
chatInput.addEventListener('keydown', e=>{
    if(e.key==='Enter' && chatInput.value.trim()!=''){
        socket.emit('chat_message',{msg:chatInput.value});
        chatInput.value='';
    }
});

socket.on('chat_message',data=>{
    const div = document.createElement('div');
    div.textContent=`${data.from}: ${data.msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop=chatMessages.scrollHeight;
});

// --- Socket.io updates ---
socket.on('connect',()=>console.log('Connecté au serveur'));
socket.on('room_update',data=>{
    players = data.players||{};
    iaPlayers = data.ia||[];
    playerList.textContent=Object.values(players).map(p=>p.name).join(', ');
});
socket.on('you_died',()=>showEnd('GAME OVER'));
socket.on('match_ended',winner=>showEnd(`${winner} est le Top 1 !`));

// --- End screen ---
function showEnd(text){
    endText.textContent=text;
    endScreen.style.display='flex';
}

// --- 3D setup ---
function init3D(){
    scene=new THREE.Scene();
    camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
    camera.position.set(0,20,30);
    renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(window.innerWidth,window.innerHeight);
    document.body.appendChild(renderer.domElement);

    loader = new THREE.GLTFLoader();
    // simple cube pour les autres joueurs pour prototype
    for(const id in players){
        const geometry = new THREE.BoxGeometry(1,1,1);
        const material = new THREE.MeshStandardMaterial({color:players[id].color});
        const mesh = new THREE.Mesh(geometry,material);
        goatModels[id]=mesh;
        scene.add(mesh);
    }

    const light = new THREE.DirectionalLight(0xffffff,1);
    light.position.set(10,20,10);
    scene.add(light);

    animate();
}

// --- Animate loop ---
function animate(){
    requestAnimationFrame(animate);
    handleInput3D();
    updateModels();
    renderer.render(scene,camera);
}

// --- Input 3D ---
document.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

function handleInput3D(){
    let fwd=0, strafe=0;
    if(controlMode=='wasd'){
        fwd=(keys['w']?1:0)-(keys['s']?1:0);
        strafe=(keys['d']?1:0)-(keys['a']?1:0);
    } else if(controlMode=='zqsd'){
        fwd=(keys['z']?1:0)-(keys['s']?1:0);
        strafe=(keys['d']?1:0)-(keys['q']?1:0);
    } else if(controlMode=='arrows'){
        fwd=(keys['arrowup']?1:0)-(keys['arrowdown']?1:0);
        strafe=(keys['arrowright']?1:0)-(keys['arrowleft']?1:0);
    }

    const speed = keys['f']?0.2:0.1;
    localPlayer.x+=fwd*speed;
    localPlayer.z+=strafe*speed;
    speedDisplay.textContent=`Vitesse: ${Math.round(speed*1500)} km/h`;

    // update player position to server
    socket.emit('player_state',localPlayer);
}

// --- Update 3D player models ---
function updateModels(){
    for(const id in players){
        if(!goatModels[id]){
            const geometry = new THREE.BoxGeometry(1,1,1);
            const material = new THREE.MeshStandardMaterial({color:players[id].color});
            const mesh = new THREE.Mesh(geometry,material);
            goatModels[id]=mesh;
            scene.add(mesh);
        }
        goatModels[id].position.set(players[id].x,0,players[id].z);
    }
}
