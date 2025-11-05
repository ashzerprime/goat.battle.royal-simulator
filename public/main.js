// main.js - Goat Battle Royale 3D FINAL

// ----- THREE.JS -----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // ciel bleu

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({canvas: document.getElementById('canvas3d')});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lumière
const ambient = new THREE.AmbientLight(0xffffff,0.8);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff,0.6);
dirLight.position.set(10,20,10);
scene.add(dirLight);

// ----- Sol + herbe -----
const groundGeo = new THREE.PlaneGeometry(100,100);
const groundMat = new THREE.MeshPhongMaterial({color:0x00ff00});
const ground = new THREE.Mesh(groundGeo,groundMat);
ground.rotation.x = -Math.PI/2;
scene.add(ground);

// ----- Variables -----
let socket = io('https://goatbattleroyal-simulator-production.up.railway.app', {transports:['websocket']});
let players = {}, playerMeshes = {};
let IA = [], IAMeshes = {};
let bullets = [];
let keys = {}, controlMode='wasd';
let localPlayer = {x:0,z:0,angle:0,name:'Chèvre',color:0xff9966,lives:3};
let roomId = null;
let countdown = 5;
let gameStarted=false;

// ----- UI -----
const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const pseudoInput = document.getElementById('pseudo');
const controlsSelect = document.getElementById('controls');
const colorInput = document.getElementById('color');
const livesSpan = document.getElementById('lives');
const endScreen = document.getElementById('endScreen');
const endText = document.getElementById('endText');
const backToMenu = document.getElementById('backToMenu');
const chatInput = document.getElementById('chatInput');
const chatBox = document.getElementById('chatBox');
const speedDisplay = document.getElementById('speed');

// ----- Sons -----
const shootSound = new Audio('https://cdn.pixabay.com/download/audio/2021/09/10/audio_9ff4d3c0b4.mp3?filename=gunshot-3.mp3');
const sprintSound = new Audio('https://cdn.pixabay.com/download/audio/2021/09/06/audio_70f6c191e2.mp3?filename=motorbike-accelerate-5931.mp3');

// ----- Événements -----
document.addEventListener('keydown', e=>keys[e.key.toLowerCase()]=true);
document.addEventListener('keyup', e=>keys[e.key.toLowerCase()]=false);

chatInput.addEventListener('keydown', e=>{
    if(e.key==='Enter' && chatInput.value.trim()!==''){
        socket.emit('chat',{text:chatInput.value});
        chatInput.value='';
    }
});

// ----- Connexion Socket.IO -----
socket.on('connect',()=>console.log('Connecté au serveur'));
socket.on('room_update',room=>{
    players = room.players;
    // Ajouter nouveaux meshes si manquants
    for(const id in players){
        if(!playerMeshes[id]){
            const mat = new THREE.MeshPhongMaterial({color:players[id].color || 0xff9966});
            const geom = new THREE.BoxGeometry(1,1,1); // simple low poly chèvre
            const mesh = new THREE.Mesh(geom,mat);
            scene.add(mesh);
            playerMeshes[id]=mesh;
        }
    }
});
socket.on('IA_update', iaList=>{
    IA = iaList;
    for(const a of IA){
        if(!IAMeshes[a.id]){
            const geom = new THREE.BoxGeometry(1,1,1);
            const mat = new THREE.MeshPhongMaterial({color:0x996633});
            const mesh = new THREE.Mesh(geom,mat);
            scene.add(mesh);
            IAMeshes[a.id]=mesh;
        }
    }
});
socket.on('match_started',()=>{gameStarted=true; menu.style.display='none'; startCountdown();});
socket.on('chat_msg',msg=>{
    chatBox.innerHTML += `<div>${msg}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
});
socket.on('you_died',()=>{showEnd("GAME OVER");});
socket.on('match_ended',winner=>{showEnd(`🏆 Top 1 : ${winner}`);});

// ----- Menu -----
startBtn.onclick=()=>{
    const name = pseudoInput.value.trim()||'Chèvre';
    const color = parseInt(colorInput.value.replace('#','0x')) || 0xff9966;
    controlMode = controlsSelect.value || 'wasd';
    localPlayer.name = name;
    localPlayer.color = color;
    socket.emit('create_room',{name,color},res=>{
        if(res.ok){roomId=res.roomId; startCountdown();}else alert(res.error);
    });
};
backToMenu.onclick=()=>{endScreen.style.display='none';menu.style.display='flex'; localPlayer.lives=3;};

// ----- Countdown avant partie -----
function startCountdown(){
    countdown=5;
    const cdInt=setInterval(()=>{
        if(countdown>0){menu.innerHTML=`Partie dans ${countdown}...`; countdown--;}
        else{clearInterval(cdInt); menu.style.display='none'; gameStarted=true;}
    },1000);
}

// ----- Gun FPS -----
let gunMesh;
function addGunFPS(){
    const geom = new THREE.BoxGeometry(0.3,0.2,1);
    const mat = new THREE.MeshPhongMaterial({color:0x333333});
    gunMesh = new THREE.Mesh(geom,mat);
    gunMesh.position.set(0,-0.2,-0.5);
    camera.add(gunMesh);
}
addGunFPS();

// ----- Tir -----
function shootBullet(){
    const bulletGeom = new THREE.SphereGeometry(0.05,8,8);
    const bulletMat = new THREE.MeshBasicMaterial({color:0xffff00});
    const bulletMesh = new THREE.Mesh(bulletGeom,bulletMat);
    bulletMesh.position.copy(camera.position);
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
    bullets.push({mesh:bulletMesh,dir,hit:false});
    scene.add(bulletMesh);
    shootSound.currentTime=0; shootSound.play();
}
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='g') shootBullet();});

// ----- Boucle principale -----
function animate(){
    requestAnimationFrame(animate);
    if(gameStarted) updatePlayer();
    updateBullets();
    renderer.render(scene,camera);
}
animate();

// ----- Joueur -----
function updatePlayer(){
    let fwd=(keys['z']?1:0)-(keys['s']?1:0);
    let turn=(keys['d']?1:0)-(keys['q']?1:0);
    let speed=0.2;
    if(keys['f']) {speed=0.5; sprintSound.play();}

    localPlayer.angle += turn*0.05;
    localPlayer.x += Math.cos(localPlayer.angle)*fwd*speed;
    localPlayer.z += Math.sin(localPlayer.angle)*fwd*speed;

    // Camera FPS
    if(keys['h']) camera.position.set(localPlayer.x,1.5,localPlayer.z);
    else camera.position.set(localPlayer.x,2,localPlayer.z+5);
    camera.lookAt(localPlayer.x,0,localPlayer.z);

    // Envoyer au serveur
    socket.emit('player_state',localPlayer);
    
    // Update meshes
    for(const id in players) if(playerMeshes[id]) playerMeshes[id].position.set(players[id].x,0.5,players[id].z);
    IA.forEach(a=>{if(IAMeshes[a.id]) IAMeshes[a.id].position.set(a.x,0.5,a.z);});
    
    // Vitesse km/h
    speedDisplay.textContent = Math.round(speed*500); // simple approximation
}

// ----- Bullets -----
function updateBullets(){
    bullets.forEach((b,i)=>{
        b.mesh.position.addScaledVector(b.dir,0.5);
        // collision IA
        IA.forEach(a=>{
            if(!b.hit && Math.hypot(b.mesh.position.x-a.x,b.mesh.position.z-a.z)<0.5){
                b.hit=true;
                a.lives--; 
                scene.remove(b.mesh);
                bullets.splice(i,1);
            }
        });
        if(Math.abs(b.mesh.position.x)>50 || Math.abs(b.mesh.position.z)>50){scene.remove(b.mesh); bullets.splice(i,1);}
    });
}

// ----- End screen -----
function showEnd(text){endText.innerText=text; endScreen.style.display='flex';}
