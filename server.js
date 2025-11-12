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

// Liste de mots interdits (NSFW, nazi, raciste, etc.)
const FORBIDDEN_WORDS = [
  'nazi', 'hitler', 'kkk', 'nigger', 'nigga', 'fuck', 'shit', 'porn',
  'sex', 'dick', 'pussy', 'cunt', 'bitch', 'retard', 'fag', 'faggot',
  'ass', 'asshole', 'bastard', 'whore', 'slut', 'rape', 'kill', 'murder'
];

function containsForbiddenWord(text) {
  const lower = text.toLowerCase();
  return FORBIDDEN_WORDS.some(word => lower.includes(word));
}

function makeRoomId() {
  return Math.random().toString(36).substr(2,6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('✅ Nouveau joueur connecté:', socket.id);

  socket.on('create_room', ({ name, color, mode }, cb) => {
    try {
      if (containsForbiddenWord(name)) {
        return cb({ ok: false, error: 'Username contains inappropriate content. Please choose a different name.' });
      }

      const roomId = makeRoomId();
      rooms[roomId] = { 
        host: socket.id, 
        players: {},
        mode: mode || 'public',
        started: false,
        startTime: null
      };
      rooms[roomId].players[socket.id] = { 
        name, 
        color, 
        x: 0, 
        z: 0, 
        angle: 0,
        kills: 0,
        deaths: 0
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
      if (cb) cb({ ok: false, error: 'Server error' });
    }
  });

  socket.on('join_room', ({ roomId, name, color }, cb) => {
    try {
      if (containsForbiddenWord(name)) {
        return cb({ ok: false, error: 'Username contains inappropriate content. Please choose a different name.' });
      }

      const room = rooms[roomId];
      if (!room) {
        console.log(`❌ Salle ${roomId} introuvable`);
        return cb ? cb({ ok: false, error: 'Room not found' }) : null;
      }
      if (room.started) {
        return cb ? cb({ ok: false, error: 'Match already started' }) : null;
      }
      
      room.players[socket.id] = { name, color, x: 0, z: 0, angle: 0, kills: 0, deaths: 0 };
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
      if (cb) cb({ ok: false, error: 'Server error' });
    }
  });

  socket.on('invite', ({ targetName }, cb) => {
    const target = nameToSocket[targetName];
    if (!target) {
      console.log(`❌ Joueur ${targetName} introuvable`);
      return cb ? cb({ ok: false, error: 'Player offline' }) : null;
    }
    const roomId = socket.data.roomId;
    if (!roomId) {
      return cb ? cb({ ok: false, error: 'You are not in a room' }) : null;
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
      io.to(fromSocket).emit('invite_accepted', { 
        from: socket.data.name || '??', 
        accept 
      });
    }
    if (accept && rooms[roomId]) {
      const room = rooms[roomId];
      if (!room.started) {
        room.players[socket.id] = { 
          name: socket.data.name || 'Guest', 
          color: socket.data.color || '#ff9966', 
          x: 0, 
          z: 0, 
          angle: 0,
          kills: 0,
          deaths: 0
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
    }
  });

  socket.on('lobby_chat', ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const name = socket.data.name || 'Guest';
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
    room.startTime = Date.now();
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

    // Timer de 5 minutes
    setTimeout(() => {
      endMatch(roomId);
    }, 5 * 60 * 1000);
  });

  socket.on('player_kill', ({ killerId, victimId }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    
    if (room.players[killerId]) {
      room.players[killerId].kills = (room.players[killerId].kills || 0) + 1;
    }
    if (room.players[victimId]) {
      room.players[victimId].deaths = (room.players[victimId].deaths || 0) + 1;
    }
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
      dir: data.dir,
      weapon: data.weapon
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
    
    for (const name in nameToSocket) {
      if (nameToSocket[name] === socket.id) {
        delete nameToSocket[name];
      }
    }
    
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

function endMatch(roomId) {
  const room = rooms[roomId];
  if (!room || !room.started) return;

  const stats = Object.keys(room.players).map(pid => ({
    id: pid,
    name: room.players[pid].name,
    kills: room.players[pid].kills || 0,
    deaths: room.players[pid].deaths || 0
  })).sort((a, b) => b.kills - a.kills);

  console.log(`🏁 Match terminé dans ${roomId}`);
  io.to(roomId).emit('match_ended', { stats });

  room.started = false;
  room.startTime = null;
  Object.keys(room.players).forEach(pid => {
    room.players[pid].kills = 0;
    room.players[pid].deaths = 0;
  });
}

server.listen(PORT, () => {
  console.log(`
🐐 ========================================
   GOAT BATTLE ROYALE SERVEUR DÉMARRÉ
   http://localhost:${PORT}
========================================
  `);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Erreur non gérée:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Promesse rejetée:', reason);
});
