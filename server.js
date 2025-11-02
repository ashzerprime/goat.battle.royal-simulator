const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

let rooms = {}; // roomId -> { players, host, projectiles, mode, countdown }

// Helper
function makeRoomId() {
  return 'room-' + Math.random().toString(36).substr(2, 8);
}

function spawnBots(room, minPlayers) {
  const realCount = Object.values(room.players).filter(p => !p.isBot).length;
  let total = Object.keys(room.players).length;
  let needed = Math.max(0, minPlayers - total);
  for (let i = 0; i < needed; i++) {
    const botId = `bot-${Date.now()}-${i}`;
    room.players[botId] = {
      name: 'Bot' + Math.floor(Math.random() * 1000),
      lives: 3,
      x: 100 + Math.random() * 600,
      y: 100 + Math.random() * 400,
      angle: Math.random() * Math.PI * 2,
      color: `hsl(${Math.random()*360},70%,60%)`,
      isBot: true,
      lastFire: Date.now()
    };
  }
}

function botTick(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const now = Date.now();
  for (const id in room.players) {
    const p = room.players[id];
    if (!p.isBot) continue;
    p.x += Math.cos(p.angle) * (1 + Math.random());
    p.y += Math.sin(p.angle) * (1 + Math.random());
    if (Math.random() < 0.02) p.angle += (Math.random() - 0.5) * 1.5;
    if (now - p.lastFire > 1000 + Math.random()*1000) {
      p.lastFire = now;
      room.projectiles.push({
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
        owner: id,
        x: p.x,
        y: p.y,
        vx: Math.cos(p.angle) * 8,
        vy: Math.sin(p.angle) * 8,
        life: 3000
      });
    }
  }
}

function startBotInterval(roomId) {
  const room = rooms[roomId];
  if (!room.botInterval) {
    room.botInterval = setInterval(() => botTick(roomId), 100);
  }
}

function startPhysics(roomId) {
  const room = rooms[roomId];
  if (!room.physicsInterval) {
    room.physicsInterval = setInterval(() => {
      room.projectiles.forEach((pr, i) => {
        pr.x += pr.vx; pr.y += pr.vy; pr.life -= 100;
        if (pr.life <= 0) room.projectiles.splice(i,1);
        for (const pid in room.players) {
          if (pid === pr.owner) continue;
          const pl = room.players[pid];
          const dx = pl.x - pr.x, dy = pl.y - pr.y;
          if (dx*dx + dy*dy <= 16*16) {
            pl.lives--;
            room.projectiles.splice(i,1);
            if (pl.lives <= 0) {
              io.to(pid).emit('you_died');
              delete room.players[pid];
            }
            break;
          }
        }
      });
      io.to(roomId).emit('room_update', room);
    }, 100);
  }
}

io.on('connection', socket => {
  console.log('connected', socket.id);

  socket.on('create_room', (data, cb) => {
    const roomId = makeRoomId();
    rooms[roomId] = {
      players: {},
      host: socket.id,
      projectiles: [],
      mode: 'public',
      countdown: 5
    };
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      name: data?.name || 'Player',
      lives: 3,
      x: 400, y: 300,
      angle: 0,
      color: data?.color || '#ff9966',
      isBot: false
    };
    cb({ ok: true, roomId });
    spawnBots(rooms[roomId], 4);
    startBotInterval(roomId);
    startPhysics(roomId);
  });

  socket.on('join_room', (data, cb) => {
    const room = rooms[data.roomId];
    if (!room) return cb({ ok: false, error: 'Room not found' });
    socket.join(data.roomId);
    room.players[socket.id] = {
      name: data?.name || 'Player',
      lives: 3,
      x: 400, y: 300,
      angle: 0,
      color: data?.color || '#ff9966',
      isBot: false
    };
    cb({ ok: true });
    spawnBots(room, 4);
    startBotInterval(data.roomId);
    startPhysics(data.roomId);
  });

  socket.on('player_state', data => {
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;
    const pl = rooms[roomId].players[socket.id];
    if (pl) Object.assign(pl, data);
  });

  socket.on('fire', data => {
    const roomId = Object.keys(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;
    const room = rooms[roomId];
    const pl = room.players[socket.id];
    if (!pl) return;
    room.projectiles.push({
      id: `proj-${Date.now()}`,
      owner: socket.id,
      x: data?.x ?? pl.x,
      y: data?.y ?? pl.y,
      vx: Math.cos(pl.angle)*9,
      vy: Math.sin(pl.angle)*9,
      life: 3000
    });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomId).emit('room_update', room);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
