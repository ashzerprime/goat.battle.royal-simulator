// server.js (CommonJS) - final pour ton projet
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

let rooms = {}; // roomId -> { host, players: { socketId: { name,color,x,z,angle } } }
let nameToSocket = {}; // pseudo -> socketId

function makeRoomId() {
  return Math.random().toString(36).substr(2,6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('create_room', ({ name, color, mode }, cb) => {
    const roomId = makeRoomId();
    rooms[roomId] = { host: socket.id, players: {} };
    rooms[roomId].players[socket.id] = { name, color, x: 0, z: 0, angle: 0 };
    socket.join(roomId);
    socket.data.name = name;
    socket.data.color = color;
    nameToSocket[name] = socket.id;
    socket.emit('joined_room', { roomId, isHost: true });
    io.to(roomId).emit('room_update', { roomId, host: rooms[roomId].host, players: rooms[roomId].players });
    if (cb) cb({ ok: true, roomId });
  });

  socket.on('join_room', ({ roomId, name, color }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb ? cb({ ok: false, error: 'Salle introuvable' }) : null;
    room.players[socket.id] = { name, color, x: 0, z: 0, angle: 0 };
    socket.join(roomId);
    socket.data.name = name;
    socket.data.color = color;
    nameToSocket[name] = socket.id;
    socket.emit('joined_room', { roomId, isHost: room.host === socket.id });
    io.to(roomId).emit('room_update', { roomId, host: room.host, players: room.players });
    if (cb) cb({ ok: true, roomId });
  });

  socket.on('invite', ({ targetName }, cb) => {
    const target = nameToSocket[targetName];
    if (!target) return cb ? cb({ ok: false, error: 'Joueur hors ligne' }) : null;
    // find inviter's room
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    io.to(target).emit('invite_request', { fromName: socket.data.name || '???', roomId });
    if (cb) cb({ ok: true });
  });

  socket.on('invite_response', ({ fromName, roomId, accept }) => {
    const fromSocket = nameToSocket[fromName];
    if (fromSocket) io.to(fromSocket).emit('invite_response', { from: socket.data.name || '??', accept });
    if (accept && rooms[roomId]) {
      rooms[roomId].players[socket.id] = { name: socket.data.name || 'Invité', color: socket.data.color || '#ff9966', x:0, z:0, angle:0 };
      socket.join(roomId);
      socket.data.room = roomId;
      io.to(roomId).emit('room_update', { roomId, host: rooms[roomId].host, players: rooms[roomId].players });
      io.to(socket.id).emit('joined_room', { roomId, isHost: false });
    }
  });

  socket.on('lobby_chat', ({ text }) => {
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;
    const name = socket.data.name || 'Invité';
    io.to(roomId).emit('lobby_chat', { name, text });
  });

  socket.on('player_state', (state) => {
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      rooms[roomId].players[socket.id] = { ...rooms[roomId].players[socket.id], ...state };
      // broadcast
      io.to(roomId).emit('room_update', { roomId, host: rooms[roomId].host, players: rooms[roomId].players });
    }
  });

  socket.on('start_match', ({ aiCount }) => {
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return; // only host
    // prepare IA list
    const IA = [];
    for (let i = 0; i < (aiCount || 6); i++) {
      IA.push({ id: `IA-${Date.now()}-${i}`, x: (Math.random()-0.5)*80, z: (Math.random()-0.5)*80, lives: 3 });
    }
    io.to(roomId).emit('match_started', { IA });
  });

  socket.on('fire', (data) => {
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;
    io.to(roomId).emit('fire', { shooter: socket.data.name || socket.id, x: data.x, y: data.y, z: data.z, dir: data.dir });
  });

  socket.on('leave_room', (_, cb) => {
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return cb?.();
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      const name = room.players[socket.id].name;
      delete room.players[socket.id];
      socket.leave(roomId);
      io.to(roomId).emit('room_update', { roomId, host: room.host, players: room.players });
      if (Object.keys(room.players).length === 0) delete rooms[roomId];
    }
    cb?.();
  });

  socket.on('disconnect', () => {
    // cleanup mapping
    for (const name in nameToSocket) if (nameToSocket[name] === socket.id) delete nameToSocket[name];
    // remove from rooms
    for (const roomId in rooms) {
      if (rooms[roomId].players && rooms[roomId].players[socket.id]) {
        const pname = rooms[roomId].players[socket.id].name;
        delete rooms[roomId].players[socket.id];
        io.to(roomId).emit('room_update', { roomId, host: rooms[roomId].host, players: rooms[roomId].players });
        if (Object.keys(rooms[roomId].players).length === 0) delete rooms[roomId];
      }
    }
  });

});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
