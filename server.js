const express=require('express');
const app=express();
const http=require('http').createServer(app);
const io=require('socket.io')(http);

app.use(express.static('public'));

let rooms={};

io.on('connection',socket=>{
    console.log('Connecté:',socket.id);

    socket.on('create_room',(data,cb)=>{
        const roomId='room_'+Date.now();
        rooms[roomId]={players:{},ia:[],host:socket.id};
        rooms[roomId].players[socket.id]={name:data.name,color:data.color,x:0,z:0};
        socket.join(roomId);
        cb({ok:true,roomId});
    });

    socket.on('start_match',(data)=>{
        const room=rooms[data.roomId];
        if(!room) return;
        // ajouter IA si privé
        if(data.mode=='private'){
            for(let i=0;i<data.ia;i++){
                const id='ia_'+i;
                room.ia.push({name:'IA'+i,color:'#aaa',x:Math.random()*10,z:Math.random()*10});
            }
        }
        io.to(data.roomId).emit('match_started');
    });

    socket.on('player_state',(player)=>{
        for(const roomId in rooms){
            if(rooms[roomId].players[socket.id]){
                rooms[roomId].players[socket.id]=player;
                io.to(roomId).emit('room_update',rooms[roomId]);
            }
        }
    });

    socket.on('chat_message',(data)=>{
        for(const roomId in rooms){
            if(rooms[roomId].players[socket.id]){
                io.to(roomId).emit('chat_message',{from:rooms[roomId].players[socket.id].name,msg:data.msg});
            }
        }
    });
});

http.listen(process.env.PORT || 3000,()=>console.log('Serveur lancé'));
