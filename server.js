// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

let rooms = {}; // roomId -> { players, host, projectiles }

function makeRoomId() {
  return 'room-' + Math.random().toString(36).substring(2, 8);
}

function spawnBotsIfNeeded(roomId, minPlayers = 4) {
  const room = rooms[roomId];
  if (!room) return;
  const realCount = Object.values(room.players).filter(p => !p.isBot).length;
  let total = Object.keys(room.players).length;
  let needed = Math.max(0, minPlayers - total);
  for (let i = 0; i < needed; i++) {
    const botId = 'bot-' + Date.now() + '-' + i;
    room.players[botId] = {
      name: 'Bot' + Math.floor(Math.random() * 1000),
      lives: 3,
      x: Math.random() * 800,
      y: Math.random() * 600,
      angle: Math.random() * Math.PI * 2,
      color: `hsl(${Math.random() * 360},70%,60%)`,
      isBot: true,
      lastFire: Date.now()
    };
  }
  io.to(roomId).emit('room_update', room);
}

function botTick(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const now = Date.now();
  for (const id of Object.keys(room.players)) {
    const p = room.players[id];
    if (!p.isBot) continue;
    // Mouvement aléatoire
    p.x += Math.cos(p.angle) * (1 + Math.random());
    p.y += Math.sin(p.angle) * (1 + Math.random());
    if (Math.random() < 0.02) p.angle += (Math.random() - 0.5) * 1.5;
    // bornes
    p.x = Math.max(20, Math.min(780, p.x));
    p.y = Math.max(20, Math.min(580, p.y));
    // tirs aléatoires
    if (now - p.lastFire > 1000 + Math.random() * 2000) {
      p.lastFire = now;
      const proj = {
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        owner: id,
        x: p.x,
        y: p.y,
        vx: Math.cos(p.angle) * 8,
        vy: Math.sin(p.angle) * 8,
        life: 3000
      };
      room.projectiles.push(proj);
    }
  }
}

function startBotInterval(roomId) {
  if (!rooms[roomId]) return;
  if (rooms[roomId].botInterval) return;
  rooms[roomId].botInterval = setInterval(() => botTick(roomId), 100);
}

function startPhysics(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.physicsInterval) return;
  room.physicsInterval = setInterval(() => {
    const now = Date.now();
    for (let i = room.projectiles.length - 1; i >= 0; i--) {
      const pr = room.projectiles[i];
      pr.x += pr.vx;
      pr.y += pr.vy;
      pr.life -= 100;
      if (pr.x < 0 || pr.y < 0 || pr.x > 800 || pr.y > 600 || pr.life <= 0) {
        room.projectiles.splice(i, 1);
        continue;
      }
      for (const pid in room.players) {
        if (pid === pr.owner) continue;
        const pl = room.players[pid];
        const dx = pl.x - pr.x;
        const dy = pl.y - pr.y;
        if (dx * dx + dy * dy <= 16 * 16) {
          pl.lives = Math.max(0, pl.lives - 1);
          room.projectiles.splice(i, 1);
          io.to(roomId).emit('hit_effect', { x: pr.x, y: pr.y });
          if (pl.lives <= 0) {
            if (!pl.isBot && io.sockets.sockets.get(pid)) {
              io.to(pid).emit('you_died');
            }
            delete room.players[pid];
            io.to(roomId).emit('player_killed', { id: pid, by: pr.owner });
          }
          break;
        }
      }
    }
    io.to(roomId).emit('room_update', room);
  }, 100);
}

function cleanupRoom(roomId) {
  if (!rooms[roomId]) return;
  if (Object.keys(rooms[roomId].players).length === 0) {
    clearInterval(rooms[roomId].botInterval);
    clearInterval(rooms[roomId].physicsInterval);
    delete rooms[roomId];
  }
}

io.on('connection', socket => {
  console.log('Connecté:', socket.id);

  socket.on('create_room', (data, cb) => {
    const roomId = makeRoomId();
    rooms[roomId] = { players: {}, host: socket.id, projectiles: [] };
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      name: data.name || 'Player',
      lives: 3,
      x: 400 + Math.random() * 80 - 40,
      y: 300 + Math.random() * 80 - 40,
      angle: 0,
      color: data.color || `hsl(${Math.random() * 360},70%,60%)`,
      isBot: false
    };
    socket.data.room = roomId;
    cb({ ok: true, roomId, host: true });

    spawnBotsIfNeeded(roomId, 4);
    startBotInterval(roomId);
    startPhysics(roomId);
  });

  socket.on('join_room', (data, cb) => {
    const { roomId, name, color } = data;
    if (!roomId || !rooms[roomId]) return cb({ ok: false, error: 'Room not found' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      name: name || 'Player',
      lives: 3,
      x: 400 + Math.random() * 80 - 40,
      y: 300 + Math.random() * 80 - 40,
      angle: 0,
      color: color || `hsl(${Math.random() * 360},70%,60%)`,
      isBot: false
    };
    socket.data.room = roomId;
    cb({ ok: true, roomId, host: rooms[roomId].host === socket.id });

    spawnBotsIfNeeded(roomId, 4);
    startBotInterval(roomId);
    startPhysics(roomId);
  });

  socket.on('player_state', data => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return;
    const pl = rooms[roomId].players[socket.id];
    if (!pl) return;
    pl.x = data.x;
    pl.y = data.y;
    pl.angle = data.angle;
    pl.name = data.name;
    pl.color = data.color;
  });

  socket.on('fire', data => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return;
    const pl = rooms[roomId].players[socket.id];
    if (!pl) return;
    const proj = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      owner: socket.id,
      x: data.x ?? pl.x,
      y: data.y ?? pl.y,
      vx: Math.cos(pl.angle) * 9,
      vy: Math.sin(pl.angle) * 9,
      life: 3000
    };
    rooms[roomId].projectiles.push(proj);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.room;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].players[socket.id];
      io.to(roomId).emit('room_update', rooms[roomId]);
      cleanupRoom(roomId);
    }
  });
});

server.listen(PORT, () => console.log(`✅ Serveur en ligne sur ${PORT}`));
