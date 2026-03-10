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

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const WORLD = 3000;
const FOOD_COUNT = 120;
const BUFF_COUNT = 8;
const BUFF_KEYS = ['TRIPLE_SHOT', 'SPEED', 'GIANT', 'RAPID_FIRE'];
const COLORS = ['#9600ff', '#00e5a0', '#ff3366', '#ffaa00', '#00aaff', '#ff6600', '#cc00ff', '#00ffcc'];

let players = {};
let foods = [];
let buffItems = [];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function createFood() {
    return { id: Math.random().toString(36).substr(2, 9), x: randInt(50, WORLD - 50), y: randInt(50, WORLD - 50), size: randInt(5, 12), color: COLORS[randInt(0, COLORS.length - 1)] };
}

function createBuff() {
    const type = BUFF_KEYS[randInt(0, BUFF_KEYS.length - 1)];
    return { id: Math.random().toString(36).substr(2, 9), x: randInt(100, WORLD - 100), y: randInt(100, WORLD - 100), type, size: 18 };
}

for (let i = 0; i < FOOD_COUNT; i++) foods.push(createFood());
for (let i = 0; i < BUFF_COUNT; i++) buffItems.push(createBuff());

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name || 'Oyuncu',
            x: WORLD / 2 + randInt(-200, 200),
            y: WORLD / 2 + randInt(-200, 200),
            size: 30,
            color: COLORS[randInt(0, COLORS.length - 1)],
            score: 0,
            alive: true,
        };
        socket.emit('gameState', { players, foods, buffItems });
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    socket.on('update', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].size = data.size;
            players[socket.id].score = data.score;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, size: data.size, score: data.score });
        }
    });

    socket.on('webShot', (data) => {
        socket.broadcast.emit('webFired', { ...data, ownerId: socket.id, color: players[socket.id]?.color || '#fff' });
    });

    socket.on('foodEaten', (foodId) => {
        foods = foods.filter(f => f.id !== foodId);
        const newFood = createFood();
        foods.push(newFood);
        io.emit('foodUpdate', { removed: foodId, added: newFood });
    });

    socket.on('buffEaten', (buffId) => {
        buffItems = buffItems.filter(b => b.id !== buffId);
        const newBuff = createBuff();
        buffItems.push(newBuff);
        io.emit('buffUpdate', { removed: buffId, added: newBuff });
    });

    socket.on('playerDied', () => {
        if (players[socket.id]) {
            players[socket.id].alive = false;
            socket.broadcast.emit('playerDied', socket.id);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

