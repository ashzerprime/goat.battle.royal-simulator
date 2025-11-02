const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // { roomId: { players:{socketId:player}, private:boolean, host:socketId, bots:[] } }

// ---- Utils ----
function generateId() {
  return Math.random().toString(36).substr(2, 6);
}

function createBot(id) {
  return { id, name:'Bot-'+id, x:Math.random()*700+50, y:Math.random()*500+50, angle:Math.random()*Math.PI*2, color:'#ccc', lives:3 };
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];
  if(!room) return;
  io.to(roomId).emit('room_update', { players: room.players });
}

// ---- Socket.IO ----
io.on('connection', socket => {
  console.log('⚡ Connecté :', socket.id);

  socket.on('create_room', ({ name, color, privateMode=false }, callback) => {
    const roomId = generateId();
    rooms[roomId] = { players:{}, private:privateMode, host:socket.id, bots:[] };
    rooms[roomId].players[socket.id] = { id:socket.id, name, color, x:400, y:300, angle:0, lives:3, kills:0 };
    socket.join(roomId);
    callback({ ok:true, roomId });
    console.log('🛠 Room créée:', roomId);
  });

  socket.on('join_room', ({ roomId, name, color }, callback) => {
    const room = rooms[roomId];
    if(!room) return callback({ ok:false, error:'Salle introuvable' });
    room.players[socket.id] = { id:socket.id, name, color, x:400, y:300, angle:0, lives:3, kills:0 };
    socket.join(roomId);
    broadcastRoom(roomId);
    callback({ ok:true });
  });

  socket.on('invite_friend', friendName => {
    // Pour simplifier, on pourrait gérer un mapping pseudo -> socketId
    console.log(`${socket.id} invite ${friendName}`);
  });

  socket.on('start_match', roomId => {
    const room = rooms[roomId];
    if(!room) return;
    // Ajouter 5 bots pour le mode privé
    for(let i=0;i<5;i++){
      const bot = createBot(generateId());
      room.bots.push(bot);
      room.players[bot.id] = bot;
    }
    io.to(roomId).emit('match_started');
  });

  socket.on('player_state', state => {
    const roomsArr = Object.values(rooms).filter(r=>r.players[socket.id]);
    if(!roomsArr.length) return;
    const room = roomsArr[0];
    room.players[socket.id] = {...room.players[socket.id], ...state };
    broadcastRoom(Object.keys(rooms).find(k=>rooms[k]===room));
  });

  socket.on('fire', pos => {
    const roomsArr = Object.values(rooms).filter(r=>r.players[socket.id]);
    if(!roomsArr.length) return;
    const room = roomsArr[0];
    // Crée un projectile simple et broadcast
    const projectile = { x:pos.x, y:pos.y, owner:socket.id };
    io.to(Object.keys(rooms).find(k=>rooms[k]===room)).emit('projectile_fired', projectile);
  });

  socket.on('disconnect', () => {
    console.log('❌ Déconnecté :', socket.id);
    for(const roomId in rooms){
      const room = rooms[roomId];
      if(room.players[socket.id]){
        delete room.players[socket.id];
        broadcastRoom(roomId);
        if(Object.keys(room.players).length===0){
          delete rooms[roomId];
          console.log('🗑 Room supprimée:', roomId);
        }
      }
    }
  });
});

// ---- Serveur ----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`));
