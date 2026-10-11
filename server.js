const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory data store
const users = {}; 
const activePlayers = []; 
const partyQueue = []; 

let gameState = {
  room: "The Obsidian Foyer",
  story: "Heavy iron chains rattle from the ceiling as your party steps into a shadowy hall. A pulsing magical glow radiates from a stone altar across the room, while a low growl echoes from the shadows to the left.",
  options: [
    { id: 'altar', text: 'Investigate the Glowing Stone Altar' },
    { id: 'shadows', text: 'Prepare Weapons and Search the Shadows' },
    { id: 'door', text: 'Force Open the Heavy Reinforced Door' }
  ],
  votes: {}
};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Register
  socket.on('auth:register', ({ username, password }, callback) => {
    if (!username || !password) return callback({ success: false, message: 'All fields are required.' });
    if (users[username]) return callback({ success: false, message: 'Username already exists.' });
    users[username] = password;
    callback({ success: true });
  });

  // Login
  socket.on('auth:login', ({ username, password }, callback) => {
    if (!users[username] || users[username] !== password) {
      return callback({ success: false, message: 'Invalid credentials.' });
    }
    callback({ success: true });
  });

  // Character Join
  socket.on('join_game', (characterData) => {
    const player = { id: socket.id, ...characterData };
    activePlayers.push(player);
    partyQueue.push(player);

    socket.emit('game_state', gameState);
    io.emit('party_update', partyQueue);

    if (partyQueue.length >= 4) {
      const partyGroup = partyQueue.splice(0, 4);
      io.emit('system_message', `Party assembled: ${partyGroup.map(p => p.name).join(', ')}! The delve begins.`);
    }
  });

  // Chat handling
  socket.on('send_chat', (data) => {
    io.emit('receive_chat', data);
  });

  // Voting
  socket.on('cast_vote', ({ optionId, username }) => {
    gameState.votes[socket.id] = optionId;
    io.emit('system_message', `${username} cast a vote for option: ${optionId}`);
  });

  // Dice roll
  socket.on('roll_dice', (data) => {
    io.emit('dice_rolled', data);
  });

  socket.on('disconnect', () => {
    const index = activePlayers.findIndex(p => p.id === socket.id);
    if (index !== -1) activePlayers.splice(index, 1);
    const qIndex = partyQueue.findIndex(p => p.id === socket.id);
    if (qIndex !== -1) partyQueue.splice(qIndex, 1);
    io.emit('party_update', partyQueue);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
