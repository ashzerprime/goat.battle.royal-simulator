
// Simple WebSocket server using Express + Socket.IO
// Lightweight matchmaker: players join rooms, host starts match.
// This is example code for a small multiplayer prototype.
// IMPORTANT: This keeps state in memory (not persistent). For production, use DB and authoritative logic.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

let rooms = {}; // roomId -> { players: {socketId: {name, ready}}, host: socketId }

function makeRoomId() {
  return 'room-' + Math.random().toString(36).substring(2,9);
}

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('create_room', (data, cb) => {
    const roomId = makeRoomId();
    rooms[roomId] = { players: {}, host: socket.id };
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name: data?.name || 'Player', lives: 3 };
    socket.data.name = data?.name || 'Player';
    socket.data.room = roomId;
    console.log(`room ${roomId} created by ${socket.id}`);
    cb({ ok: true, roomId, host: true });
    io.to(roomId).emit('room_update', rooms[roomId]);
  });

  socket.on('join_room', (data, cb) => {
    const { roomId, name } = data || {};
    if (!roomId || !rooms[roomId]) return cb({ ok: false, error: 'Room not found' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name: name || 'Player', lives: 3 };
    socket.data.name = name || 'Player';
    socket.data.room = roomId;
    console.log(`${socket.id} joined ${roomId}`);
    cb({ ok: true, roomId, host: rooms[roomId].host === socket.id });
    io.to(roomId).emit('room_update', rooms[roomId]);
  });

  socket.on('leave_room', (data, cb) => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return cb?.({ ok:false });
    socket.leave(roomId);
    delete rooms[roomId].players[socket.id];
    if (rooms[roomId].host === socket.id) {
      // reassign host or close room
      const ids = Object.keys(rooms[roomId].players);
      if (ids.length > 0) rooms[roomId].host = ids[0];
      else delete rooms[roomId];
    }
    socket.data.room = null;
    io.to(roomId).emit('room_update', rooms[roomId] || {});
    cb?.({ ok: true });
  });

  socket.on('start_match', (data, cb) => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return cb?.({ ok:false });
    // simple: broadcast start event with match id
    io.to(roomId).emit('match_started', { matchId: 'match-' + Date.now(), time: Date.now() });
    cb?.({ ok: true });
  });

  socket.on('player_state', (data) => {
    // broadcast positions to room
    const roomId = socket.data.room;
    if (!roomId) return;
    const payload = { id: socket.id, state: data };
    socket.to(roomId).emit('player_state', payload);
  });

  socket.on('fire', (data) => {
    const roomId = socket.data.room;
    if (!roomId) return;
    // broadcast a fire event (e.g., bullet position & velocity)
    socket.to(roomId).emit('fire', { id: socket.id, fire: data });
  });

  socket.on('hit', (data) => {
    const roomId = socket.data.room;
    if (!roomId) return;
    // data: { targetId }
    io.to(roomId).emit('hit', { by: socket.id, target: data?.targetId });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.room;
    console.log('disconnect', socket.id);
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].players[socket.id];
      if (rooms[roomId].host === socket.id) {
        const ids = Object.keys(rooms[roomId].players);
        if (ids.length > 0) rooms[roomId].host = ids[0];
        else delete rooms[roomId];
      }
      io.to(roomId).emit('room_update', rooms[roomId] || {});
    }
  });
});

app.get('/', (req, res) => res.send('Goat Battle WebSocket server running.'));

server.listen(PORT, () => {
  console.log(`✅ Serveur en ligne sur le port ${PORT}`);
});

