const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Statische Dateien servieren
app.use(express.static(path.join(__dirname, 'public')));

// Wortliste laden
let wordList = [];
try {
  const data = fs.readFileSync('./words.json', 'utf8');
  wordList = JSON.parse(data).words;
} catch (error) {
  console.error('Fehler beim Laden der Wortliste:', error);
  wordList = ['Hund', 'Katze', 'Auto', 'Baum', 'Haus']; // Fallback
}

// Spielräume
const rooms = new Map();

// Hilfsfunktionen
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRandomWord() {
  return wordList[Math.floor(Math.random() * wordList.length)];
}

function selectImpostor(players) {
  const playerIds = Array.from(players.keys());
  return playerIds[Math.floor(Math.random() * playerIds.length)];
}

class GameRoom {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.host = null;
    this.gameState = 'waiting'; // waiting, hinting, voting, finished
    this.currentWord = null;
    this.impostor = null;
    this.hints = new Map();
    this.votes = new Map();
    this.round = 0;
  }

  addPlayer(socket, name) {
    this.players.set(socket.id, {
      id: socket.id,
      name: name,
      isImpostor: false,
      socket: socket
    });
    
    if (!this.host) {
      this.host = socket.id;
    }
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.host === socketId && this.players.size > 0) {
      this.host = this.players.keys().next().value;
    }
  }

  startGame() {
    if (this.players.size < 3) return false;
    
    this.gameState = 'hinting';
    this.currentWord = getRandomWord();
    this.impostor = selectImpostor(this.players);
    this.round = 1;
    this.hints.clear();
    this.votes.clear();

    // Impostor markieren
    this.players.get(this.impostor).isImpostor = true;

    return true;
  }

  submitHint(playerId, hint) {
    if (this.gameState !== 'hinting') return false;
    this.hints.set(playerId, hint);
    return true;
  }

  submitVote(playerId, votedPlayerId) {
    if (this.gameState !== 'voting') return false;
    this.votes.set(playerId, votedPlayerId);
    return true;
  }

  getGameState() {
    return {
      code: this.code,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.id === this.host
      })),
      gameState: this.gameState,
      round: this.round,
      word: this.currentWord,
      hints: Array.from(this.hints.entries()),
      votes: Array.from(this.votes.entries()),
      impostor: this.impostor
    };
  }
}

io.on('connection', (socket) => {
  console.log('Neuer Client verbunden:', socket.id);

  socket.on('createRoom', (playerName) => {
    const roomCode = generateRoomCode();
    const room = new GameRoom(roomCode);
    room.addPlayer(socket, playerName);
    rooms.set(roomCode, room);
    
    socket.join(roomCode);
    socket.emit('roomCreated', { code: roomCode, gameState: room.getGameState() });
  });

  socket.on('joinRoom', (data) => {
    const { code, playerName } = data;
    const room = rooms.get(code);
    
    if (!room) {
      socket.emit('error', 'Raum nicht gefunden');
      return;
    }

    if (room.gameState !== 'waiting') {
      socket.emit('error', 'Spiel bereits gestartet');
      return;
    }

    room.addPlayer(socket, playerName);
    socket.join(code);
    
    io.to(code).emit('gameStateUpdate', room.getGameState());
  });

  socket.on('startGame', () => {
    const room = Array.from(rooms.values()).find(r => r.players.has(socket.id));
    if (!room || room.host !== socket.id) return;

    if (room.startGame()) {
      io.to(room.code).emit('gameStarted', room.getGameState());
    } else {
      socket.emit('error', 'Mindestens 3 Spieler benötigt');
    }
  });

  socket.on('submitHint', (hint) => {
    const room = Array.from(rooms.values()).find(r => r.players.has(socket.id));
    if (!room) return;

    if (room.submitHint(socket.id, hint)) {
      io.to(room.code).emit('hintSubmitted', {
        playerId: socket.id,
        playerName: room.players.get(socket.id).name
      });

      // Alle Hinweise eingegangen?
      if (room.hints.size === room.players.size) {
        room.gameState = 'voting';
        io.to(room.code).emit('votingPhase', room.getGameState());
      }
    }
  });

  socket.on('submitVote', (votedPlayerId) => {
    const room = Array.from(rooms.values()).find(r => r.players.has(socket.id));
    if (!room) return;

    if (room.submitVote(socket.id, votedPlayerId)) {
      // Alle Stimmen abgegeben?
      if (room.votes.size === room.players.size) {
        // Stimmen auswerten
        const voteCounts = new Map();
        room.votes.forEach(vote => {
          voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
        });

        let mostVoted = null;
        let maxVotes = 0;
        voteCounts.forEach((count, playerId) => {
          if (count > maxVotes) {
            maxVotes = count;
            mostVoted = playerId;
          }
        });

        const isImpostorFound = mostVoted === room.impostor;
        room.gameState = 'finished';

        io.to(room.code).emit('gameFinished', {
          ...room.getGameState(),
          mostVoted,
          isImpostorFound,
          voteCounts: Array.from(voteCounts.entries())
        });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client getrennt:', socket.id);
    
    // Spieler aus allen Räumen entfernen
    rooms.forEach((room, code) => {
      if (room.players.has(socket.id)) {
        room.removePlayer(socket.id);
        
        if (room.players.size === 0) {
          rooms.delete(code);
        } else {
          io.to(code).emit('gameStateUpdate', room.getGameState());
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});