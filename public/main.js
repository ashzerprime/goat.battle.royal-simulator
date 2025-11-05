// public/main.js - client: invites + lobby chat + basic 3D hook
const socket = io({ transports: ['websocket'] });

// UI elements
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const joinRoomIdInput = document.getElementById('joinRoomId');
const lobbyDiv = document.getElementById('lobby');
const roomLabel = document.getElementById('roomLabel');
const lobbyPlayers = document.getElementById('lobbyPlayers');
const inviteNameInput = document.getElementById('inviteName');
const inviteBtn = document.getElementById('inviteBtn');
const pendingInvitesDiv = document.getElementById('pendingInvites');

const invitePrompt = document.getElementById('invitePrompt');
const inviteText = document.getElementById('inviteText');
const acceptInviteBtn = document.getElementById('acceptInvite');
const declineInviteBtn = document.getElementById('declineInvite');

const lobbyChat = document.getElementById('lobbyChat');
const lobbyChatInput = document.getElementById('lobbyChatInput');
const sendLobbyChat = document.getElementById('sendLobbyChat');

const gameChat = document.getElementById('gameChat');
const gameChatInput = document.getElementById('gameChatInput');
const sendGameChat = document.getElementById('sendGameChat');

const startMatchBtn = document.getElementById('startMatchBtn');

// local state
let myName = null;
let myColor = '#ff9966';
let currentRoom = null;
let pendingInviteFrom = null;

// Register user (local)
function registerLocal(cb){
  myName = (pseudoInput.value || '').trim();
  if(!myName){ alert('Choisis un pseudo'); return; }
  myColor = colorInput.value || '#ff9966';
  socket.emit('register', { name: myName, color: myColor }, (res) => { cb?.(res); });
}

// Create room
createRoomBtn.onclick = () => {
  registerLocal(() => {
    socket.emit('create_room', { name: myName, color: myColor }, (res) => {
      if(res.ok){ currentRoom = res.roomId; showLobby(); }
      else alert(res.error || 'Erreur création');
    });
  });
};

// Join room by ID
joinRoomBtn.onclick = () => {
  const rid = joinRoomIdInput.value.trim();
  if(!rid){ alert('Donne l\'ID'); return; }
  registerLocal(() => {
    socket.emit('join_room', { roomId: rid, name: myName, color: myColor }, (res) => {
      if(res.ok){ currentRoom = rid; showLobby(); }
      else alert(res.error || 'Impossible de rejoindre');
    });
  });
};

// show lobby UI
function showLobby(){
  document.getElementById('menu').style.display = 'none';
  lobbyDiv.style.display = 'block';
  roomLabel.innerText = currentRoom ? `#${currentRoom}` : '(salle inconnue)';
}

// Invite
inviteBtn.onclick = () => {
  const target = inviteNameInput.value.trim();
  if(!target) return alert('Entrez un pseudo');
  socket.emit('invite', { targetName: target }, (res) => {
    if(res && res.ok) {
      pendingInvitesDiv.innerHTML += `<div>Invitation envoyée à <b>${target}</b></div>`;
    } else {
      alert(res?.error || 'Impossible d\'inviter');
    }
  });
};

// Receive invite request
socket.on('invite_request', ({ fromName, roomId }) => {
  // show prompt to accept/decline
  invitePrompt.style.display = 'block';
  inviteText.innerText = `${fromName} t'invite dans la salle ${roomId}`;
  pendingInviteFrom = { fromName, roomId };
});

// Accept / decline invite
acceptInviteBtn.onclick = () => {
  if(!pendingInviteFrom) return;
  socket.emit('invite_response', { fromName: pendingInviteFrom.fromName, roomId: pendingInviteFrom.roomId, accept: true });
  invitePrompt.style.display = 'none';
  pendingInviteFrom = null;
};
declineInviteBtn.onclick = () => {
  if(!pendingInviteFrom) return;
  socket.emit('invite_response', { fromName: pendingInviteFrom.fromName, roomId: pendingInviteFrom.roomId, accept: false });
  invitePrompt.style.display = 'none';
  pendingInviteFrom = null;
};

// When invited user auto-joined server side -> server will send 'joined_room'
socket.on('joined_room', ({ roomId }) => {
  currentRoom = roomId;
  showLobby();
});

// invite response arrives back to inviter
socket.on('invite_response', ({ from, accept }) => {
  pendingInvitesDiv.innerHTML += `<div>${from} a ${accept ? 'accepté' : 'refusé'} l'invitation</div>`;
  // if accepted, server already added them and broadcasted room_update
});

// Lobby chat
sendLobbyChat.onclick = () => {
  const t = lobbyChatInput.value.trim();
  if(!t || !currentRoom) return;
  socket.emit('lobby_chat', { text: t });
  lobbyChatInput.value = '';
};
socket.on('lobby_chat', ({ name, text }) => {
  lobbyChat.innerHTML += `<div><b>${name}:</b> ${text}</div>`;
  lobbyChat.scrollTop = lobbyChat.scrollHeight;
});

// Game chat (in-game)
sendGameChat.onclick = () => {
  const t = gameChatInput.value.trim();
  if(!t || !currentRoom) return;
  socket.emit('game_chat', { text: t });
  gameChatInput.value = '';
};
socket.on('game_chat', ({ name, text }) => {
  gameChat.innerHTML += `<div><b>${name}:</b> ${text}</div>`;
  gameChat.scrollTop = gameChat.scrollHeight;
});

// Room updates (players list + data)
socket.on('room_update', (room) => {
  // update local currentRoom if not set
  if(!currentRoom) currentRoom = Object.keys(room)[0] || currentRoom;
  // render players list
  const players = room.players || room;
  lobbyPlayers.innerHTML = '';
  for(const sid in players){
    const p = players[sid];
    const el = document.createElement('div');
    el.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:${p.color};margin-right:6px;border-radius:2px;"></span> ${p.name} ${sid===socket.id? '(moi)':''}`;
    lobbyPlayers.appendChild(el);
  }
});

// start match (host)
startMatchBtn.onclick = () => {
  if(!currentRoom) return alert('Pas de salle');
  socket.emit('start_match', { aiCount: 6 });
};

// misc
socket.on('connect', ()=>console.log('connected', socket.id));
socket.on('disconnect', ()=>console.log('disconnected'));
