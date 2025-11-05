// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ----- Static files -----
app.use(express.static('public'));

// ----- Lobbies -----
let lobbies = {}; // {roomId: {players:{id:{name,color}}, mode, countdown, hostId, started}}

// ----- Helper -----
function generateRoomId() {
  return Math.random().toString(36).substr(2,6).toUpperCase();
}

// ----- Socket.IO -----
io.on('connection', socket => {
  console.log(`✅ ${socket.id} connected`);

  socket.on('create_room', ({ name, color }, callback) => {
    const roomId = generateRoomId();
    lobbies[roomId] = {
      players: {},
      mode: 'private',
      countdown: 10,
      hostId: socket.id,
      started: false
    };
    lobbies[roomId].players[socket.id] = { name, color, id: socket.id };
    socket.join(roomId);
    callback({ ok:true, roomId });
    io.to(roomId).emit('room_update', lobbies[roomId]);
  });

  socket.on('start_match', mode => {
    // Trouver le lobby du joueur
    const lobby = Object.values(lobbies).find(l=>l.players[socket.id]);
    if(!lobby) return;
    lobby.mode = mode;
    if(lobby.started) return;

    // Ajouter IA si nécessaire
    const neededIA = 5 - Object.keys(lobby.players).length;
    for(let i=0;i<neededIA;i++){
      const iaId = 'IA_'+Math.random().toString(36).substr(2,4);
      lobby.players[iaId] = { name:'IA', color:'#ff0000', id:iaId, isAI:true };
    }

    lobby.started = true;
    let countdown = lobby.countdown;

    const timer = setInterval(()=>{
      io.to(socket.id).emit('timer', countdown);
      countdown--;
      if(countdown<0){
        clearInterval(timer);
        io.to(socket.id).emit('match_started');
        Object.keys(lobby.players).forEach(pid=>{
          if(!lobby.players[pid].isAI) io.to(pid).emit('match_started');
        });
      }
    },1000);
  });

  socket.on('player_state', state => {
    const lobby = Object.values(lobbies).find(l=>l.players[socket.id]);
    if(!lobby) return;
    lobby.players[socket.id] = { ...lobby.players[socket.id], ...state };
    io.to(socket.id).emit('room_update', lobby);
  });

  socket.on('fire', data => {
    const lobby = Object.values(lobbies).find(l=>l.players[socket.id]);
    if(!lobby) return;
    // broadcast la balle aux autres joueurs
    socket.to(Object.keys(lobby.players).filter(id=>id!==socket.id).join(',')).emit('fire', { shooter: socket.id, ...data });
  });

  socket.on('chat', msg => {
    const lobby = Object.values(lobbies).find(l=>l.players[socket.id]);
    if(!lobby) return;
    io.to(Object.keys(lobby.players).join(',')).emit('chat', `${lobby.players[socket.id].name}: ${msg}`);
  });

  socket.on('invite', targetPseudo => {
    const lobby = Object.values(lobbies).find(l=>l.players[socket.id]);
    if(!lobby) return;
    const targetSocket = Object.values(io.sockets.sockets).find(s=>lobby.players[s.id]?.name === targetPseudo);
    if(targetSocket) targetSocket.emit('invite_received', { from: lobby.players[socket.id].name, roomId:Object.keys(lobbies).find(id=>lobbies[id]===lobby) });
  });

  socket.on('disconnect', () => {
    Object.values(lobbies).forEach(lobby => {
      if(lobby.players[socket.id]){
        delete lobby.players[socket.id];
        io.to(Object.keys(lobby.players).join(',')).emit('room_update', lobby);
      }
    });
    console.log(`❌ ${socket.id} disconnected`);
  });
});

// ----- Server start -----
const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`🚀 Server running on port ${PORT}`));
