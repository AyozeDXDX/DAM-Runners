const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
const gameContainer = document.getElementById('game-container'); 

const levelNameDiv = document.createElement('div'); 
levelNameDiv.id = 'levelName';
gameContainer.insertBefore(levelNameDiv, canvas);

const dashStatusDiv = document.createElement('div');
dashStatusDiv.id = 'dashStatus';
gameContainer.insertBefore(dashStatusDiv, canvas.nextSibling);

// --- Variables de Juego del cliente ---
const CANVAS_WIDTH = 800; 
const CANVAS_HEIGHT = 400;
const GAME_WORLD_WIDTH = 2500; 
const GAME_WORLD_HEIGHT = 800; 
let currentPlatforms = []; 
let currentBoostZones = [];
let currentObstacles = []; 
let currentWalls = []; // ¡NUEVO!
let currentGoalFlag = {}; 
let players = {};
let gameRunning = true; 
const keysPressed = {}; 
let localPlayerColor = '#2c3e50'; 

const socket = io();
let cameraX = 0; 
let cameraY = 0; 

// --- Botón de Reinicio ---
const restartButton = document.createElement('button');
restartButton.textContent = 'Reiniciar Ronda (Nivel Aleatorio)';
restartButton.style.display = 'none'; 
restartButton.onclick = () => {
    socket.emit('requestRestartGame');
    restartButton.style.display = 'none';
    statusDiv.textContent = `Petición de reinicio enviada...`;
};
gameContainer.appendChild(restartButton);

// --- Manejo de la Conexión y Datos ---

socket.on('connect', () => {
    statusDiv.textContent = `Conectado. ID: ${socket.id}. Usa ESPACIO, A, D / Flechas para moverte. SHIFT para Dash.`;
});

socket.on('levelData', (data) => {
    currentPlatforms = data.platforms;
    currentBoostZones = data.boostZones;
    currentObstacles = data.obstacles; 
    currentWalls = data.walls || []; // ¡NUEVO!
    currentGoalFlag = data.goalFlag;
    levelNameDiv.textContent = `Nivel: ${data.levelName}`;
    gameRunning = true; 
    restartButton.style.display = 'none'; 
});

socket.on('obstaclesUpdate', (obstaclesData) => {
    currentObstacles = obstaclesData;
});

socket.on('gameState', (gameState) => {
    players = gameState.players;
    const localPlayer = players[socket.id];
    
    if (localPlayer && localPlayerColor !== localPlayer.color) {
        localPlayerColor = localPlayer.color;
        document.body.style.backgroundColor = localPlayerColor; 
    }
});

socket.on('disconnect', () => {
    statusDiv.textContent = '¡Desconectado! Recarga la página.';
    document.body.style.backgroundColor = '#2c3e50'; 
});

socket.on('gameOver', (data) => {
    gameRunning = false;
    const winner = players[data.winnerId];
    
    if (data.winnerId === socket.id) {
        statusDiv.textContent = `🎉 ¡HAS GANADO! ¡Tu color: ${winner.color}! Nueva ronda en 5s.`;
    } else {
        statusDiv.textContent = `El Jugador ${winner.id} (${winner.color}) ha ganado. ¡Fin! Nueva ronda en 5s.`;
    }
    statusDiv.style.color = winner.color; 
    restartButton.style.display = 'block'; 
});

socket.on('dashEffect', (data) => {
    // Efecto visual
});


// --- Lógica de Dibujo y Cámara ---

function updateCamera(player) {
    // --- Cámara Horizontal (X) ---
    let targetX = player.x - CANVAS_WIDTH / 2;
    if (targetX < 0) targetX = 0;
    const maxCameraX = GAME_WORLD_WIDTH - CANVAS_WIDTH;
    if (targetX > maxCameraX) targetX = maxCameraX;
    cameraX = targetX;

    // --- Cámara Vertical (Y) ---
    let targetY = player.y - CANVAS_HEIGHT / 2;
    if (targetY < 0) targetY = 0;
    const maxCameraY = GAME_WORLD_HEIGHT - CANVAS_HEIGHT;
    if (targetY > maxCameraY) targetY = maxCameraY;
    cameraY = targetY;
}


function drawPlayer(player) {
    const drawX = player.x - cameraX;
    const drawY = player.y - cameraY; 
    
    ctx.fillStyle = player.color;
    ctx.fillRect(drawX, drawY, player.width, player.height);
    
    // Efecto visual de Stun
    if (player.stunTimer > 0) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)'; 
        ctx.fillRect(drawX, drawY - 10, player.width, 5); 
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'yellow';
        ctx.fillText('STUN!', drawX, drawY - 15);
    }

    // ¡NUEVO! Efecto visual de Wall Slide
    if (player.isWallSliding) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#3498db'; // Azul
        ctx.fillText('SLIDE', drawX, drawY - 5);
    }
    
    if (player.id === socket.id) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, player.width, player.height);
    }
}

function drawPlatforms() {
    if (currentPlatforms.length === 0) return; 
    currentPlatforms.forEach(p => { 
        const drawX = p.x - cameraX;
        const drawY = p.y - cameraY; 
        if (drawX + p.width > 0 && drawX < CANVAS_WIDTH && drawY + p.height > 0 && drawY < CANVAS_HEIGHT) {
            ctx.fillStyle = p.color;
            ctx.fillRect(drawX, drawY, p.width, p.height);
        }
    });
}

// ¡NUEVO! Función para dibujar muros
function drawWalls() {
    if (currentWalls.length === 0) return; 
    currentWalls.forEach(wall => { 
        const drawX = wall.x - cameraX;
        const drawY = wall.y - cameraY; 
        if (drawX + wall.width > 0 && drawX < CANVAS_WIDTH && drawY + wall.height > 0 && drawY < CANVAS_HEIGHT) {
            ctx.fillStyle = wall.color;
            ctx.fillRect(drawX, drawY, wall.width, wall.height);
        }
    });
}

function drawBoostZones() {
    if (currentBoostZones.length === 0) return; 
    currentBoostZones.forEach(zone => { 
        const drawX = zone.x - cameraX;
        const drawY = zone.y - cameraY; 
        if (drawX + zone.width > 0 && drawX < CANVAS_WIDTH && drawY + zone.height > 0 && drawY < CANVAS_HEIGHT) {
            ctx.fillStyle = zone.color;
            ctx.globalAlpha = 0.5; 
            ctx.fillRect(drawX, drawY, zone.width, zone.height);
            ctx.globalAlpha = 1.0; 
        }
    });
}

function drawObstacles() {
    if (currentObstacles.length === 0) return; 
    currentObstacles.forEach(obs => { 
        const drawX = obs.x - cameraX;
        const drawY = obs.y - cameraY; 
        if (drawX + obs.width > 0 && drawX < CANVAS_WIDTH && drawY + obs.height > 0 && drawY < CANVAS_HEIGHT) {
            ctx.fillStyle = obs.color;
            ctx.fillRect(drawX, drawY, obs.width, obs.height);
        }
    });
}


function drawFlag() {
    if (currentGoalFlag && currentGoalFlag.width) {
        const drawX = currentGoalFlag.x - cameraX;
        const drawY = currentGoalFlag.y - cameraY; 
        
        ctx.fillStyle = 'black'; 
        ctx.fillRect(drawX - 5, drawY, 5, currentGoalFlag.height + 10);
        ctx.fillStyle = currentGoalFlag.color;
        ctx.fillRect(drawX, drawY, currentGoalFlag.width, currentGoalFlag.height);
        ctx.fillStyle = 'black';
        ctx.font = '12px sans-serif';
        ctx.fillText('META', drawX, drawY + currentGoalFlag.height / 2);
    }
}

// --- Actualización de la UI (Dash Cooldown) ---
function updateUI(localPlayer) {
    if (!localPlayer) {
        dashStatusDiv.textContent = 'Dash: (Conectando...)';
        return;
    }
    
    // Mostrar estado de Stun (prioridad alta)
    if (localPlayer.stunTimer > 0) {
        dashStatusDiv.textContent = `¡ATURDIDO! (${localPlayer.stunTimer.toFixed(1)}s)`;
        dashStatusDiv.className = 'cooldown';
        return;
    }
    
    const DASH_COOLDOWN_MS = 2 * 1000;
    const now = Date.now();
    const cooldownRemaining = (localPlayer.lastDashTime + DASH_COOLDOWN_MS) - now;

    if (cooldownRemaining > 0) {
        dashStatusDiv.textContent = `Dash: ${(cooldownRemaining / 1000).toFixed(1)}s`;
        dashStatusDiv.className = 'cooldown';
    } else {
        dashStatusDiv.textContent = 'Dash: ¡LISTO!';
        dashStatusDiv.className = 'ready';
    }
}


function gameLoop() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const localPlayer = players[socket.id];
    
    if (localPlayer) {
        updateCamera(localPlayer);
        updateUI(localPlayer); 
    }

    drawPlatforms();
    drawWalls(); // ¡NUEVO!
    drawBoostZones();
    drawObstacles(); 
    drawFlag();

    for (const id in players) {
        drawPlayer(players[id]);
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();


// --- Manejo de la Entrada del Jugador ---

document.addEventListener('keydown', (e) => {
    const localPlayer = players[socket.id];
    if (!gameRunning || (localPlayer && localPlayer.stunTimer > 0)) {
        if (e.key === 'Shift' || e.key === ' ' || e.key === 'ArrowUp') {
            keysPressed[e.key] = true; 
        }
        return;
    }


    if (!keysPressed[e.key]) {
        keysPressed[e.key] = true;

        if (e.key === ' ' || e.key === 'ArrowUp') {
            socket.emit('playerAction', { action: 'jump' });
        } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
            socket.emit('playerAction', { action: 'startMoveLeft' });
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
            socket.emit('playerAction', { action: 'startMoveRight' });
        } else if (e.key === 'Shift') { 
            socket.emit('playerAction', { action: 'dash' });
        }
    }
});

document.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
    
    const localPlayer = players[socket.id];
    if (!gameRunning || (localPlayer && localPlayer.stunTimer > 0)) {
        return; 
    }

    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        socket.emit('playerAction', { action: 'stopMoveLeft' });
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        // ¡ERROR CORREGIDO! Era socket.mit en lugar de socket.emit
        socket.emit('playerAction', { action: 'stopMoveRight' });
    }
});