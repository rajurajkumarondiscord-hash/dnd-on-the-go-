const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory user database and game state
const users = {}; // { username: password }
const party = []; // [{ id: socket.id, name, heroClass, user }]
let currentVotes = {}; // { socket.id: optionId }

// Dungeon Rooms & Progression Tree
const dungeonRooms = {
  "start": {
    room: "The Obsidian Foyer",
    story: "Heavy iron chains rattle from the ceiling as your party steps into a shadowy hall. A pulsing magical glow radiates from a stone altar across the room, while a low growl echoes from the shadows to the left.",
    options: [
      { id: "altar", text: "Investigate the Glowing Stone Altar" },
      { id: "shadows", text: "Prepare Weapons and Search the Shadows" },
      { id: "door", text: "Force Open the Heavy Reinforced Door" }
    ]
  },
  "altar": {
    room: "Shrine of the Fallen Mage",
    story: "You approach the altar. Runes ignite with blinding blue fire, granting your party a surge of arcane protection! Ahead, a narrow stone bridge crosses a bottomless chasm.",
    options: [
      { id: "bridge", text: "Cross the Chasm via the Stone Bridge" },
      { id: "search_altar", text: "Search the Altar for Hidden Relics" }
    ]
  },
  "shadows": {
    room: "The Beast's Den",
    story: "Stepping into the gloom, your party ambushes a pair of savage goblin scouts! Quick strikes send them fleeing deeper into a dark cavern tunnel.",
    options: [
      { id: "tunnel", text: "Pursue the Goblins Down the Tunnel" },
      { id: "loot_lair", text: "Loot the Goblin Camp Supplies" }
    ]
  },
  "door": {
    room: "The Armory Vault",
    story: "With a mighty heave, the heavy iron door yields. Inside lies a treasure trove of masterwork weapons and old steel armor gleaming under dust.",
    options: [
      { id: "armory_hall", text: "Equip Gear and Proceed to the Inner Keep" }
    ]
  },
  "bridge": {
    room: "The Dragon's Lair (Final Chamber)",
    story: "You cross safely and enter a massive cavern littered with gold. An ancient dragon slumbers upon the hoard, one eye cracking open as you arrive!",
    options: [
      { id: "start", text: "🔄 Restart Dungeon Adventure" }
    ]
  },
  "tunnel": {
    room: "The Underground River",
    story: "Following the tunnel leads to a rushing subterranean river with an old wooden raft tied to the bank.",
    options: [
      { id: "bridge", text: "Board the Raft and Navigate Downstream" }
    ]
  },
  "search_altar": {
    room: "The Guardian's Vault",
    story: "Searching the altar triggers a hidden stone panel, revealing an ancient potion of vitality and a glowing map!",
    options: [
      { id: "bridge", text: "Take the Map and Proceed Ahead" }
    ]
  },
  "loot_lair": {
    room: "The Smugglers' Cache",
    story: "You scavenge valuable gems and rations from the goblin supplies, boosting party morale.",
    options: [
      { id: "tunnel", text: "Move Deeper into the Caverns" }
    ]
  },
  "armory_hall": {
    room: "The Inner Keep Corridor",
    story: "Fully armored, your party strides confidently down the grand corridor toward the heart of the dungeon.",
    options: [
      { id: "bridge", text: "Approach the Final Sanctum" }
    ]
  }
};

let currentRoomKey = "start";

// Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Authentication: Register
  socket.on('auth:register', ({ username, password }, callback) => {
    if (!username || !password) return callback({ success: false, message: 'Invalid credentials.' });
    if (users[username]) return callback({ success: false, message: 'Username already exists.' });
    
    users[username] = password;
    callback({ success: true });
  });

  // Authentication: Login
  socket.on('auth:login', ({ username, password }, callback) => {
    if (!users[username] || users[username] !== password) {
      return callback({ success: false, message: 'Incorrect username or password.' });
    }
    callback({ success: true });
  });

  // Join Game & Character Creation
  socket.on('join_game', (heroData) => {
    party.push({ id: socket.id, ...heroData });
    
    // Broadcast updated party list
    io.emit('party_update', party);

    // Send current game state to the newly joined player
    socket.emit('game_state', dungeonRooms[currentRoomKey]);
    io.emit('system_message', `${heroData.name} the ${heroData.heroClass} has entered the dungeon!`);
  });

  // Cast Vote for Story Progression
  socket.on('cast_vote', ({ optionId, username }) => {
    currentVotes[socket.id] = optionId;
    io.emit('system_message', `${username} voted for an action.`);

    // Check if all connected party members have cast their votes
    if (Object.keys(currentVotes).length >= party.length && party.length > 0) {
      // Tally votes (Majority Rules)
      const voteCounts = {};
      Object.values(currentVotes).forEach(id => {
        voteCounts[id] = (voteCounts[id] || 0) + 1;
      });

      let winningOption = Object.keys(voteCounts).reduce((a, b) => 
        voteCounts[a] > voteCounts[b] ? a : b
      );

      // Advance room state
      if (dungeonRooms[winningOption]) {
        currentRoomKey = winningOption;
      } else {
        currentRoomKey = "start"; // Fallback loop
      }

      // Clear votes for the next round
      currentVotes = {};

      // Broadcast new room state to everyone!
      io.emit('game_state', dungeonRooms[currentRoomKey]);
      io.emit('system_message', `⚡ Majority reached! The party advances to a new area...`);
    }
  });

  // Dice Roller Sync
  socket.on('roll_dice', (data) => {
    io.emit('dice_rolled', data);
  });

  // Live Party Chat
  socket.on('send_chat', (data) => {
    io.emit('receive_chat', data);
  });

  // Disconnect Handling
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const index = party.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      const removed = party.splice(index, 1)[0];
      io.emit('party_update', party);
      io.emit('system_message', `${removed.name} has left the party.`);
    }
    delete currentVotes[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dungeon Text server running on port ${PORT}`);
});
