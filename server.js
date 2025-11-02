const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {};

io.on('connection', socket=>{
  console.log('✅ Player connected',socket.id);

  socket.on('create_room',({name,color},callback)=>{
    const roomId=Math.random().toString(36).substring(2,8);
    rooms[roomId]={players:{},mode:'public'};
    rooms[roomId].players[socket.id]={name,color,kills:0};
    socket.join(roomId);
    callback({ok:true,roomId});
  });

  socket.on('invite',({target,roomId})=>{
    // implémenter notification réelle
    console.log(`${socket.id} invite ${target} to ${roomId}`);
  });

  socket.on('launch_game',({roomId,mode})=>{
    rooms[roomId].mode=mode;
    io.to(roomId).emit('match_started');
  });

  socket.on('player_state',data=>{
    for(const roomId in rooms){
      if(rooms[roomId].players[socket.id]){
        rooms[roomId].players[socket.id]=data;
        io.to(roomId).emit('room_update',rooms[roomId]);
      }
    }
  });

  socket.on('fire',data=>{
    for(const roomId in rooms){
      if(rooms[roomId].players[socket.id]){
        io.to(roomId).emit('projectile',data);
      }
    }
  });

  socket.on('chat',msg=>{
    for(const roomId in rooms){
      if(rooms[roomId].players[socket.id]){
        io.to(roomId).emit('chat',{name:rooms[roomId].players[socket.id].name,msg});
      }
    }
  });

  socket.on('disconnect',()=>{
    for(const roomId in rooms){
      if(rooms[roomId].players[socket.id]){
        delete rooms[roomId].players[socket.id];
        io.to(roomId).emit('room_update',rooms[roomId]);
      }
    }
  });
});

const PORT = process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Server listening on ${PORT}`));
