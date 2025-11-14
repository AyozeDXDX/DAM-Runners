// game.js (CORREGIDO)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Referencias a los contenedores
const gameWrapper = document.getElementById('game-wrapper'); 
const uiOverlay = document.getElementById('ui-overlay');     
const gameCanvasContainer = document.getElementById('game-canvas-container'); 

// Creación de elementos de UI
const statusDiv = document.createElement('p');
statusDiv.id = 'status';
statusDiv.textContent = 'Conectando al servidor...';

const levelNameDiv = document.createElement('div'); 
levelNameDiv.id = 'levelName';

const dashStatusDiv = document.createElement('div');
dashStatusDiv.id = 'dashStatus';

// --- Botón de Mandos ---
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

// Adjuntar UI al Overlay
uiOverlay.appendChild(statusDiv);
uiOverlay.appendChild(levelNameDiv);
uiOverlay.appendChild(dashStatusDiv);
uiOverlay.appendChild(gamepadButton);

document.body.appendChild(menuContainer);


// --- Variables de Juego del cliente ---
const BASE_WIDTH = 800;
const BASE_HEIGHT = 400;

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
let currentFerrisWheels = []; 
let players = {};
let gameRunning = true; 
const keysPressed = {}; 
let localPlayerColor = '#2c3e50'; 
let localPlayerIds = [];

// --- Estado de Espectador ---
let isSpectating = false; // 💥 ¡CORRECCIÓN! Esto será 'true' solo si TODOS los locales terminaron
let spectatorIndex = 0;
let spectatorTargetId = null; // ID del jugador que estamos espectando
// ----------------------------------

const socket = io();
let cameraX = 0; 
let cameraY = 0; 

let gamepadAssignments = {}; 
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

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    gameWrapper.style.width = `${CANVAS_WIDTH}px`;
    gameWrapper.style.height = `auto`; 
    
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
                gStatusText += 'DISPONIBLE (Pulsa START para asignar)';
                
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

    for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i];
        if (!gamepad) continue; 

        const playerId = gamepadAssignments[gamepad.index];

        // CASO 1: Mando ASIGNADO
        if (playerId) {
            const player = players[playerId];
            if (!player) continue;

            // 💥 ¡CORRECCIÓN! Lógica de Espectador para Mando
            // Solo si ESTE jugador ha terminado, O si el modo espectador global está activo.
            if (player.state === 'finished' || isSpectating) {
                const dpad_left = gamepad.buttons[14] && gamepad.buttons[14].pressed; 
                const dpad_right = gamepad.buttons[15] && gamepad.buttons[15].pressed;
                const keyLeft = `Gamepad${gamepad.index}SpecLeft`;
                const keyRight = `Gamepad${gamepad.index}SpecRight`;
                
                if (dpad_left && !keysPressed[keyLeft]) {
                    spectatorIndex--; // Controla el índice global
                    keysPressed[keyLeft] = true;
                } else if (!dpad_left) {
                    keysPressed[keyLeft] = false;
                }
                
                if (dpad_right && !keysPressed[keyRight]) {
                    spectatorIndex++; // Controla el índice global
                    keysPressed[keyRight] = true;
                } else if (!dpad_right) {
                    keysPressed[keyRight] = false;
                }
                continue; // No procesar más inputs de juego
            }

            if (player.stunTimer > 0) continue;

            // --- 1. MOVIMIENTO HORIZONTAL ---
            const x_axis = gamepad.axes[0] || 0; 
            const dpad_left_move = gamepad.buttons[14] && gamepad.buttons[14].pressed; 
            const dpad_right_move = gamepad.buttons[15] && gamepad.buttons[15].pressed; 
            
            const leftKey = `Gamepad${gamepad.index}Left`;
            const rightKey = `Gamepad${gamepad.index}Right`;
            
            if (x_axis > 0.1 || dpad_right_move) {
                if (!keysPressed[rightKey]) {
                    socket.emit('playerAction', { playerId: playerId, action: 'startMoveRight' });
                    keysPressed[rightKey] = true;
                }
                if (keysPressed[leftKey]) { 
                    socket.emit('playerAction', { playerId: playerId, action: 'stopMoveLeft' });
                    keysPressed[leftKey] = false;
                }
            } else if (x_axis < -0.1 || dpad_left_move) {
                if (!keysPressed[leftKey]) {
                    socket.emit('playerAction', { playerId: playerId, action: 'startMoveLeft' });
                    keysPressed[leftKey] = true;
                }
                if (keysPressed[rightKey]) { 
                    socket.emit('playerAction', { playerId: playerId, action: 'stopMoveRight' });
                    keysPressed[rightKey] = false;
                }
            } else { 
                 if (keysPressed[leftKey]) {
                    socket.emit('playerAction', { playerId: playerId, action: 'stopMoveLeft' });
                    keysPressed[leftKey] = false;
                 }
                 if (keysPressed[rightKey]) {
                    socket.emit('playerAction', { playerId: playerId, action: 'stopMoveRight' });
                    keysPressed[rightKey] = false;
                 }
            }
            
            // --- 2. MOVIMIENTO VERTICAL (Salto/Escalera Arriba) ---
            const aButtonPressed = gamepad.buttons[0] && gamepad.buttons[0].pressed; 
            const dpadUpPressed = gamepad.buttons[12] && gamepad.buttons[12].pressed;
            const y_axis_up = (gamepad.axes[1] || 0) < -0.5; 
            const jumpKey = `Gamepad${gamepad.index}Jump`; 

            if (aButtonPressed || dpadUpPressed || y_axis_up) {
                if (!keysPressed[jumpKey]) {
                    socket.emit('playerAction', { playerId: playerId, action: 'jump' });
                    keysPressed[jumpKey] = true; 
                }
            } else {
                 if (keysPressed[jumpKey]) {
                     socket.emit('playerAction', { playerId: playerId, action: 'stopJump' });
                     keysPressed[jumpKey] = false;
                 }
            }

            // --- 3. MOVIMIENTO VERTICAL (Escalera Abajo) ---
            const dpadDownPressed = gamepad.buttons[13] && gamepad.buttons[13].pressed;
            const y_axis_down = (gamepad.axes[1] || 0) > 0.5; 
            const downKey = `Gamepad${gamepad.index}Down`; 

            if (dpadDownPressed || y_axis_down) {
                if (!keysPressed[downKey]) {
                    socket.emit('playerAction', { playerId: playerId, action: 'startMoveDown' });
                    keysPressed[downKey] = true; 
                }
            } else {
                 if (keysPressed[downKey]) {
                     socket.emit('playerAction', { playerId: playerId, action: 'stopMoveDown' });
                     keysPressed[downKey] = false;
                 }
            }

            // --- 4. DASH (B [1] O RT [Eje 5 o 4]) ---
            const rt_axis_xinput = gamepad.axes[5] || 0; 
            const rt_axis_dinput = gamepad.axes[4] || 0; 
            const dashButtonPressed = (gamepad.buttons[1] && gamepad.buttons[1].pressed) || 
                                      (rt_axis_xinput > 0.5) ||
                                      (rt_axis_dinput > 0.5); 
            const dashKey = `Gamepad${gamepad.index}Dash`;
                                      
            if (dashButtonPressed) { 
                if (!keysPressed[dashKey]) {
                    socket.emit('playerAction', { playerId: playerId, action: 'dash' });
                    keysPressed[dashKey] = true; 
                }
            } else {
                keysPressed[dashKey] = false;
            }

            // --- 5. CORRER (X [3]) ---
            const runButtonPressed = (gamepad.buttons[3] && gamepad.buttons[3].pressed); 
            const runKey = `Gamepad${gamepad.index}Run`;
                                 
            if (runButtonPressed) { 
                 if (!keysPressed[runKey]) {
                     socket.emit('playerAction', { playerId: playerId, action: 'startRun' });
                     keysPressed[runKey] = true;
                 }
            } else {
                 if (keysPressed[runKey]) {
                     socket.emit('playerAction', { playerId: playerId, action: 'stopRun' });
                     keysPressed[runKey] = false;
                 }
            }

            // --- 6. MENÚ (Start [9]) ---
            const menuButtonPressed = (gamepad.buttons[9] && gamepad.buttons[9].pressed);
            const menuKey = `Gamepad${gamepad.index}Menu`;
            
            if (menuButtonPressed) {
                 if (!keysPressed[menuKey]) {
                    toggleGamepadMenu();
                    keysPressed[menuKey] = true;
                }
            } else {
                keysPressed[menuKey] = false;
            }
        } 
        // CASO 2: Mando NO ASIGNADO
        else {
            const menuButtonPressed = (gamepad.buttons[9] && gamepad.buttons[9].pressed);
            const key = `Gamepad${gamepad.index}StartHeld`;

            if (menuButtonPressed && !keysPressed[key]) {
                keysPressed[key] = true;
                
                const assignedPlayerIds = Object.values(gamepadAssignments);
                let nextFreePlayerId = null;

                for (const localId of localPlayerIds) {
                    if (!assignedPlayerIds.includes(localId)) {
                        nextFreePlayerId = localId;
                        break; 
                    }
                }

                if (nextFreePlayerId) {
                    assignGamepad(gamepad.index, nextFreePlayerId);
                    statusDiv.textContent = `✅ Mando ${gamepad.index} asignado a Jugador ${nextFreePlayerId.substring(0, 7)}`;
                } else {
                    statusDiv.textContent = `⚠️ Mando ${gamepad.index} detectado, pero no hay jugadores locales libres. Añade uno en el menú.`;
                }
            } else if (!menuButtonPressed) {
                keysPressed[key] = false;
            }
        }
    }
}


// --- Manejo de la Conexión y Datos ---

socket.on('connect', () => {
    statusDiv.textContent = `Conectado. ID: ${socket.id}. Usa ESPACIO/W, A/D, S, J (Correr), SHIFT (Dash).`;
    
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
    currentFerrisWheels = data.ferrisWheels || []; 
    
    levelNameDiv.textContent = `Nivel: ${data.levelName}`;
    gameRunning = true; 
    isSpectating = false; // Resetear espectador
    spectatorIndex = 0;
});

socket.on('obstaclesUpdate', (obstaclesData) => {
    currentObstacles = obstaclesData;
});

socket.on('ferrisWheelUpdate', (ferrisWheelData) => {
    currentFerrisWheels = ferrisWheelData;
});


socket.on('gameState', (gameState) => {
    players = gameState.players;
    const localPlayer = players[socket.id];
    
    if (localPlayer) {
        if (localPlayerColor !== localPlayer.color) {
            localPlayerColor = localPlayer.color;
            document.body.style.backgroundColor = localPlayer.color; 
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
    // 💥 ¡CORRECCIÓN CRÍTICA!
    // NO activamos el modo espectador global aquí.
    // Solo actualizamos el mensaje y el target de espectador inicial.
    // isSpectating = true; // <-- ¡¡NO!! ESTE ES EL ERROR
    
    gameRunning = true; // Asegurarse de que el juego sigue
    
    const winner = players[data.winnerId];
    
    spectatorIndex = 0; // Empezar espectando al ganador (o al primero de la lista)
    spectatorTargetId = data.winnerId;

    if (winner) {
        statusDiv.textContent = `🎉 ¡Jugador ${winner.id.substring(0,4)} ha ganado! 🎉. (Modo Espectador: A/D o D-Pad para cambiar)`;
        statusDiv.style.color = winner.color; 
    }
    
    // Cambiar texto si TÚ ganaste
    if (localPlayerIds.includes(data.winnerId)) {
        statusDiv.textContent = `🎉 ¡HAS GANADO! 🎉 (Espectando... A/D o D-Pad para cambiar)`;
    }
});

socket.on('gameTimerUpdate', (timeLeft) => {
    // 💥 CORRECCIÓN: Comprobar el estado del jugador local principal
    const primaryPlayer = players[localPlayerIds[0]];
    if (isSpectating || (primaryPlayer && primaryPlayer.state === 'finished')) {
         statusDiv.textContent = `Nueva ronda en ${timeLeft}s... (Espectando a ${spectatorTargetId.substring(0,4)})`;
    }
});

socket.on('spectatorChange', (data) => {
    // 💥 CORRECCIÓN: Esto es solo si el jugador local está en modo espectador
    const primaryPlayer = players[localPlayerIds[0]];
    if (isSpectating || (primaryPlayer && primaryPlayer.state === 'finished')) {
        spectatorIndex += data.direction;
    }
});


socket.on('dashEffect', (data) => {
    // Efecto visual
});


// --- Lógica de Dibujo y Cámara ---
function updateCamera(player) {
    if (!player) return;
    
    let targetX = player.x - VIEW_WIDTH / 2;
    if (targetX < 0) targetX = 0;
    const maxCameraX = GAME_WORLD_WIDTH - VIEW_WIDTH; 
    if (targetX > maxCameraX) targetX = maxCameraX;
    cameraX = targetX;

    let targetY = player.y - VIEW_HEIGHT / 2;
    if (targetY < 0) targetY = 0;
    const maxCameraY = GAME_WORLD_HEIGHT - VIEW_HEIGHT;
    if (targetY > maxCameraY) targetY = maxCameraY;
    cameraY = targetY;
}


function drawPlayer(player) {
    // 💥 CORRECCIÓN: No ocultar jugadores, solo hacerlos transparentes si terminaron.
    // if (player.state === 'finished' && !isSpectating) {
    //     return; 
    // }
    
    const drawX = player.x - cameraX;
    const drawY = player.y - cameraY; 
    
    ctx.fillStyle = player.color;
    // 💥 NUEVO: Hacer transparente al jugador si está terminado
    ctx.globalAlpha = (player.state === 'finished') ? 0.3 : 1.0;
    
    ctx.fillRect(drawX, drawY, player.width, player.height);
    
    ctx.globalAlpha = 1.0; // Resetear transparencia
    
    if (player.stunTimer > 0) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)'; 
        ctx.fillRect(drawX, drawY - 10, player.width, 5); 
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'yellow';
        ctx.fillText('STUN!', drawX, drawY - 15);
    }

    if (player.isWallSliding) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#3498db';
        ctx.fillText('SLIDE', drawX, drawY - 5);
    }
    
    // 💥 CORRECCIÓN: El resaltado (stroke) se mueve al gameLoop principal
    // para manejar correctamente la cámara/viewport.
}

// Funciones de Dibujo
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

function drawFerrisWheels() {
    if (currentFerrisWheels.length === 0) return;
    currentFerrisWheels.forEach(wheel => {
        wheel.platforms.forEach(p => {
            const drawX = p.x - cameraX;
            const drawY = p.y - cameraY;
            
            if (drawX + p.width > 0 && drawX < VIEW_WIDTH && drawY + p.height > 0 && drawY < VIEW_HEIGHT) {
                ctx.fillStyle = wheel.color || '#8e44ad';
                ctx.fillRect(drawX, drawY, p.width, p.height);
            }
        });
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
    let activeLocalPlayers = localPlayerIds.slice(0, MAX_LOCAL_PLAYERS).filter(id => players[id]);
    
    // 💥 ¡NUEVA LÓGICA DE ESPECTADOR!
    // Se activa el modo espectador global (isSpectating) SI Y SÓLO SI
    // TODOS los jugadores locales han terminado la carrera.
    let allLocalPlayersFinished = activeLocalPlayers.length > 0 && activeLocalPlayers.every(id => players[id] && players[id].state === 'finished');
    
    isSpectating = allLocalPlayersFinished; // Actualizar el estado global

    let cameraTarget = null; // Para el modo espectador global
    
    if (isSpectating) {
        // 💥 MODO ESPECTADOR GLOBAL (TODOS TERMINARON)
        const playingPlayers = Object.values(players).filter(p => p.state === 'playing');
        const finishedPlayers = Object.values(players).filter(p => p.state === 'finished');
        
        // Prioritizar espectar a los que siguen jugando (si los hay)
        let targetList = playingPlayers.length > 0 ? playingPlayers : finishedPlayers;

        if (targetList.length > 0) {
            if (spectatorIndex >= targetList.length) spectatorIndex = 0;
            if (spectatorIndex < 0) spectatorIndex = targetList.length - 1;
            cameraTarget = targetList[spectatorIndex];
            spectatorTargetId = cameraTarget.id; 
        } else {
            cameraTarget = players[localPlayerIds[0]]; // Fallback
        }
        
        // En modo espectador, siempre hay 1 vista
        activeLocalPlayers = [cameraTarget ? cameraTarget.id : localPlayerIds[0]];
    } else {
        // 💥 MODO DE JUEGO NORMAL (ALGUIEN SIGUE JUGANDO)
        // La lista de vistas (activeLocalPlayers) es la de jugadores locales
        cameraTarget = players[localPlayerIds[0]]; // P1 controla la UI
    }

    // 2. Ajustar el tamaño del canvas y las vistas
    updateCanvasDimensions(isSpectating ? 1 : activeLocalPlayers.length); 
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (activeLocalPlayers.length === 0 && players[socket.id]) {
         activeLocalPlayers = [socket.id]; // Fallback
    }

    // 💥 VISTAS (VIEWPORTS)
    activeLocalPlayers.forEach((playerId, index) => {
        
        // 💥 ¡LÓGICA DE CÁMARA POR VISTA!
        let playerForThisView;

        if (isSpectating) {
            // Modo espectador global (todos terminaron), seguir al target global
            playerForThisView = cameraTarget; 
        } else {
            // Modo split-screen
            playerForThisView = players[playerId];
            
            if (playerForThisView && playerForThisView.state === 'finished') {
                // Modo espectador INDIVIDUAL (este jugador terminó, pero otros no)
                const playingPlayers = Object.values(players).filter(p => p.state === 'playing');
                const finishedPlayers = Object.values(players).filter(p => p.state === 'finished');
                let targetList = playingPlayers.length > 0 ? playingPlayers : finishedPlayers;
                
                if (targetList.length > 0) {
                    // El spectatorIndex es global, controlado por el input de este jugador
                    if (spectatorIndex >= targetList.length) spectatorIndex = 0;
                    if (spectatorIndex < 0) spectatorIndex = targetList.length - 1;
                    playerForThisView = targetList[spectatorIndex];
                    spectatorTargetId = playerForThisView.id;
                }
            }
        }

        if (!playerForThisView) return; // Seguridad
        
        // 3. Configurar la cámara para ESTA VISTA
        updateCamera(playerForThisView); 
        
        // 4. Calcular la posición de la sub-pantalla (celda dinámica)
        let clipX, clipY;
        
        if (activeLocalPlayers.length === 1) { // 1 Jugador (o espectador)
            clipX = 0;
            clipY = 0;
        } else if (activeLocalPlayers.length === 2) { // 2 Jugadores
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
        
        ctx.beginPath();
        ctx.rect(clipX, clipY, VIEW_WIDTH, VIEW_HEIGHT);
        ctx.clip();
        
        ctx.translate(clipX, clipY);

        // 6. Dibujar la escena COMPLETA
        drawPlatforms();
        drawWalls(); 
        drawLadders(); 
        drawPortals();
        drawFerrisWheels(); 
        drawBoostZones();
        drawObstacles(); 
        drawFlag();
        
        // Dibujar a TODOS los jugadores
        for (const id in players) {
            drawPlayer(players[id]);
        }
        
        // 6.5. 💥 ¡NUEVO! Dibujar resaltados (Stroke)
        
        // Resaltar el jugador que ESTA VISTA está siguiendo (borde amarillo)
        if (playerForThisView) {
            ctx.strokeStyle = '#f1c40f'; // Borde amarillo
            ctx.lineWidth = 3;
            ctx.strokeRect(playerForThisView.x - cameraX, playerForThisView.y - cameraY, playerForThisView.width, playerForThisView.height);
        }
        
        // Resaltar OTROS jugadores locales que estén en esta vista (borde blanco)
        for (const localId of localPlayerIds) {
            if (localId !== playerForThisView.id && players[localId] && players[localId].state === 'playing') {
                const otherLocal = players[localId];
                ctx.strokeStyle = 'white'; 
                ctx.lineWidth = 2;
                ctx.strokeRect(otherLocal.x - cameraX, otherLocal.y - cameraY, otherLocal.width, otherLocal.height);
            }
        }
        
        // 7. Restaurar el contexto
        ctx.restore();
    });

    // 8. Dibujar las líneas divisorias
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 4;
    
    if (activeLocalPlayers.length === 2) {
        ctx.beginPath();
        ctx.moveTo(VIEW_WIDTH, 0);
        ctx.lineTo(VIEW_WIDTH, CANVAS_HEIGHT);
        ctx.stroke();
    } else if (activeLocalPlayers.length >= 3) {
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


// --- Manejo de la Entrada del Jugador (Teclado) ---

document.addEventListener('keydown', (e) => {
    const gameKeys = [' ', 'ArrowUp', 'w', 'ArrowLeft', 'a', 'ArrowRight', 'd', 'ArrowDown', 's', 'Shift', 'j'];
    if (gameKeys.includes(e.key) || gameKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
    }

    const localPlayer = players[socket.id]; // Teclado solo controla P1

    // 💥 ¡CORRECCIÓN! Lógica de Espectador para Teclado
    // Si el JUGADOR 1 (teclado) ha terminado, O si TODOS han terminado (global)
    if ((localPlayer && localPlayer.state === 'finished') || isSpectating) {
        if (!keysPressed[e.key]) {
            if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                spectatorIndex--;
                keysPressed[e.key] = true;
            } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                spectatorIndex++;
                keysPressed[e.key] = true;
            }
        }
        return; // No procesar inputs de juego
    }

    // 💥 CORRECCIÓN: (gameRunning ya no se usa para esto)
    if (localPlayer && localPlayer.stunTimer > 0) {
        if (e.key === 'Shift' || e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'j') { 
            keysPressed[e.key] = true; 
        }
        return;
    }

    if (!keysPressed[e.key]) {
        keysPressed[e.key] = true;

        if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { 
            socket.emit('playerAction', { action: 'jump' });
        } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
            socket.emit('playerAction', { action: 'startMoveLeft' });
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
            socket.emit('playerAction', { action: 'startMoveRight' });
        } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { 
            socket.emit('playerAction', { action: 'startMoveDown' }); 
        } else if (e.key === 'Shift') { 
            socket.emit('playerAction', { action: 'dash' });
        } else if (e.key.toLowerCase() === 'j') { 
            socket.emit('playerAction', { action: 'startRun' });
        }
    }
});

document.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
    
    const localPlayer = players[socket.id]; // Teclado solo controla P1

    // 💥 CORRECCIÓN: Si P1 terminó, o todos terminaron, ignorar keyup de juego
    if ((localPlayer && localPlayer.state === 'finished') || isSpectating) return; 

    // 💥 CORRECCIÓN: (gameRunning ya no se usa)
    if (localPlayer && localPlayer.stunTimer > 0) {
        return; 
    }
    
    // DETENER MOVIMIENTO VERTICAL
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { 
        socket.emit('playerAction', { action: 'stopJump' });
    } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { 
        socket.emit('playerAction', { action: 'stopMoveDown' });
    }

    // DETENER MOVIMIENTO HORIZONTAL
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        socket.emit('playerAction', { action: 'stopMoveLeft' });
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        socket.emit('playerAction', { action: 'stopMoveRight' });
    }
    
    // DETENER "CORRER"
    if (e.key.toLowerCase() === 'j') {
        socket.emit('playerAction', { action: 'stopRun' });
    }
});


// --- Manejo de la Detección de Mandos (Gamepad API Events) ---

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
