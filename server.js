// server.js - Socket.IO server with invites + lobby & game chat
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

let rooms = {}; // roomId -> { host, players: { socketId: {name,color,x,y,angle,lives} }, mode }
let nameToSocket = {}; // name -> socketId (latest connected socket with that name)

// helpers
function makeRoomId() { return Math.random().toString(36).substr(2,6); }

io.on('connection', socket => {
  console.log('conn:', socket.id);

  // register user (called on create_room or join_room)
  socket.on('register', ({ name, color, preferredRoom }, cb) => {
    nameToSocket[name] = socket.id;
    socket.data.name = name;
    socket.data.color = color || '#ff9966';
    console.log('register', name, socket.id);
    cb?.({ ok: true });
  });

  // create room
  socket.on('create_room', ({ name, color, mode }, cb) => {
    const roomId = makeRoomId();
    rooms[roomId] = { host: socket.id, players: {}, mode: mode || 'private' };
    rooms[roomId].players[socket.id] = { name, color, x:0, z:0, angle:0, lives:3 };
    socket.join(roomId);
    socket.data.room = roomId;
    nameToSocket[name] = socket.id;
    socket.data.name = name;
    socket.data.color = color;
    console.log(`${name} created room ${roomId}`);
    io.to(roomId).emit('room_update', rooms[roomId]);
    cb?.({ ok: true, roomId });
  });

  // join existing room by id
  socket.on('join_room', ({ roomId, name, color }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb?.({ ok: false, error: 'Salle introuvable' });
    room.players[socket.id] = { name, color, x:0, z:0, angle:0, lives:3 };
    socket.join(roomId);
    socket.data.room = roomId;
    socket.data.name = name;
    socket.data.color = color;
    nameToSocket[name] = socket.id;
    io.to(roomId).emit('room_update', room);
    cb?.({ ok: true, roomId });
  });

  // invite: inviter sends targetName and roomId; server forwards to target socket
  socket.on('invite', ({ targetName }, cb) => {
    const fromName = socket.data.name;
    const roomId = socket.data.room; // inviter's room (if any)
    const targetSocketId = nameToSocket[targetName];
    if (!targetSocketId) {
      return cb?.({ ok:false, error:'Joueur introuvable / hors-ligne' });
    }
    // send invitation request to target
    io.to(targetSocketId).emit('invite_request', { fromName, roomId });
    cb?.({ ok:true });
  });

  // invite response: { fromName, roomId, accept }
  socket.on('invite_response', ({ fromName, roomId, accept }) => {
    const fromSocket = nameToSocket[fromName];
    if (!fromSocket) return;
    const responderName = socket.data.name || 'Unknown';
    // notify inviter
    io.to(fromSocket).emit('invite_response', { from: responderName, accept });
    if (accept) {
      // add invited player to room
      if (!rooms[roomId]) {
        // if room missing, inform
        io.to(socket.id).emit('invite_result', { ok:false, error:'Salle plus disponible' });
        return;
      }
      rooms[roomId].players[socket.id] = { name: responderName, color: socket.data.color || '#ff9966', x:0, z:0, angle:0, lives:3 };
      socket.join(roomId);
      socket.data.room = roomId;
      // Broadcast updated room
      io.to(roomId).emit('room_update', rooms[roomId]);
      io.to(socket.id).emit('joined_room', { roomId });
    }
  });

  // lobby chat (broadcast to room)
  socket.on('lobby_chat', ({ text }) => {
    const roomId = socket.data.room;
    if (!roomId) return;
    const name = socket.data.name || 'Invité';
    io.to(roomId).emit('lobby_chat', { name, text });
  });

  // game chat (in-game)
  socket.on('game_chat', ({ text }) => {
    const roomId = socket.data.room;
    if (!roomId) return;
    const name = socket.data.name || 'Invité';
    io.to(roomId).emit('game_chat', { name, text });
  });

  // start match (host)
  socket.on('start_match', ({ aiCount }) => {
    const roomId = socket.data.room;
    if (!rooms[roomId]) return;
    // spawn AI simple data to emit
    const ia = [];
    const needed = Math.max(0, (aiCount||4));
    for (let i=0;i<needed;i++){
      ia.push({ id: 'IA-'+Date.now()+Math.random().toString(36).slice(2,5), x: (Math.random()-0.5)*40, z: (Math.random()-0.5)*40, lives:3 });
    }
    io.to(roomId).emit('match_started', { IA: ia });
  });

  // player state updates (position, angle)
  socket.on('player_state', (state) => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return;
    if (!rooms[roomId].players[socket.id]) return;
    // merge
    rooms[roomId].players[socket.id] = { ...rooms[roomId].players[socket.id], ...state };
    // broadcast (rate-limit in real app)
    io.to(roomId).emit('room_update', rooms[roomId]);
  });

  // fire: broadcast so others can create bullets locally
  socket.on('fire', (data) => {
    const roomId = socket.data.room;
    if (!roomId) return;
    io.to(roomId).emit('fire', { shooter: socket.data.name || socket.id, ...data });
  });

  socket.on('disconnect', () => {
    // clean up nameToSocket entries pointing to this socket
    for (const name in nameToSocket) {
      if (nameToSocket[name] === socket.id) delete nameToSocket[name];
    }
    // remove from room
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players && room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomId).emit('room_update', room);
        // delete room if empty
        if (Object.keys(room.players).length === 0) delete rooms[roomId];
      }
    }
    console.log('disconnect', socket.id);
  });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
