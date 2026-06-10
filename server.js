const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Server-side state
let players = {};
let currentMap = 'Kyoto_Courtyard';

// Map definitions
const maps = {
    Kyoto_Courtyard: { spawnPoints: [{x:0, y:1, z:0}, {x:10, y:1, z:10}, {x:-10, y:1, z:-10}] },
    Tokyo_Neon: { spawnPoints: [{x:0, y:1, z:0}, {x:25, y:1, z:25}, {x:-25, y:1, z:-25}] }
};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join match
    socket.on('joinGame', (data) => {
        const spawns = maps[currentMap].spawnPoints;
        const spawn = spawns[Math.floor(Math.random() * spawns.length)];
        
        players[socket.id] = {
            id: socket.id,
            name: data.name || 'Anonymous Sushi',
            skin: data.skin || 'maguro',
            x: spawn.x, y: spawn.y, z: spawn.z,
            ry: 0,
            hp: 100
        };

        socket.emit('initGame', { map: currentMap, id: socket.id, players });
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    // Handle movement updates
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Handle combat hits
    socket.on('playerShoot', (data) => {
        socket.broadcast.emit('bulletFired', { ...data, shooter: socket.id });
    });

    socket.on('hitPlayer', (data) => {
        let target = players[data.targetId];
        if (target) {
            target.hp -= data.damage;
            if (target.hp <= 0) {
                target.hp = 100; // Reset HP
                const spawns = maps[currentMap].spawnPoints;
                const spawn = spawns[Math.floor(Math.random() * spawns.length)];
                target.x = spawn.x; target.y = spawn.y; target.z = spawn.z;
                io.emit('playerRespawn', target);
            } else {
                io.emit('playerHit', { id: target.id, hp: target.hp });
            }
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sushi Server running on port ${PORT}`));
