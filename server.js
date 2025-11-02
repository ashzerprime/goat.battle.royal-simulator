// server.js — Goat Battle Royale backend

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// servir les fichiers du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// --- Données en mémoire ---
let rooms = {}; // { roomId: { host, players: {} } }

// --- Fonctions utiles ---
function createRoom(socket, data) {
  const roomId = Math.random().toString(36).substring(2, 8);
  rooms[roomId] = {
    host: socket.id,
    players: {
      [socket.id]: {
        id: socket.id,
        name: data.name || 'Chèvre',
        color: data.color || '#ff9966',
        x: 400,
        y: 300,
        angle: 0,
        lives: 3
      }
    }
  };
  socket.join(roomId);
  io.to(roomId).emit('room_update', rooms[roomId]);
  socket.emit('room_created', { ok: true, roomId, host: true });
  console.log(`✅ Nouvelle salle ${roomId} créée par ${data.name}`);
}

function joinRoom(socket, roomId, name, color) {
  const room = rooms[roomId];
  if (!room) return socket.emit('error_msg', 'Salle introuvable');
  room.players[socket.id] = {
    id: socket.id,
    name,
    color,
    x: 100 + Math.random() * 600,
    y: 100 + Math.random() * 400,
    angle: 0,
    lives: 3
  };
  socket.join(roomId);
  io.to(roomId).emit('room_update', room);
  console.log(`👥 ${name} a rejoint ${roomId}`);
}

// --- Gestion des connexions Socket.IO ---
io.on('connection', (socket) => {
  console.log('🟢 Client connecté', socket.id);

  socket.on('create_room', (data, callback) => {
    createRoom(socket, data);
    if (callback) callback({ ok: true });
  });

  socket.on('join_room', ({ roomId, name, color }) => {
    joinRoom(socket, roomId, name, color);
  });

  socket.on('player_state', (data) => {
    for (const r in rooms) {
      if (rooms[r].players[socket.id]) {
        Object.assign(rooms[r].players[socket.id], data);
        io.to(r).emit('room_update', rooms[r]);
      }
    }
  });

  socket.on('fire', (data) => {
    for (const r in rooms) {
      if (rooms[r].players[socket.id]) {
        io.to(r).emit('explosion', { x: data.x, y: data.y });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Déconnexion', socket.id);
    for (const r in rooms) {
      const room = rooms[r];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) delete rooms[r];
        else io.to(r).emit('room_update', room);
      }
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Serveur lancé sur ${PORT}`));
