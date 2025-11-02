// server.js - final multi-lobby with invites, AI, projectiles, collisions (simple)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const io = new Server(server, { /* CORS allowed by default for local */ });

const PORT = process.env.PORT || 3000;
const ENCLOSE_RADIUS = 900;

const rooms = {}; // roomId -> { host, players: { socketId: playerObj }, mode, aiCount, started }

// helper for random spawn
function randomSpawn() {
  return { x: Math.random()*600 - 300, z: Math.random()*600 - 300 };
}

io.on('connection', socket => {
  console.log('client connected', socket.id);

  // register user name -> store minimal info
  socket.on('register', ({ name }) => {
    socket.data.name = name || ('Player' + Math.floor(Math.random()*1000));
  });

  socket.on('create_room', (data, cb) => {
    const roomId = Math.random().toString(36).substring(2,8);
    rooms[roomId] = { host: socket.id, players: {}, mode: data.mode || 'public', aiCount: data.aiCount || 5, started:false };
    // add host player
    const spawn = randomSpawn();
    rooms[roomId].players[socket.id] = {
      id: socket.id, name: data.name || socket.data.name || 'Host', color: data.color || '#ff9966', x: spawn.x, z: spawn.z, angle:0, lives:3, kills:0, isAI:false
    };
    socket.join(roomId);
    cb && cb({ ok:true, roomId, room: rooms[roomId] });
    io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players });
  });

  socket.on('join_room', ({ roomId, name, color }, cb) => {
    if(!rooms[roomId]) return cb && cb({ ok:false, error:'Room not found' });
    const spawn = randomSpawn();
    rooms[roomId].players[socket.id] = { id: socket.id, name: name || socket.data.name, color: color || '#cccccc', x: spawn.x, z: spawn.z, angle:0, lives:3, kills:0, isAI:false };
    socket.join(roomId);
    cb && cb({ ok:true, roomId, room: rooms[roomId] });
    io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players });
  });

  socket.on('invite', ({ target, from })=>{
    // find socket with that name in all connected sockets (simple linear search)
    for(const [sid, s] of io.sockets.sockets){
      if(s.data && s.data.name && s.data.name.toLowerCase() === target.toLowerCase()){
        s.emit('invited', { from, roomId: Object.keys(socket.rooms).find(r=>r !== socket.id) || null });
        return;
      }
    }
    // if not found, ignore or store pending invites (not implemented)
  });

  socket.on('accept_invite', ({ roomId })=>{
    // join the room
    if(!rooms[roomId]) return;
    const spawn = randomSpawn();
    rooms[roomId].players[socket.id] = { id: socket.id, name: socket.data.name || 'Player', color:'#cccccc', x: spawn.x, z: spawn.z, angle:0, lives:3, kills:0, isAI:false };
    socket.join(roomId);
    io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players });
  });

  socket.on('decline_invite', ({ roomId })=>{
    // nothing for now
  });

  socket.on('start_match', ({ roomId, mode, aiCount })=>{
    // if called by host, start match; otherwise ignore
    if(!rooms[roomId]) return;
    if(rooms[roomId].host !== socket.id) return;
    rooms[roomId].started = true;
    // spawn AIs to fill up if needed
    const need = (aiCount||rooms[roomId].aiCount) - Object.values(rooms[roomId].players).filter(p=>p.isAI).length;
    for(let i=0;i<Math.max(0, need); i++){
      const id = 'ai_' + Date.now() + '_' + i;
      const spawn = randomSpawn();
      rooms[roomId].players[id] = { id, name: 'IA'+i, color: '#888888', x: spawn.x, z: spawn.z, angle:0, lives:3, kills:0, isAI:true };
    }
    io.to(roomId).emit('match_started', { roomId, players: rooms[roomId].players });
    // send initial state
    io.to(roomId).emit('initial_state', { roomId, players: rooms[roomId].players });
  });

  socket.on('player_state', ({ roomId, x, z, angle, name, color })=>{
    if(!rooms[roomId]) return;
    if(!rooms[roomId].players[socket.id]) return;
    const p = rooms[roomId].players[socket.id];
    p.x = x; p.z = z; p.angle = angle; p.name = name || p.name; p.color = color || p.color;
    // enforce enclosure
    const dist = Math.hypot(p.x, p.z);
    if(dist > ENCLOSE_RADIUS){
      const a = Math.atan2(p.z, p.x);
      p.x = Math.cos(a) * ENCLOSE_RADIUS;
      p.z = Math.sin(a) * ENCLOSE_RADIUS;
    }
    io.to(roomId).emit('room_update', { roomId, players: rooms[roomId].players });
  });

  socket.on('fire', ({ roomId, x, z, angle, shooterName })=>{
    if(!rooms[roomId]) return;
    // create projectile server-side and broadcast spawn
    const speed = 60; // units per second
    const vx = Math.cos(angle) * speed;
    const vz = Math.sin(angle) * speed;
    const proj = { id: 'proj_' + Date.now() + '_' + Math.floor(Math.random()*1000), x, z, vx, vz, shooterName, life: 3000 };
    io.to(roomId).emit('projectile_spawn', { id: proj.id, x: proj.x, z: proj.z, vx, vz, shooterName });
    // simple server-side tick: move and detect hits (naive)
    const tick = setInterval(()=>{
      proj.x += proj.vx * 0.05;
      proj.z += proj.vz * 0.05;
      proj.life -= 50;
      // collision check with players
      for(const pid in rooms[roomId].players){
        const pl = rooms[roomId].players[pid];
        if(pl.isAI === true && pl.lives<=0) continue;
        const dx = pl.x - proj.x, dz = pl.z - proj.z;
        if(Math.hypot(dx,dz) < 20){
          // hit
          pl.lives = Math.max(0, (pl.lives||1) - 1);
          io.to(roomId).emit('player_hit', { targetId: pid, by: proj.shooterName });
          io.to(roomId).emit('projectile_hit', { id: proj.id, x: proj.x, z: proj.z });
          clearInterval(tick);
          return;
        }
      }
      if(proj.life <= 0){
        // expire
        io.to(roomId).emit('projectile_end', { id: proj.id });
        clearInterval(tick);
      }
    }, 50);
  });

  socket.on('chat', ({ roomId, text })=>{
    if(!rooms[roomId]) return;
    const name = (rooms[roomId].players[socket.id] && rooms[roomId].players[socket.id].name) || socket.data.name || 'Player';
    io.to(roomId).emit('chat_broadcast', { from: name, text });
  });

  socket.on('disconnect', ()=>{
    // remove player from any room
    for(const r in rooms){
      if(rooms[r].players[socket.id]){
        delete rooms[r].players[socket.id];
        io.to(r).emit('room_update', { roomId: r, players: rooms[r].players });
      }
    }
  });
});

server.listen(PORT, ()=> console.log('Server listening on', PORT));
