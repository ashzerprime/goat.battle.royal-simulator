// server.js - Goat Battle Royale complet
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static('public')); // dossier public pour HTML/JS

// --- Stockage des salles ---
let rooms = {}; // roomId -> { host, players: {socketId: {...}}, projectiles: [], botInterval, physicsInterval }

// --- Helper ---
function generateId(prefix = 'id') {
  return prefix + '-' + Math.random().toString(36).substring(2, 9);
}

// --- Créer bots si nécessaire ---
function spawnBots(roomId, minPlayers = 4) {
  const room = rooms[roomId];
  if (!room) return;
  const realPlayers = Object.values(room.players).filter(p => !p.isBot).length;
  const total = Object.keys(room.players).length;
  const needed = Math.max(0, minPlayers - total);
  
  for (let i = 0; i < needed; i++) {
    const botId = generateId('bot');
    room.players[botId] = {
      id: botId,
      name: 'Bot' + Math.floor(Math.random()*1000),
      lives: 3,
      x: Math.random() * 800,
      y: Math.random() * 600,
      angle: Math.random() * Math.PI*2,
      color: `hsl(${Math.random()*360},70%,60%)`,
      isBot: true,
      lastFire: Date.now()
    };
  }
}

// --- Boucle bots ---
function botTick(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const now = Date.now();
  for (const id in room.players) {
    const p = room.players[id];
    if (!p.isBot) continue;
    // mouvement aléatoire
    p.x += Math.cos(p.angle) * (1 + Math.random());
    p.y += Math.sin(p.angle) * (1 + Math.random());
    if (Math.random() < 0.02) p.angle += (Math.random() - 0.5) * 1.5;

    // création projectile
    if (now - p.lastFire > 1000 + Math.random()*2000) {
      p.lastFire = now;
      room.projectiles.push({
        id: generateId('proj'),
        owner: id,
        x: p.x,
        y: p.y,
        vx: Math.cos(p.angle)*8,
        vy: Math.sin(p.angle)*8,
        life: 3000
      });
    }
  }
}

// --- Physics tick ---
function physicsTick(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const pr = room.projectiles[i];
    pr.x += pr.vx;
    pr.y += pr.vy;
    pr.life -= 100;
    if (pr.life <= 0 || pr.x < 0 || pr.y < 0 || pr.x > 800 || pr.y > 600) {
      room.projectiles.splice(i,1);
      continue;
    }

    // collision
    for (const pid in room.players) {
      if (pid === pr.owner) continue;
      const pl = room.players[pid];
      const dx = pl.x - pr.x;
      const dy = pl.y - pr.y;
      if (dx*dx + dy*dy <= 16*16) {
        pl.lives = Math.max(0, pl.lives - 1);
        room.projectiles.splice(i,1);
        if (pl.lives <= 0) {
          if (!pl.isBot) io.to(pid).emit('you_died');
          delete room.players[pid];
        }
        break;
      }
    }
  }

  // broadcast
  io.to(roomId).emit('room_update', room);
}

// --- Connexion client ---
io.on('connection', socket => {
  console.log('Connecté:', socket.id);

  socket.on('create_room', (data, cb) => {
    const roomId = generateId('room');
    rooms[roomId] = { host: socket.id, players: {}, projectiles: [] };
    socket.join(roomId);

    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: data?.name || 'Player',
      lives: 3,
      x: 400,
      y: 300,
      angle: 0,
      color: data?.color || '#ff0000',
      isBot: false
    };

    spawnBots(roomId);
    
    rooms[roomId].botInterval = setInterval(()=>botTick(roomId), 100);
    rooms[roomId].physicsInterval = setInterval(()=>physicsTick(roomId), 100);

    cb({ ok: true, roomId, host: true });
    io.to(roomId).emit('room_update', rooms[roomId]);
  });

  socket.on('join_room', (data, cb) => {
    const roomId = data?.roomId;
    if (!roomId || !rooms[roomId]) return cb({ ok:false, error:'Room not found' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: data?.name || 'Player',
      lives: 3,
      x: 400,
      y: 300,
      angle: 0,
      color: data?.color || '#00ff00',
      isBot: false
    };
    spawnBots(roomId);
    cb({ ok:true, host: rooms[roomId].host===socket.id });
    io.to(roomId).emit('room_update', rooms[roomId]);
  });

  socket.on('player_state', data => {
    const roomId = Object.keys(rooms).find(rid => rooms[rid].players[socket.id]);
    if (!roomId) return;
    const pl = rooms[roomId].players[socket.id];
    if (!pl) return;
    pl.x = data.x; pl.y = data.y; pl.angle = data.angle;
    pl.name = data.name; pl.color = data.color;
  });

  socket.on('fire', data => {
    const roomId = Object.keys(rooms).find(rid => rooms[rid].players[socket.id]);
    if (!roomId) return;
    const pl = rooms[roomId].players[socket.id];
    if (!pl) return;
    rooms[roomId].projectiles.push({
      id: generateId('proj'),
      owner: socket.id,
      x: data.x ?? pl.x,
      y: data.y ?? pl.y,
      vx: Math.cos(pl.angle)*9,
      vy: Math.sin(pl.angle)*9,
      life: 3000
    });
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].players[socket.id]) {
        delete rooms[rid].players[socket.id];
        io.to(rid).emit('room_update', rooms[rid]);
      }
    }
    console.log('Déconnecté:', socket.id);
  });
});

server.listen(PORT, () => console.log(`Serveur Socket.IO en ligne sur http://localhost:${PORT}`));
