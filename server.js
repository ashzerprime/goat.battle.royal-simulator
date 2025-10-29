// server.js
// Node + Express + Socket.IO with simple bots, lives, projectiles and hit detection

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public')); // sert le front-end

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

let rooms = {}; // roomId -> { players: {socketId: {name, lives, x,y,angle,color,isBot}}, host, projectiles: [] }

function makeRoomId() {
  return 'room-' + Math.random().toString(36).substring(2,9);
}

// --- Bot helper ---
function makeBotId(roomId, idx) {
  return `bot-${roomId}-${idx}`;
}

function spawnBotsIfNeeded(roomId, minPlayers = 4) {
  const room = rooms[roomId];
  if (!room) return;
  const realCount = Object.values(room.players).filter(p => !p.isBot).length;
  let total = Object.keys(room.players).length;
  let needed = Math.max(0, minPlayers - total);
  for (let i = 0; i < needed; i++) {
    const botId = makeBotId(roomId, Date.now()+i);
    room.players[botId] = {
      name: 'Bot' + Math.floor(Math.random()*1000),
      lives: 3,
      x: Math.random()*800,
      y: Math.random()*600,
      angle: Math.random()*Math.PI*2,
      color: `hsl(${Math.random()*360},70%,60%)`,
      isBot: true,
      lastFire: Date.now()
    };
  }
  io.to(roomId).emit('room_update', room);
}

// Simple bot AI tick — move randomly and sometimes fire
function botTick(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const now = Date.now();
  for (const id of Object.keys(room.players)) {
    const p = room.players[id];
    if (!p || !p.isBot) continue;
    // random walk
    p.x += Math.cos(p.angle) * (1 + Math.random()*1.5);
    p.y += Math.sin(p.angle) * (1 + Math.random()*1.5);
    if (Math.random() < 0.02) p.angle += (Math.random()-0.5) * 1.5;
    // keep inside bounds
    p.x = Math.max(20, Math.min(780, p.x));
    p.y = Math.max(20, Math.min(580, p.y));
    // sometimes fire
    if (now - p.lastFire > 800 + Math.random()*1500) {
      p.lastFire = now;
      // create projectile
      const proj = {
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        owner: id,
        x: p.x,
        y: p.y,
        vx: Math.cos(p.angle) * 8,
        vy: Math.sin(p.angle) * 8,
        life: 3000 // ms
      };
      room.projectiles.push(proj);
    }
  }
}

function startBotInterval(roomId) {
  if (!rooms[roomId]) return;
  if (rooms[roomId].botInterval) return;
  rooms[roomId].botInterval = setInterval(() => {
    botTick(roomId);
  }, 100); // 10 ticks/s
}

// stop bot interval when room deleted
function stopBotInterval(roomId) {
  if (rooms[roomId] && rooms[roomId].botInterval) {
    clearInterval(rooms[roomId].botInterval);
    rooms[roomId].botInterval = null;
  }
}

// --- projectile / physics tick (server-side simple) ---
function startPhysicsTick(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.physicsInterval) return;
  room.physicsInterval = setInterval(() => {
    const now = Date.now();
    // advance projectiles
    for (let i = room.projectiles.length - 1; i >= 0; i--) {
      const pr = room.projectiles[i];
      pr.x += pr.vx;
      pr.y += pr.vy;
      pr.life -= 100;
      // bounds check
      if (pr.x < 0 || pr.y < 0 || pr.x > 800 || pr.y > 600 || pr.life <= 0) {
        room.projectiles.splice(i, 1);
        continue;
      }
      // collision detection (distance)
      for (const [pid, pl] of Object.entries(room.players)) {
        if (pid === pr.owner) continue; // don't hit owner
        if (!pl) continue;
        const dx = pl.x - pr.x;
        const dy = pl.y - pr.y;
        const dist2 = dx*dx + dy*dy;
        const r = 16; // hit radius
        if (dist2 <= r*r) {
          // hit!
          pl.lives = Math.max(0, (pl.lives||1) - 1);
          // remove projectile
          room.projectiles.splice(i, 1);
          io.to(roomId).emit('hit_effect', { x: pr.x, y: pr.y });
          // if lives zero handle death
          if (pl.lives <= 0) {
            // notify player if real
            if (!pl.isBot && io.sockets.sockets.get(pid)) {
              io.to(pid).emit('you_died');
            }
            // remove player from room
            delete room.players[pid];
            io.to(roomId).emit('player_killed', { id: pid, by: pr.owner });
          }
          break;
        }
      }
    }
    // broadcast updated state periodically
    io.to(roomId).emit('room_update', room);
  }, 100); // 10hz
}

function stopPhysicsTick(roomId) {
  if (rooms[roomId] && rooms[roomId].physicsInterval) {
    clearInterval(rooms[roomId].physicsInterval);
    rooms[roomId].physicsInterval = null;
  }
}

// cleanup function
function maybeCleanupRoom(roomId) {
  if (!rooms[roomId]) return;
  if (Object.keys(rooms[roomId].players).length === 0) {
    stopBotInterval(roomId);
    stopPhysicsTick(roomId);
    delete rooms[roomId];
  }
}

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('create_room', (data, cb) => {
    const roomId = makeRoomId();
    rooms[roomId] = {
      players: {},
      host: socket.id,
      projectiles: []
    };
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      name: data?.name || 'Player',
      lives: 3,
      x: 400 + Math.random()*80-40,
      y: 300 + Math.random()*80-40,
      angle: 0,
      color: data?.color || `hsl(${Math.random()*360},70%,60%)`,
      isBot: false
    };
    socket.data.name = data?.name || 'Player';
    socket.data.room = roomId;
    console.log(`room ${roomId} created by ${socket.id}`);
    cb({ ok: true, roomId, host: true });

    // spawn bots if needed and start ticks
    spawnBotsIfNeeded(roomId, 4);
    startBotInterval(roomId);
    startPhysicsTick(roomId);

    io.to(roomId).emit('room_update', rooms[roomId]);
  });

  socket.on('join_room', (data, cb) => {
    const { roomId, name, color } = data || {};
    if (!roomId || !rooms[roomId]) return cb({ ok: false, error: 'Room not found' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      name: name || 'Player',
      lives: 3,
      x: 400 + Math.random()*80-40,
      y: 300 + Math.random()*80-40,
      angle: 0,
      color: color || `hsl(${Math.random()*360},70%,60%)`,
      isBot: false
    };
    socket.data.name = name || 'Player';
    socket.data.room = roomId;
    console.log(`${socket.id} joined ${roomId}`);
    cb({ ok: true, roomId, host: rooms[roomId].host === socket.id });

    spawnBotsIfNeeded(roomId, 4);
    startBotInterval(roomId);
    startPhysicsTick(roomId);

    io.to(roomId).emit('room_update', rooms[roomId]);
  });

  socket.on('leave_room', (data, cb) => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return cb?.({ ok:false });
    socket.leave(roomId);
    delete rooms[roomId].players[socket.id];
    if (rooms[roomId].host === socket.id) {
      const ids = Object.keys(rooms[roomId].players);
      if (ids.length > 0) rooms[roomId].host = ids[0];
      else delete rooms[roomId];
    }
    socket.data.room = null;
    io.to(roomId).emit('room_update', rooms[roomId] || {});
    cb?.({ ok: true });
    maybeCleanupRoom(roomId);
  });

  socket.on('start_match', (data, cb) => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return cb?.({ ok:false });
    io.to(roomId).emit('match_started', { matchId: 'match-' + Date.now(), time: Date.now() });
    cb?.({ ok: true });
  });

  socket.on('player_state', (data) => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return;
    const pl = rooms[roomId].players[socket.id];
    if (!pl) return;
    // update player position/angle from client. Server trusts client here (simple prototype).
    pl.x = data.x || pl.x;
    pl.y = data.y || pl.y;
    pl.angle = data.angle || pl.angle;
    pl.name = data.name || pl.name;
    pl.color = data.color || pl.color;
  });

  socket.on('fire', (data) => {
    const roomId = socket.data.room;
    if (!roomId || !rooms[roomId]) return;
    const pl = rooms[roomId].players[socket.id];
    if (!pl) return;
    // create projectile from player's position/direction
    const speed = 9;
    const proj = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      owner: socket.id,
      x: data?.x ?? pl.x,
      y: data?.y ?? pl.y,
      vx: Math.cos(pl.angle) * speed,
      vy: Math.sin(pl.angle) * speed,
      life: 3000
    };
    rooms[roomId].projectiles.push(proj);
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
      maybeCleanupRoom(roomId);
    }
  });
});

// Route principale → sert le vrai jeu
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

server.listen(PORT, () => {
  console.log(`✅ Serveur en ligne sur le port ${PORT}`);
});


