// Socket.io Verbindung
const socket = io();

// Spielzustand
let gameState = {
    roomCode: '',
    playerName: '',
    isHost: false,
    currentWord: '',
    isImpostor: false,
    gamePhase: 'waiting'
};

// DOM Elemente
const screens = {
    start: document.getElementById('startScreen'),
    join: document.getElementById('joinScreen'),
    waiting: document.getElementById('waitingRoom'),
    game: document.getElementById('gameScreen')
};

const elements = {
    playerName: document.getElementById('playerName'),
    roomCode: document.getElementById('roomCode'),
    displayRoomCode: document.getElementById('displayRoomCode'),
    gameRoomCode: document.getElementById('gameRoomCode'),
    playersList: document.getElementById('playersList'),
    startGameBtn: document.getElementById('startGameBtn'),
    playerWord: document.getElementById('playerWord'),
    roundNumber: document.getElementById('roundNumber'),
    hintInput: document.getElementById('hintInput'),
    submitHintBtn: document.getElementById('submitHintBtn'),
    hintsStatus: document.getElementById('hintsStatus'),
    hintPhase: document.getElementById('hintPhase'),
    votingPhase: document.getElementById('votingPhase'),
    resultsPhase: document.getElementById('resultsPhase'),
    hintsDisplay: document.getElementById('hintsDisplay'),
    votingOptions: document.getElementById('votingOptions'),
    gameResult: document.getElementById('gameResult'),
    errorMessage: document.getElementById('errorMessage')
};

// Event Listeners
document.getElementById('createRoomBtn').addEventListener('click', createRoom);
document.getElementById('joinRoomBtn').addEventListener('click', () => showScreen('join'));
document.getElementById('joinGameBtn').addEventListener('click', joinRoom);
document.getElementById('backBtn').addEventListener('click', () => showScreen('start'));
document.getElementById('startGameBtn').addEventListener('click', startGame);
document.getElementById('leaveRoomBtn').addEventListener('click', leaveRoom);
document.getElementById('copyCodeBtn').addEventListener('click', copyRoomCode);
document.getElementById('submitHintBtn').addEventListener('click', submitHint);
document.getElementById('newGameBtn').addEventListener('click', startGame);
document.getElementById('backToMenuBtn').addEventListener('click', backToMenu);

// Enter-Taste Support
elements.playerName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createRoom();
});
elements.roomCode.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});
elements.hintInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitHint();
});

// Hilfsfunktionen
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
    setTimeout(() => {
        elements.errorMessage.style.display = 'none';
    }, 5000);
}

function createRoom() {
    const playerName = elements.playerName.value.trim();
    if (!playerName) {
        showError('Bitte gib deinen Namen ein');
        return;
    }
    gameState.playerName = playerName;
    socket.emit('createRoom', playerName);
}

function joinRoom() {
    const playerName = elements.playerName.value.trim();
    const roomCode = elements.roomCode.value.trim().toUpperCase();
    
    if (!playerName) {
        showError('Bitte gib deinen Namen ein');
        return;
    }
    if (!roomCode) {
        showError('Bitte gib einen Raum-Code ein');
        return;
    }
    
    gameState.playerName = playerName;
    socket.emit('joinRoom', { code: roomCode, playerName });
}

function startGame() {
    socket.emit('startGame');
}

function leaveRoom() {
    location.reload();
}

function copyRoomCode() {
    navigator.clipboard.writeText(gameState.roomCode).then(() => {
        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1000);
    });
}

function submitHint() {
    const hint = elements.hintInput.value.trim();
    if (!hint) {
        showError('Bitte gib einen Hinweis ein');
        return;
    }
    socket.emit('submitHint', hint);
    elements.hintInput.value = '';
    elements.submitHintBtn.disabled = true;
    elements.hintsStatus.textContent = 'Hinweis gesendet! Warte auf andere...';
}

function submitVote(playerId) {
    socket.emit('submitVote', playerId);
    // Alle Vote-Buttons deaktivieren
    document.querySelectorAll('.vote-option').forEach(btn => {
        btn.classList.remove('selected');
        btn.style.pointerEvents = 'none';
    });
    // Gewählte Option markieren
    document.querySelector(`[data-player-id="${playerId}"]`).classList.add('selected');
}

function backToMenu() {
    location.reload();
}

function updatePlayersList(players) {
    elements.playersList.innerHTML = '';
    players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-item ${player.isHost ? 'host' : ''}`;
        playerDiv.textContent = player.name;
        elements.playersList.appendChild(playerDiv);
    });
}

function displayHints(hints, players) {
    elements.hintsDisplay.innerHTML = '';
    hints.forEach(([playerId, hint]) => {
        const player = players.find(p => p.id === playerId);
        const hintDiv = document.createElement('div');
        hintDiv.className = 'hint-item';
        hintDiv.innerHTML = `
            <span class="hint-player">${player.name}:</span>
            <span class="hint-text">"${hint}"</span>
        `;
        elements.hintsDisplay.appendChild(hintDiv);
    });
}

function displayVotingOptions(players) {
    elements.votingOptions.innerHTML = '';
    players.forEach(player => {
        const voteBtn = document.createElement('button');
        voteBtn.className = 'vote-option';
        voteBtn.textContent = player.name;
        voteBtn.dataset.playerId = player.id;
        voteBtn.addEventListener('click', () => submitVote(player.id));
        elements.votingOptions.appendChild(voteBtn);
    });
}

function displayGameResult(data) {
    const { isImpostorFound, impostor, mostVoted, players, word } = data;
    const impostorPlayer = players.find(p => p.id === impostor);
    const votedPlayer = players.find(p => p.id === mostVoted);
    
    let resultClass, resultTitle, resultText;
    
    if (gameState.isImpostor) {
        if (isImpostorFound) {
            resultClass = 'result-lose';
            resultTitle = '😵 Du wurdest entlarvt!';
            resultText = `Das Wort war: "${word}"`;
        } else {
            resultClass = 'result-win';
            resultTitle = '🎉 Du hast gewonnen!';
            resultText = `Das Wort war: "${word}" und niemand hat dich verdächtigt!`;
        }
    } else {
        if (isImpostorFound) {
            resultClass = 'result-win';
            resultTitle = '🎉 Impostor gefunden!';
            resultText = `${impostorPlayer.name} war der Impostor!`;
        } else {
            resultClass = 'result-lose';
            resultTitle = '😔 Impostor entkommen!';
            resultText = `${impostorPlayer.name} war der Impostor, aber ihr habt ${votedPlayer.name} gewählt.`;
        }
    }
    
    elements.gameResult.className = `result-display ${resultClass}`;
    elements.gameResult.innerHTML = `
        <h4>${resultTitle}</h4>
        <p>${resultText}</p>
        <p><strong>Das geheime Wort war: "${word}"</strong></p>
    `;
}

// Socket Event Listeners
socket.on('roomCreated', (data) => {
    gameState.roomCode = data.code;
    gameState.isHost = true;
    elements.displayRoomCode.textContent = data.code;
    elements.gameRoomCode.textContent = data.code;
    elements.startGameBtn.style.display = 'block';
    updatePlayersList(data.gameState.players);
    showScreen('waiting');
});

socket.on('gameStateUpdate', (data) => {
    updatePlayersList(data.players);
    const currentPlayer = data.players.find(p => p.name === gameState.playerName);
    if (currentPlayer && currentPlayer.isHost) {
        elements.startGameBtn.style.display = 'block';
    }
});

socket.on('gameStarted', (data) => {
    gameState.roomCode = data.code;
    gameState.currentWord = data.word;
    gameState.isImpostor = data.players.find(p => p.name === gameState.playerName)?.id === data.impostor;
    
    elements.gameRoomCode.textContent = data.code;
    elements.roundNumber.textContent = data.round;
    
    if (gameState.isImpostor) {
        elements.playerWord.textContent = 'Du bist der IMPOSTOR!';
        elements.playerWord.className = 'word-display impostor-message';
    } else {
        elements.playerWord.textContent = data.word;
        elements.playerWord.className = 'word-display';
    }
    
    // Hint Phase anzeigen
    elements.hintPhase.style.display = 'block';
    elements.votingPhase.style.display = 'none';
    elements.resultsPhase.style.display = 'none';
    elements.submitHintBtn.disabled = false;
    elements.hintsStatus.textContent = 'Gib einen Hinweis zu deinem Wort...';
    
    showScreen('game');
});

socket.on('hintSubmitted', (data) => {
    if (data.playerName === gameState.playerName) {
        elements.hintsStatus.textContent = 'Hinweis gesendet! Warte auf andere...';
    }
});

socket.on('votingPhase', (data) => {
    elements.hintPhase.style.display = 'none';
    elements.votingPhase.style.display = 'block';
    elements.resultsPhase.style.display = 'none';
    
    displayHints(data.hints, data.players);
    displayVotingOptions(data.players);
});

socket.on('gameFinished', (data) => {
    elements.hintPhase.style.display = 'none';
    elements.votingPhase.style.display = 'none';
    elements.resultsPhase.style.display = 'block';
    
    displayGameResult(data);
});

socket.on('error', (message) => {
    showError(message);
});

socket.on('disconnect', () => {
    showError('Verbindung zum Server verloren');
});