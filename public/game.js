const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 💥 CORRECCIÓN: Referencias a los nuevos contenedores.
const gameWrapper = document.getElementById('game-wrapper'); 
const uiOverlay = document.getElementById('ui-overlay');     
const gameCanvasContainer = document.getElementById('game-canvas-container'); 

// 💥 CORRECCIÓN: Creamos TODOS los elementos de UI desde cero.
const statusDiv = document.createElement('p');
statusDiv.id = 'status';
statusDiv.textContent = 'Conectando al servidor...';

const levelNameDiv = document.createElement('div'); 
levelNameDiv.id = 'levelName';

const dashStatusDiv = document.createElement('div');
dashStatusDiv.id = 'dashStatus';

// --- Botón de Reinicio ---
const restartButton = document.createElement('button');
restartButton.id = 'restartButton'; 
restartButton.textContent = 'Reiniciar Ronda (Nivel Aleatorio)';
restartButton.style.display = 'none'; 
restartButton.onclick = () => {
    socket.emit('requestRestartGame');
    restartButton.style.display = 'none';
    statusDiv.textContent = `Petición de reinicio enviada...`;
};

// --- Botón de Mandos (Ya no está duplicado) ---
const gamepadButton = document.createElement('button');
gamepadButton.id = 'gamepadButton';
gamepadButton.textContent = 'Asignar Mandos (0 Asignados)';

// --- Menú de Mandos (Pop-up) ---
const menuContainer = document.createElement('div');
menuContainer.id = 'gamepadMenu';
menuContainer.style.display = 'none';
menuContainer.style.position = 'absolute';
menuContainer.style.top = '50%';
menuContainer.style.left = '50%';
menuContainer.style.transform = 'translate(-50%, -50%)';
menuContainer.style.backgroundColor = 'rgba(44, 62, 80, 0.95)';
menuContainer.style.padding = '20px';
menuContainer.style.border = '3px solid #f39c12';
menuContainer.style.zIndex = '1000';

gamepadButton.onclick = toggleGamepadMenu;

// 💥 ADJUNTAR: Solo una vez, al uiOverlay.
uiOverlay.appendChild(statusDiv);
uiOverlay.appendChild(levelNameDiv);
uiOverlay.appendChild(dashStatusDiv);
uiOverlay.appendChild(gamepadButton);
uiOverlay.appendChild(restartButton);

// El menuContainer, al BODY.
document.body.appendChild(menuContainer);


// --- Variables de Juego del cliente ---
// Base
const BASE_WIDTH = 800;
const BASE_HEIGHT = 400;

// Dinámicas (Inicializadas con la base)
let CANVAS_WIDTH = BASE_WIDTH; 
let CANVAS_HEIGHT = BASE_HEIGHT;
let VIEW_WIDTH = BASE_WIDTH;    
let VIEW_HEIGHT = BASE_HEIGHT; 

const MAX_LOCAL_PLAYERS = 4;
const GAME_WORLD_WIDTH = 2500; 
const GAME_WORLD_HEIGHT = 800;

let currentPlatforms = []; 
let currentBoostZones = [];
let currentObstacles = []; 
let currentWalls = []; 
let currentGoalFlag = {};
let currentLadders = [];
let currentPortals = [];
let players = {};
let gameRunning = true; 
const keysPressed = {}; 
let localPlayerColor = '#2c3e50'; 
let localPlayerIds = [];

const socket = io();
let cameraX = 0; 
let cameraY = 0; 

// --- ¡VARIABLES PARA MANDO! ---
let gamepadAssignments = {}; // { gamepadIndex: playerId }
let showGamepadMenu = false; 

// --- Ajusta el tamaño del canvas y de la vista ---
function updateCanvasDimensions(playerCount) {
    if (playerCount === 0) {
        playerCount = 1; 
    }

    if (playerCount === 1) {
        CANVAS_WIDTH = BASE_WIDTH;
        CANVAS_HEIGHT = BASE_HEIGHT;
        VIEW_WIDTH = BASE_WIDTH;
        VIEW_HEIGHT = BASE_HEIGHT;
    } else if (playerCount === 2) {
        CANVAS_WIDTH = BASE_WIDTH * 1.5; 
        CANVAS_HEIGHT = BASE_HEIGHT;
        VIEW_WIDTH = CANVAS_WIDTH / 2;
        VIEW_HEIGHT = CANVAS_HEIGHT;
    } else if (playerCount === 3 || playerCount === 4) {
        CANVAS_WIDTH = BASE_WIDTH * 1.5; 
        CANVAS_HEIGHT = BASE_HEIGHT * 1.5; 
        VIEW_WIDTH = CANVAS_WIDTH / 2;
        VIEW_HEIGHT = CANVAS_HEIGHT / 2;
    } else {
        CANVAS_WIDTH = BASE_WIDTH;
        CANVAS_HEIGHT = BASE_HEIGHT;
        VIEW_WIDTH = CANVAS_WIDTH;
        VIEW_HEIGHT = CANVAS_HEIGHT;
    }

    // Aplicar los cambios al elemento HTML
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Ajustar el tamaño del game-wrapper y game-canvas-container
    gameWrapper.style.width = `${CANVAS_WIDTH}px`;
    // 💥 CORRECCIÓN: Dejar que la altura del wrapper se ajuste automáticamente
    // gameWrapper.style.height = `${CANVAS_HEIGHT}px`; 
    
    gameCanvasContainer.style.width = `${CANVAS_WIDTH}px`;
    gameCanvasContainer.style.height = `${CANVAS_HEIGHT}px`;
}

// --- Funciones de Menú de Mandos ---
function toggleGamepadMenu() {
    showGamepadMenu = !showGamepadMenu;
    if (showGamepadMenu) {
        menuContainer.style.display = 'block';
        buildGamepadMenu();
    } else {
        menuContainer.style.display = 'none';
    }
}

function assignGamepad(gamepadIndex, localPlayerId) {
    if (localPlayerId === null) {
        delete gamepadAssignments[gamepadIndex];
    } else {
        for (const gIdx in gamepadAssignments) {
            if (gamepadAssignments[gIdx] === localPlayerId) {
                delete gamepadAssignments[gIdx];
            }
        }
        gamepadAssignments[gamepadIndex] = localPlayerId;
    }
    
    buildGamepadMenu();
}

function buildGamepadMenu() {
    menuContainer.innerHTML = ''; 
    
    const h2 = document.createElement('h2');
    h2.textContent = 'Asignación de Mandos';
    h2.style.color = 'white';
    menuContainer.appendChild(h2);
    
    // Añadir jugador local button
    if (localPlayerIds.length < MAX_LOCAL_PLAYERS) {
        const addPlayerButton = document.createElement('button');
        addPlayerButton.textContent = `Añadir Jugador Local ${localPlayerIds.length + 1}`;
        addPlayerButton.style.backgroundColor = '#2ecc71';
        addPlayerButton.style.color = 'black';
        addPlayerButton.style.marginBottom = '20px';
        addPlayerButton.onclick = () => {
            socket.emit('requestLocalPlayer'); 
        };
        menuContainer.appendChild(addPlayerButton);
    }
    
    const localPlayersDiv = document.createElement('div');
    localPlayersDiv.innerHTML = '<h3 style="color: #f39c12;">Jugadores Locales:</h3>';
    
    const currentLocalPlayers = localPlayerIds;
    let localPlayersFound = false;

    currentLocalPlayers.forEach(playerId => { 
        const player = players[playerId];
        
        if (player) {
            localPlayersFound = true;
            const pDiv = document.createElement('div');
            pDiv.style.marginBottom = '10px';
            const assignedGamepadIndex = Object.keys(gamepadAssignments).find(key => gamepadAssignments[key] === playerId);

            let statusText;
            
            const statusSpan = document.createElement('span');
            statusSpan.style.color = player.color;
            statusSpan.style.marginRight = '10px';
            
            const displayId = playerId.length > 7 ? playerId.substring(0, 7) : playerId; 

            if (assignedGamepadIndex !== undefined) {
                statusText = `[${player.color}] Jugador ${displayId}: Asignado al Mando ${assignedGamepadIndex}`;
                statusSpan.textContent = statusText;
                
                const unassignButton = document.createElement('button');
                unassignButton.textContent = 'Desemparejar Mando';
                unassignButton.style.backgroundColor = '#e74c3c';
                unassignButton.style.color = 'white';
                unassignButton.style.marginLeft = '10px';
                unassignButton.onclick = () => assignGamepad(parseInt(assignedGamepadIndex), null);
                pDiv.appendChild(statusSpan); 
                pDiv.appendChild(unassignButton);
            
            } else {
                statusText = `[${player.color}] Jugador ${displayId}: Sin asignar`;
                statusSpan.textContent = statusText;
                pDiv.appendChild(statusSpan);
            }
            
            localPlayersDiv.appendChild(pDiv);
        }
    });

    if (!localPlayersFound) {
        localPlayersDiv.innerHTML += '<p style="color: red;">ERROR: No se pudo cargar el jugador local para la asignación. Asegúrate de que el socket esté conectado.</p>';
    }
    
    menuContainer.appendChild(localPlayersDiv);

    // Mapear mandos disponibles
    const availableGamepadsDiv = document.createElement('div');
    availableGamepadsDiv.innerHTML = '<h3 style="color: #f39c12;">Mandos Conectados:</h3>';

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let connectedCount = 0;
    
    gamepads.forEach((gamepad, index) => {
        if (gamepad) {
            connectedCount++;
            const gDiv = document.createElement('div');
            gDiv.style.color = 'white';
            gDiv.style.marginBottom = '5px';
            const assignedPlayerId = gamepadAssignments[index];

            let gStatusText = `Mando ${index} (${gamepad.id.substring(0, 30)}...): `;
            
            if (assignedPlayerId) {
                gStatusText += `ASIGNADO a ${players[assignedPlayerId]?.color || assignedPlayerId.substring(0, 7)}`;
                gDiv.style.opacity = '0.7';
            } else {
                gStatusText += 'DISPONIBLE';
                
                currentLocalPlayers.forEach(playerId => {
                    if (!Object.values(gamepadAssignments).includes(playerId)) {
                        const assignButton = document.createElement('button');
                        const buttonDisplayId = playerId.length > 7 ? playerId.substring(0, 7) : playerId;
                        assignButton.textContent = `Asignar a J${buttonDisplayId}`;
                        assignButton.style.backgroundColor = players[playerId]?.color || '#2ecc71';
                        assignButton.style.color = 'black';
                        assignButton.style.marginLeft = '10px';
                        assignButton.onclick = () => assignGamepad(index, playerId);
                        gDiv.appendChild(assignButton);
                    }
                });
            }
            
            const gStatusSpan = document.createElement('span');
            gStatusSpan.textContent = gStatusText;
            gDiv.prepend(gStatusSpan);
            availableGamepadsDiv.appendChild(gDiv);
        }
    });

    if (connectedCount === 0) {
        availableGamepadsDiv.innerHTML += '<p style="color: #ccc;">**No se detectan mandos.** Pulsa **START** o cualquier botón en tu mando para que el navegador lo detecte.</p>';
    }
    
    gamepadButton.textContent = `Asignar Mandos (${Object.keys(gamepadAssignments).length} Asignados)`;
    
    menuContainer.appendChild(availableGamepadsDiv);
    
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Cerrar Menú';
    closeButton.style.marginTop = '20px';
    closeButton.style.backgroundColor = '#3498db';
    closeButton.style.padding = '10px 20px';
    closeButton.onclick = toggleGamepadMenu;
    menuContainer.appendChild(closeButton);
}
// --- Lógica de Manejo de Input del Mando (Gamepad) ---

function handleGamepadInput() {
    if (showGamepadMenu) return; 
    
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];

    for (const gIdx in gamepadAssignments) {
        const gamepadIndex = parseInt(gIdx);
        const playerId = gamepadAssignments[gamepadIndex];
        const gamepad = gamepads[gamepadIndex];
        const player = players[playerId];
        
        if (!gamepad || !player || player.stunTimer > 0) continue;

        // --- 1. MOVIMIENTO HORIZONTAL (Stick Izquierdo X O D-Pad) ---
        
        const x_axis = gamepad.axes[0] || 0; 
        const dpad_left = gamepad.buttons[14] && gamepad.buttons[14].pressed; 
        const dpad_right = gamepad.buttons[15] && gamepad.buttons[15].pressed; 
        
        if (x_axis > 0.1 || dpad_right) {
            socket.emit('playerAction', { playerId: playerId, action: 'startMoveRight' });
            socket.emit('playerAction', { playerId: playerId, action: 'stopMoveLeft' });
        } else if (x_axis < -0.1 || dpad_left) {
            socket.emit('playerAction', { playerId: playerId, action: 'startMoveLeft' });
            socket.emit('playerAction', { playerId: playerId, action: 'stopMoveRight' });
        } else {
             socket.emit('playerAction', { playerId: playerId, action: 'stopMoveRight' });
             socket.emit('playerAction', { playerId: playerId, action: 'stopMoveLeft' });
        }
        
        // --- 2. SALTO (A [0] - Salto Variable) ---
        
        const aButtonPressed = gamepad.buttons[0] && gamepad.buttons[0].pressed; 

        if (aButtonPressed) {
            if (!player.isJumpingHeld) {
                socket.emit('playerAction', { playerId: playerId, action: 'jump' });
                player.isJumpingHeld = true; 
            }
        } else {
             if (player.isJumpingHeld) {
                 socket.emit('playerAction', { playerId: playerId, action: 'stopJump' });
                 player.isJumpingHeld = false;
             }
        }

        // --- 3. DASH (B [1] O RT [Eje 5]) ---
        const rt_axis = gamepad.axes[5] || 0;
        const dashButtonPressed = (gamepad.buttons[1] && gamepad.buttons[1].pressed) || 
                                  (rt_axis > 0.5); 
                                  
        if (dashButtonPressed) { 
            if (!player.isDashingButtonHeld) {
                socket.emit('playerAction', { playerId: playerId, action: 'dash' });
                player.isDashingButtonHeld = true; 
            }
        } else {
            player.isDashingButtonHeld = false;
        }

        // --- 4. CORRER (X [3] - Ajuste por Mapeo no Estándar) ---
        // (Usamos el índice 3 porque reportaste que el 2 no funcionaba para X)
        const runButtonPressed = (gamepad.buttons[3] && gamepad.buttons[3].pressed); 
                                 
        if (runButtonPressed) { 
             socket.emit('playerAction', { playerId: playerId, action: 'startRun' });
        } else {
             socket.emit('playerAction', { playerId: playerId, action: 'stopRun' });
        }

        // --- 5. MENÚ ---
        const menuButtonPressed = (gamepad.buttons[9] && gamepad.buttons[9].pressed);
        
        if (menuButtonPressed) {
             if (!player.isMenuButtonHeld) {
                toggleGamepadMenu();
                player.isMenuButtonHeld = true;
            }
        } else {
            player.isMenuButtonHeld = false;
        }
    }
}


// --- Manejo de la Conexión y Datos ---

socket.on('connect', () => {
    statusDiv.textContent = `Conectado. ID: ${socket.id}. Usa ESPACIO, A, D / Flechas para moverte. SHIFT para Dash.`;
    
    localPlayerIds = [socket.id]; 
    
    if (!players[socket.id]) {
        players[socket.id] = {
            id: socket.id,
            color: '#2c3e50',
            isJumpingHeld: false,
            isDashingButtonHeld: false,
            isMenuButtonHeld: false,
        };
    }
    
    players[socket.id].isJumpingHeld = false;
    players[socket.id].isDashingButtonHeld = false;
    players[socket.id].isMenuButtonHeld = false;
    
    if (showGamepadMenu) {
        buildGamepadMenu();
    }
});

socket.on('localPlayerCreated', (data) => {
    if (!localPlayerIds.includes(data.playerId)) {
        localPlayerIds.push(data.playerId);
    }
    if (showGamepadMenu) {
        buildGamepadMenu(); 
    }
    statusDiv.textContent = `✅ Jugador ${data.playerId.substring(0, 7)} añadido localmente.`;
});

socket.on('levelData', (data) => {
    currentPlatforms = data.platforms;
    currentBoostZones = data.boostZones;
    currentObstacles = data.obstacles; 
    currentWalls = data.walls || []; 
    currentGoalFlag = data.goalFlag;
    currentLadders = data.ladders || [];
    currentPortals = data.portals || [];
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
    
    if (localPlayer) {
        if (localPlayerColor !== localPlayer.color) {
            localPlayerColor = localPlayer.color;
            document.body.style.backgroundColor = localPlayerColor; 
        }
        if (!localPlayer.isJumpingHeld) localPlayer.isJumpingHeld = false;
        if (!localPlayer.isDashingButtonHeld) localPlayer.isDashingButtonHeld = false;
        if (!localPlayer.isMenuButtonHeld) localPlayer.isMenuButtonHeld = false;
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
    
    // Cámara Horizontal (X) - Usando VIEW_WIDTH
    let targetX = player.x - VIEW_WIDTH / 2;
    if (targetX < 0) targetX = 0;
    const maxCameraX = GAME_WORLD_WIDTH - VIEW_WIDTH; 
    if (targetX > maxCameraX) targetX = maxCameraX;
    cameraX = targetX;

    // Cámara Vertical (Y) - Usando VIEW_HEIGHT
    let targetY = player.y - VIEW_HEIGHT / 2;
    if (targetY < 0) targetY = 0;
    const maxCameraY = GAME_WORLD_HEIGHT - VIEW_HEIGHT;
    if (targetY > maxCameraY) targetY = maxCameraY;
    cameraY = targetY;
}


// *** FUNCIÓN MODIFICADA PARA RESALTAR JUGADORES LOCALES ***
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

    // Efecto visual de Wall Slide
    if (player.isWallSliding) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#3498db'; // Azul
        ctx.fillText('SLIDE', drawX, drawY - 5);
    }
    
    // Resaltar a los jugadores controlados/vistos localmente
    if (localPlayerIds.includes(player.id)) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, player.width, player.height);
    }
}

// Las funciones de dibujo ahora usan VIEW_WIDTH y VIEW_HEIGHT
function drawPlatforms() {
    if (currentPlatforms.length === 0) return; 
    currentPlatforms.forEach(p => { 
        const drawX = p.x - cameraX;
        const drawY = p.y - cameraY; 
        if (drawX + p.width > 0 && drawX < VIEW_WIDTH && drawY + p.height > 0 && drawY < VIEW_HEIGHT) {
            ctx.fillStyle = p.color;
            ctx.fillRect(drawX, drawY, p.width, p.height);
        }
    });
}

function drawWalls() {
    if (currentWalls.length === 0) return; 
    currentWalls.forEach(wall => { 
        const drawX = wall.x - cameraX;
        const drawY = wall.y - cameraY; 
        if (drawX + wall.width > 0 && drawX < VIEW_WIDTH && drawY + wall.height > 0 && drawY < VIEW_HEIGHT) {
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
        if (drawX + zone.width > 0 && drawX < VIEW_WIDTH && drawY + zone.height > 0 && drawY < VIEW_HEIGHT) {
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
        if (drawX + obs.width > 0 && drawX < VIEW_WIDTH && drawY + obs.height > 0 && drawY < VIEW_HEIGHT) {
            ctx.fillStyle = obs.color;
            ctx.fillRect(drawX, drawY, obs.width, obs.height);
        }
    });
}

function drawLadders() {
    if (currentLadders.length === 0) return; 
    currentLadders.forEach(ladder => { 
        const drawX = ladder.x - cameraX;
        const drawY = ladder.y - cameraY; 
        if (drawX + ladder.width > 0 && drawX < VIEW_WIDTH && drawY + ladder.height > 0 && drawY < VIEW_HEIGHT) {
            ctx.fillStyle = ladder.color;
            ctx.fillRect(drawX, drawY, ladder.width, ladder.height);
            
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            const stepHeight = 20;
            for (let y = 0; y < ladder.height; y += stepHeight) {
                ctx.beginPath();
                ctx.moveTo(drawX + 3, drawY + y);
                ctx.lineTo(drawX + ladder.width - 3, drawY + y);
                ctx.stroke();
            }
        }
    });
}

function drawPortals() {
    if (currentPortals.length === 0) return; 
    currentPortals.forEach(portal => { 
        const drawX = portal.x - cameraX;
        const drawY = portal.y - cameraY; 
        if (drawX + portal.width > 0 && drawX < VIEW_WIDTH && drawY + portal.height > 0 && drawY < VIEW_HEIGHT) {
            ctx.fillStyle = portal.color;
            ctx.globalAlpha = 0.8; 
            ctx.fillRect(drawX, drawY, portal.width, portal.height);
            ctx.globalAlpha = 1.0; 
            
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(drawX, drawY, portal.width, portal.height);
            
            ctx.font = '10px sans-serif';
            ctx.fillStyle = 'black';
            ctx.fillText(`P${portal.id}`, drawX + portal.width/2 - 5, drawY + portal.height/2 + 3);
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


// --- Actualización de la UI (Dash Cooldown) (Sin Cambios) ---
function updateUI(localPlayer) {
    if (!localPlayer) {
        dashStatusDiv.textContent = 'Dash: (Conectando...)';
        return;
    }
    
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


// *** FUNCIÓN GAMELOOP ***
function gameLoop() {
    // 1. Calcular jugadores activos
    const activeLocalPlayers = localPlayerIds.slice(0, MAX_LOCAL_PLAYERS).filter(id => players[id]);
    
    // 2. Ajustar el tamaño del canvas y las vistas
    updateCanvasDimensions(activeLocalPlayers.length); 
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (activeLocalPlayers.length === 0) {
        // Lógica de respaldo
        updateCamera({ x: GAME_WORLD_WIDTH / 2, y: GAME_WORLD_HEIGHT / 2 }); 
        drawPlatforms();
        // ... (resto de funciones de dibujo)
        drawWalls(); 
        drawLadders(); 
        drawPortals();
        drawBoostZones();
        drawObstacles(); 
        drawFlag();
        for (const id in players) {
            drawPlayer(players[id]);
        }
    }


    activeLocalPlayers.forEach((playerId, index) => {
        const player = players[playerId];
        if (!player) return;
        
        // 3. Configurar la cámara para el jugador en esta vista
        updateCamera(player); 
        
        // 4. Calcular la posición de la sub-pantalla (celda dinámica)
        let clipX, clipY;
        
        if (activeLocalPlayers.length === 1) {
            clipX = 0;
            clipY = 0;
        } else if (activeLocalPlayers.length === 2) {
            clipX = index * VIEW_WIDTH;
            clipY = 0;
        } else { // 3 o 4 jugadores (2x2)
            const col = index % 2;
            const row = Math.floor(index / 2);
            clipX = col * VIEW_WIDTH;
            clipY = row * VIEW_HEIGHT;
        }
        
        // 5. Transformación y Clipping
        ctx.save();
        
        // Área de recorte (Clip)
        ctx.beginPath();
        ctx.rect(clipX, clipY, VIEW_WIDTH, VIEW_HEIGHT);
        ctx.clip();
        
        // Trasladar para que (0, 0) sea la esquina superior de la celda
        ctx.translate(clipX, clipY);

        // 6. Dibujar la escena COMPLETA
        drawPlatforms();
        drawWalls(); 
        drawLadders(); 
        drawPortals();
        drawBoostZones();
        drawObstacles(); 
        drawFlag();
        
        // Dibujar a TODOS los jugadores
        for (const id in players) {
            drawPlayer(players[id]);
        }
        
        // 7. Restaurar el contexto
        ctx.restore();
    });

    // 8. Dibujar las líneas divisorias
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 4;
    
    if (activeLocalPlayers.length === 2) {
        // Línea vertical para 2 jugadores
        ctx.beginPath();
        ctx.moveTo(VIEW_WIDTH, 0);
        ctx.lineTo(VIEW_WIDTH, CANVAS_HEIGHT);
        ctx.stroke();
    } else if (activeLocalPlayers.length >= 3) {
        // Línea vertical y horizontal para 3 o 4 jugadores (cuadrícula)
        ctx.beginPath();
        ctx.moveTo(VIEW_WIDTH, 0);
        ctx.lineTo(VIEW_WIDTH, CANVAS_HEIGHT);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, VIEW_HEIGHT);
        ctx.lineTo(CANVAS_WIDTH, VIEW_HEIGHT);
        ctx.stroke();
    }
    
    // 9. Procesar entrada del mando
    handleGamepadInput();
    
    // 10. Actualizar la UI del jugador principal (si existe)
    const primaryPlayer = players[socket.id]; 
    if (primaryPlayer) {
        updateUI(primaryPlayer); 
    }

    requestAnimationFrame(gameLoop);
}

// Llamar a la función de dimensiones una vez antes del loop
updateCanvasDimensions(1); 
gameLoop();


// --- Manejo de la Entrada del Jugador (Teclado) (Sin Cambios) ---

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
    
    if (e.key === ' ' || e.key === 'ArrowUp') {
        socket.emit('playerAction', { action: 'stopJump' });
    }

    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        socket.emit('playerAction', { action: 'stopMoveLeft' });
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        socket.emit('playerAction', { action: 'stopMoveRight' });
    }
});

// --- Manejo de la Detección de Mandos (Gamepad API Events) (Sin Cambios) ---

window.addEventListener("gamepadconnected", (e) => {
    statusDiv.textContent = `✅ Mando ${e.gamepad.index} (${e.gamepad.id.substring(0, 15)}...) detectado.`;
    console.log("Gamepad conectado:", e.gamepad.id);
    
    if (showGamepadMenu) {
        buildGamepadMenu();
    }
});

window.addEventListener("gamepaddisconnected", (e) => {
    statusDiv.textContent = `❌ Mando ${e.gamepad.index} desconectado.`;
    console.log("Gamepad desconectado:", e.gamepad.id);
    
    if (showGamepadMenu) {
        delete gamepadAssignments[e.gamepad.index]; 
        buildGamepadMenu();
    }
});