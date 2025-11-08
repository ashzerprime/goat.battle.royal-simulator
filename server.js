// server.js (CommonJS) - VERSION CORRIGÉE
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

let rooms = {}; 
let nameToSocket = {}; 

function makeRoomId() {
  return Math.random().toString(36).substr(2,6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('✅ Nouveau joueur connecté:', socket.id);

  socket.on('create_room', ({ name, color, mode }, cb) => {
    try {
      const roomId = makeRoomId();
      rooms[roomId] = { 
        host: socket.id, 
        players: {},
        mode: mode || 'public',
        started: false
      };
      rooms[roomId].players[socket.id] = { 
        name, 
        color, 
        x: 0, 
        z: 0, 
        angle: 0 
      };
      socket.join(roomId);
      socket.data.name = name;
      socket.data.color = color;
      socket.data.roomId = roomId;
      nameToSocket[name] = socket.id;
      
      console.log(`🎮 Salle créée: ${roomId} par ${name}`);
      
      socket.emit('joined_room', { roomId, isHost: true });
      io.to(roomId).emit('room_update', { 
        roomId, 
        host: rooms[roomId].host, 
        players: rooms[roomId].players 
      });
      
      if (cb) cb({ ok: true, roomId });
    } catch (error) {
      console.error('❌ Erreur création salle:', error);
      if (cb) cb({ ok: false, error: 'Erreur serveur' });
    }
  });

  socket.on('join_room', ({ roomId, name, color }, cb) => {
    try {
      const room = rooms[roomId];
      if (!room) {
        console.log(`❌ Salle ${roomId} introuvable`);
        return cb ? cb({ ok: false, error: 'Salle introuvable' }) : null;
      }
      if (room.started) {
        return cb ? cb({ ok: false, error: 'Partie déjà commencée' }) : null;
      }
      
      room.players[socket.id] = { name, color, x: 0, z: 0, angle: 0 };
      socket.join(roomId);
      socket.data.name = name;
      socket.data.color = color;
      socket.data.roomId = roomId;
      nameToSocket[name] = socket.id;
      
      console.log(`➕ ${name} a rejoint la salle ${roomId}`);
      
      socket.emit('joined_room', { roomId, isHost: room.host === socket.id });
      io.to(roomId).emit('room_update', { 
        roomId, 
        host: room.host, 
        players: room.players 
      });
      
      if (cb) cb({ ok: true, roomId });
    } catch (error) {
      console.error('❌ Erreur rejoindre salle:', error);
      if (cb) cb({ ok: false, error: 'Erreur serveur' });
    }
  });

  socket.on('invite', ({ targetName }, cb) => {
    const target = nameToSocket[targetName];
    if (!target) {
      console.log(`❌ Joueur ${targetName} introuvable`);
      return cb ? cb({ ok: false, error: 'Joueur hors ligne' }) : null;
    }
    const roomId = socket.data.roomId;
    if (!roomId) {
      return cb ? cb({ ok: false, error: 'Vous n\'êtes pas dans une salle' }) : null;
    }
    
    io.to(target).emit('invite_request', { 
      fromName: socket.data.name || '???', 
      roomId 
    });
    console.log(`📨 Invitation envoyée de ${socket.data.name} à ${targetName}`);
    
    if (cb) cb({ ok: true });
  });

  socket.on('invite_response', ({ fromName, roomId, accept }) => {
    const fromSocket = nameToSocket[fromName];
    if (fromSocket) {
      io.to(fromSocket).emit('invite_response', { 
        from: socket.data.name || '??', 
        accept 
      });
    }
    if (accept && rooms[roomId]) {
      const room = rooms[roomId];
      room.players[socket.id] = { 
        name: socket.data.name || 'Invité', 
        color: socket.data.color || '#ff9966', 
        x: 0, 
        z: 0, 
        angle: 0 
      };
      socket.join(roomId);
      socket.data.roomId = roomId;
      io.to(roomId).emit('room_update', { 
        roomId, 
        host: room.host, 
        players: room.players 
      });
      socket.emit('joined_room', { roomId, isHost: false });
      console.log(`✅ ${socket.data.name} a accepté l'invitation pour ${roomId}`);
    }
  });

  socket.on('lobby_chat', ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const name = socket.data.name || 'Invité';
    console.log(`💬 [${roomId}] ${name}: ${text}`);
    io.to(roomId).emit('lobby_chat', { name, text });
  });

  socket.on('player_state', (state) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      rooms[roomId].players[socket.id] = { 
        ...rooms[roomId].players[socket.id], 
        ...state 
      };
      // Broadcast aux autres joueurs (pas à soi-même)
      socket.to(roomId).emit('player_update', {
        playerId: socket.id,
        state: rooms[roomId].players[socket.id]
      });
    }
  });

  socket.on('start_match', ({ aiCount }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) {
      console.log(`❌ ${socket.data.name} n'est pas l'hôte`);
      return;
    }
    
    room.started = true;
    const IA = [];
    const count = aiCount || 6;
    for (let i = 0; i < count; i++) {
      IA.push({ 
        id: `IA-${Date.now()}-${i}`, 
        x: (Math.random()-0.5)*80, 
        z: (Math.random()-0.5)*80, 
        lives: 3 
      });
    }
    
    console.log(`🎯 Partie lancée dans ${roomId} avec ${count} IA`);
    io.to(roomId).emit('match_started', { IA });
  });

  socket.on('fire', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('fire', { 
      shooter: socket.id,
      shooterName: socket.data.name || socket.id, 
      x: data.x, 
      y: data.y, 
      z: data.z, 
      dir: data.dir 
    });
  });

  socket.on('leave_room', (_, cb) => {
    const roomId = socket.data.roomId;
    if (!roomId) return cb?.();
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      const name = room.players[socket.id].name;
      delete room.players[socket.id];
      socket.leave(roomId);
      console.log(`👋 ${name} a quitté ${roomId}`);
      io.to(roomId).emit('room_update', { 
        roomId, 
        host: room.host, 
        players: room.players 
      });
      if (Object.keys(room.players).length === 0) {
        console.log(`🗑️ Salle ${roomId} supprimée (vide)`);
        delete rooms[roomId];
      }
    }
    socket.data.roomId = null;
    cb?.();
  });

  socket.on('disconnect', () => {
    console.log('❌ Déconnexion:', socket.id);
    
    // Cleanup mapping
    for (const name in nameToSocket) {
      if (nameToSocket[name] === socket.id) {
        delete nameToSocket[name];
      }
    }
    
    // Remove from rooms
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      if (room.players && room.players[socket.id]) {
        const pname = room.players[socket.id].name;
        delete room.players[socket.id];
        console.log(`👋 ${pname} déconnecté de ${roomId}`);
        io.to(roomId).emit('room_update', { 
          roomId, 
          host: room.host, 
          players: room.players 
        });
        if (Object.keys(room.players).length === 0) {
          console.log(`🗑️ Salle ${roomId} supprimée (vide)`);
          delete rooms[roomId];
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`
🐐 ========================================
   GOAT BATTLE ROYALE SERVEUR DÉMARRÉ
   http://localhost:${PORT}
========================================
  `);
});

// Gestion des erreurs
process.on('uncaughtException', (err) => {
  console.error('💥 Erreur non gérée:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Promesse rejetée:', reason);
});
