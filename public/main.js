// --- Three.js setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 2000);
camera.position.set(0, 200, 200);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({canvas:document.getElementById('canvas3d')});
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Lumière ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100,200,100);
scene.add(dirLight);

// --- Enclos ---
const enclosSize = 800;
const enclosGeometry = new THREE.BoxGeometry(enclosSize,10,enclosSize);
const enclosMaterial = new THREE.MeshPhongMaterial({color:0x654321});
const enclos = new THREE.Mesh(enclosGeometry, enclosMaterial);
enclos.position.y = -5;
scene.add(enclos);

// --- Obstacles ---
let obstacles = [];
function initObstacles(){
    for(let i=0;i<12;i++){
        const g = new THREE.BoxGeometry(40,40,40);
        const m = new THREE.MeshPhongMaterial({color:0xc2a34a});
        const cube = new THREE.Mesh(g,m);
        cube.position.set(Math.random()*700-350,20,Math.random()*700-350);
        obstacles.push(cube);
        scene.add(cube);
    }
}

// --- Players ---
let players = {};
let bots = {};
let projectiles = [];
const localPlayer = { x:0, z:0, angle:0, speed:0, name:'Chèvre', color:0xff9966, lives:3, stamina:10, kills:0, top1:0 };

// --- UI ---
const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const inviteBtn = document.getElementById('inviteBtn');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');
const statsDiv = document.getElementById('stats');
const speedDiv = document.getElementById('speed');

// --- Socket.IO ---
const socket = io('https://goatbattleroyal-simulator-production.up.railway.app',{transports:['websocket']});

socket.on('connect', ()=>console.log("✅ Connecté au serveur"));
socket.on('room_update', room => updatePlayers(room.players));
socket.on('match_started', ()=>console.log("🎮 Match commencé !"));
socket.on('you_died', ()=>showEnd(`💀 GAME OVER! Top ${Object.keys(players).length+1}`));
socket.on('match_ended', winner=>showEnd(`🏆 ${winner} est Top 1 !`));

// --- Création/Mise à jour joueurs ---
function updatePlayers(serverPlayers){
    for(const id in serverPlayers){
        const data = serverPlayers[id];
        if(!players[id]){
            const g = new THREE.BoxGeometry(30,30,30);
            const m = new THREE.MeshPhongMaterial({color:data.color});
            const cube = new THREE.Mesh(g,m);
            cube.position.set(data.x,15,data.z);
            scene.add(cube);
            players[id] = cube;
        } else {
            players[id].position.set(data.x,15,data.z);
            players[id].rotation.y = data.angle;
        }
    }
}

// --- Input ---
let keys = {};
document.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

function handleInput(){
    let speed = keys['f'] && localPlayer.stamina>0 ? 4 : 2;
    if(keys['r']) speed=0;
    localPlayer.speed = speed*50;
    if(keys['f']) localPlayer.stamina=Math.max(0,localPlayer.stamina-0.1); 
    else localPlayer.stamina=Math.min(10,localPlayer.stamina+0.05);

    let fwd=0, turn=0;
    if(controlsSelect.value==='wasd'){
        fwd=(keys['w']?1:0)-(keys['s']?1:0);
        turn=(keys['d']?1:0)-(keys['a']?1:0);
    } else {
        fwd=(keys['ArrowUp']?1:0)-(keys['ArrowDown']?1:0);
        turn=(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0);
    }

    localPlayer.angle += turn*0.05;
    localPlayer.x += Math.cos(localPlayer.angle)*fwd*speed;
    localPlayer.z += Math.sin(localPlayer.angle)*fwd*speed;

    localPlayer.x = Math.max(-enclosSize/2+15, Math.min(enclosSize/2-15, localPlayer.x));
    localPlayer.z = Math.max(-enclosSize/2+15, Math.min(enclosSize/2-15, localPlayer.z));

    if(keys['g']){
        socket.emit('fire',{x:localPlayer.x, z:localPlayer.z, angle:localPlayer.angle});
    }

    socket.emit('player_state', localPlayer);

    camera.position.set(localPlayer.x - Math.sin(localPlayer.angle)*100, 80, localPlayer.z - Math.cos(localPlayer.angle)*100);
    camera.lookAt(localPlayer.x,0,localPlayer.z);

    statsDiv.textContent=`Kills: ${localPlayer.kills} | Top1: ${localPlayer.top1}`;
    speedDiv.textContent=`${Math.floor(localPlayer.speed)} km/h`;
}

// --- Boucle principale ---
function gameLoop(){
    handleInput();
    renderer.render(scene,camera);
    requestAnimationFrame(gameLoop);
}

// --- Boutons ---
startBtn.onclick = ()=>{
    localPlayer.name=pseudoInput.value||'Chèvre';
    localPlayer.color=parseInt(colorInput.value.replace('#','0x'));
    socket.emit('create_room',{name:localPlayer.name,color:localPlayer.color}, res=>{
        if(res.ok){ menu.style.display='none'; initObstacles(); gameLoop(); }
        else alert(res.error);
    });
};

inviteBtn.onclick = ()=>{
    if(!localPlayer.name){ alert("Crée une partie d'abord !"); return; }
    navigator.clipboard.writeText(window.location.href+'?room='+localPlayer.name);
    alert("Lien copié !");
};

backToMenu.onclick = ()=>{
    endScreen.style.display='none';
    menu.style.display='flex';
    localPlayer.lives=3;
};

// --- Explosion ---
function createExplosion(x,z){
    const geo = new THREE.SphereGeometry(20,16,16);
    const mat = new THREE.MeshBasicMaterial({color:0xff6600});
    const exp = new THREE.Mesh(geo,mat);
    exp.position.set(x,15,z);
    scene.add(exp);
    setTimeout(()=>scene.remove(exp),500);
    new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_cdb9d1e66c.mp3?filename=small-explosion-6821.mp3").play();
}

// --- Fin ---
function showEnd(text){ endText.innerText=text; endScreen.style.display='flex'; }
