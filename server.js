const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --- Constantes de Juego ---
const GRAVITY = 800;
const HORIZONTAL_SPEED = 250; 
const RUN_SPEED = 400; 
const JUMP_VELOCITY = -500;
const GAME_WORLD_WIDTH = 2500; 
const GAME_WORLD_HEIGHT = 800; 
const DEATH_Y = 850;
const LADDER_SPEED = 200; 

// --- Dash (AJUSTADO) ---
const DASH_SPEED = 1200; 
const DASH_DURATION = 0.2; 
const DASH_COOLDOWN_TIME = 2; 

// --- Boost ---
const BOOST_MULTIPLIER = 2.0;
const BOOST_DURATION = 3; 

// --- Stun ---
const STUN_DURATION = 2.0; 

// --- Wall Jump ---
const WALL_SLIDE_SPEED = 100; 
const WALL_JUMP_VELOCITY_Y = -450; 
const WALL_JUMP_VELOCITY_X = 300; 
const WALL_JUMP_COOLDOWN = 0.15;

// --- Portal Cooldown ---
const PORTAL_COOLDOWN_TIME = 1.5;
 
// --- Salto Variable ---
const JUMP_DAMPENING = 0.5; 

let players = {}; 
let goalFlag = {}; 
let currentLevelIndex = -1; 

let currentPlatforms = [];
let currentWalls = [];
let currentBoostZones = []; 
let currentObstacles = [];
let currentLadders = [];
let currentPortals = []; 

// --- NUEVO: Mapa para gestionar cuántos jugadores locales tiene cada socket ---
let localPlayersMap = {}; 
// -----------------------------------------------------------------------------

// --- Definición de Niveles ---
const LEVELS = [
    {
        name: "La Gran Escalada (con Muros)",
        platforms: [
            { x: 550, y: 700, width: 150, height: 10, color: '#e67e22' },
            { x: 750, y: 480, width: 150, height: 10, color: '#e67e22' },
            { x: 950, y: 400, width: 100, height: 10, color: '#e67e22' },
            { x: 1100, y: 320, width: 100, height: 10, color: '#e67e22' },
            { x: 1250, y: 250, width: 150, height: 10, color: '#e67e22' },
            { x: 1000, y: 150, width: 100, height: 10, color: '#e67e22' },
        ],
        walls: [ 
            { x: 0, y: 780, width: 500, height: 20, color: '#27ae60' }, 
            { x: 600, y: 540, width: 100, height: 20, color: '#e67e22' },
            { x: 400, y: 620, width: 20, height: 100, color: '#7f8c8d' }, 
            { x: 730, y: 480, width: 20, height: 150, color: '#7f8c8d' }, 
            { x: 1230, y: 250, width: 20, height: 100, color: '#7f8c8d' } 
        ],
        boostZones: [
            { x: 550, y: 680, width: 150, height: 5, color: '#3498db' } 
        ],
        obstacles: [
            { x: 750, y: 450, width: 30, height: 30, color: '#e74c3c', min: 750, max: 900, speed: 100, dir: 1, isVertical: false },
        ],
        ladders: [],
        portals: [],
        goalX: 1030, 
        goalY: 100,  
    },
    {
        name: "Montañas Iniciales (Mixtas)",
        platforms: [
            { x: 100, y: 700, width: 150, height: 10, color: '#e67e22' },
            { x: 500, y: 550, width: 150, height: 10, color: '#e67e22' },
            { x: 750, y: 680, width: 120, height: 10, color: '#e67e22' },
            { x: 1300, y: 600, width: 150, height: 10, color: '#e67e22' },
            { x: 1550, y: 500, width: 100, height: 10, color: '#e67e22' },
            { x: 2000, y: 550, width: 100, height: 10, color: '#e67e22' },
        ],
        walls: [
            { x: 0, y: 780, width: GAME_WORLD_WIDTH, height: 20, color: '#27ae60' },
            { x: 300, y: 620, width: 100, height: 20, color: '#e67e22' },
            { x: 900, y: 590, width: 100, height: 20, color: '#e67e22' },
            { x: 1100, y: 520, width: 80, height: 20, color: '#e67e22' },
            { x: 1700, y: 680, width: 200, height: 20, color: '#e67e22' },
            { x: 900, y: 590, width: 20, height: 100, color: '#7f8c8d' },
        ],
        boostZones: [
            { x: 1300, y: 580, width: 150, height: 5, color: '#3498db' }
        ],
        obstacles: [
            { x: 500, y: 520, width: 30, height: 30, color: '#e74c3c', min: 500, max: 700, speed: 100, dir: 1, isVertical: false },
        ],
        ladders: [],
        portals: [],
        goalX: 2150, 
        goalY: 500,  
    },
    {
        name: "Torreones del Vacío (Soporte)",
        platforms: [
            { x: 0, y: 780, width: 200, height: 20, color: '#27ae60' }, 
            { x: 300, y: 700, width: 100, height: 20, color: '#555' },
            { x: 450, y: 600, width: 80, height: 20, color: '#555' },
            { x: 600, y: 720, width: 120, height: 20, color: '#555' },
            { x: 800, y: 650, width: 100, height: 20, color: '#555' },
            { x: 1000, y: 550, width: 150, height: 20, color: '#555' },
            { x: 1200, y: 680, width: 100, height: 20, color: '#555' },
            { x: 1400, y: 580, width: 80, height: 20, color: '#555' },
            { x: 1600, y: 700, width: 120, height: 20, color: '#555' },
            { x: 1800, y: 600, width: 150, height: 20, color: '#555' },
            { x: 2000, y: 500, width: 100, height: 20, color: '#555' },
        ],
        walls: [],
        boostZones: [],
        obstacles: [],
        ladders: [],
        portals: [],
        goalX: 2150,
        goalY: 450,
    },
    {
        name: "Pico Serpiente (Sólido y Deslizante)",
        platforms: [
            { x: 300, y: 700, width: 100, height: 20, color: '#8e44ad' }, 
            { x: 100, y: 620, width: 100, height: 20, color: '#8e44ad' }, 
            { x: 300, y: 540, width: 100, height: 20, color: '#8e44ad' }, 
            { x: 100, y: 460, width: 100, height: 20, color: '#8e44ad' }, 
            { x: 300, y: 380, width: 100, height: 20, color: '#8e44ad' }, 
            { x: 100, y: 300, width: 100, height: 20, color: '#8e44ad' }, 
        ],
        walls: [
            { x: 0, y: 780, width: 200, height: 20, color: '#27ae60' },
            { x: 0, y: 220, width: 50, height: 20, color: '#8e44ad' },
            { x: 400, y: 380, width: 20, height: 320, color: '#7f8c8d' },
            { x: 80, y: 300, width: 20, height: 160, color: '#7f8c8d' },
        ],
        boostZones: [
            { x: 300, y: 680, width: 100, height: 5, color: '#3498db' }
        ],
        obstacles: [
            { x: 150, y: 700, width: 20, height: 20, color: '#e74c3c', min: 700, max: 760, speed: 100, dir: 1, isVertical: true },
        ],
        ladders: [],
        portals: [],
        goalX: 10,
        goalY: 170, 
    },
    {
        name: "Ascenso Vertical (con Escaleras)",
        platforms: [
            { x: 300, y: 700, width: 100, height: 10, color: '#e67e22' },
            { x: 500, y: 600, width: 100, height: 10, color: '#e67e22' },
            { x: 300, y: 500, width: 100, height: 10, color: '#e67e22' },
            { x: 500, y: 400, width: 100, height: 10, color: '#e67e22' },
            { x: 300, y: 300, width: 100, height: 10, color: '#e67e22' },
        ],
        walls: [
            { x: 0, y: 780, width: 800, height: 20, color: '#27ae60' }, 
            { x: 700, y: 600, width: 80, height: 20, color: '#7f8c8d' },
            { x: 700, y: 200, width: 100, height: 20, color: '#27ae60' },
        ],
        boostZones: [
            { x: 700, y: 580, width: 80, height: 20, color: '#3498db' } 
        ],
        obstacles: [
            { x: 450, y: 450, width: 30, height: 30, color: '#e74c3c', min: 450, max: 650, speed: 100, dir: 1, isVertical: false },
        ],
        portals: [],
        ladders: [
            { x: 650, y: 200, width: 30, height: 580, color: '#9b59b6' } 
        ],
        goalX: 750, 
        goalY: 150,  
    },
    {
        name: "Laberinto de Portales (Corregido)",
        platforms: [
            { x: 1000, y: 350, width: 150, height: 10, color: '#e67e22' },
            { x: 1900, y: 700, width: 100, height: 10, color: '#e67e22' },
        ],
        walls: [
            { x: 0, y: 780, width: 2500, height: 20, color: '#27ae60' }, 
            { x: 1500, y: 650, width: 50, height: 130, color: '#7f8c8d' },
            { x: 250, y: 550, width: 20, height: 230, color: '#7f8c8d' }, 
        ],
        boostZones: [
            { x: 80, y: 760, width: 80, height: 20, color: '#3498db' } 
        ],
        obstacles: [
            { x: 1050, y: 320, width: 30, height: 30, color: '#e74c3c', min: 200, max: 320, speed: 100, dir: -1, isVertical: true },
        ],
        ladders: [
            { x: 50, y: 550, width: 20, height: 230, color: '#9b59b6' } 
        ],
        portals: [
            { id: 1, x: 10, y: 500, width: 30, height: 40, targetId: 2, color: '#f1c40f' }, 
            { id: 2, x: 1050, y: 310, width: 30, height: 40, targetId: 1, color: '#3498db' }, 
        ],
        goalX: 2150, 
        goalY: 740,  
    },
];

// --- Lógica de Nivel y Juego ---
function resetGame(newLevel = true) {
    if (newLevel) {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * LEVELS.length);
        } while (newIndex === currentLevelIndex && LEVELS.length > 1);
        currentLevelIndex = newIndex;
    }
    
    const currentLevel = LEVELS[currentLevelIndex];
    currentPlatforms = currentLevel.platforms || [];
    currentWalls = currentLevel.walls || [];
    currentBoostZones = currentLevel.boostZones || [];
    currentObstacles = JSON.parse(JSON.stringify(currentLevel.obstacles || [])); 
    currentLadders = currentLevel.ladders || []; 
    currentPortals = currentLevel.portals || []; 

    goalFlag = {
        x: currentLevel.goalX,
        y: currentLevel.goalY,
        width: 30, height: 50, color: '#f1c40f' 
    };

    for (const id in players) {
        resetPlayer(players[id]);
    }
    
    console.log(`Nivel cargado: ${currentLevel.name}`);
    
    io.sockets.emit('levelData', {
        platforms: currentPlatforms,
        boostZones: currentBoostZones,
        obstacles: currentObstacles,
        walls: currentWalls,
        ladders: currentLadders,
        portals: currentPortals,
        goalFlag: goalFlag,
        levelName: LEVELS[currentLevelIndex].name
    });
    io.sockets.emit('gameState', { players: players }); 
}

function resetPlayer(player, death = false) {
    if (death) {
        player.x = player.lastSafePlatform.x;
        player.y = player.lastSafePlatform.y;
    } else {
        player.x = 50;
        player.y = 740; 
        player.lastSafePlatform = { x: 50, y: 740 };
        if (!death) {
            player.vx = 0; 
        }
    }
    
    player.vy = 0;
    player.onGround = false;
    player.score = 0; 
    player.lastDashTime = 0; 
    player.isDashing = false;
    player.dashTimer = 0;
    player.boostTimer = 0;
    player.stunTimer = 0; 
    player.isWallSliding = false; 
    player.wallSlideDir = 0;   
    player.wallJumpTimer = 0;
    player.keys.up = false;
    player.keys.down = false; 
    player.portalCooldownTimer = 0;
    player.isRunning = false; 
    player.vx_override = 0; // Se asegura de que no haya velocidad residual
}

resetGame();

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado:', socket.id);
    
    // INICIALIZACIÓN DEL MAPA DE JUGADORES LOCALES PARA ESTE SOCKET
    localPlayersMap[socket.id] = 0; 

    // CREACIÓN DEL JUGADOR PRINCIPAL
    players[socket.id] = {
        id: socket.id,
        x: 50, y: 740, width: 20, height: 40,
        color: getRandomColor(),
        vx: 0, vy: 0, 
        onGround: false, score: 0, 
        lastDashTime: 0, 
        isDashing: false, dashTimer: 0,
        boostTimer: 0,
        stunTimer: 0, 
        isWallSliding: false, 
        wallSlideDir: 0,   
        wallJumpTimer: 0, 
        lastSafePlatform: { x: 50, y: 740 },
        keys: { up: false, down: false }, 
        portalCooldownTimer: 0, 
        isRunning: false, 
        vx_override: 0, // <-- Asegurado para consistencia
    };
    
    socket.emit('levelData', {
        platforms: currentPlatforms,
        boostZones: currentBoostZones,
        obstacles: currentObstacles,
        walls: currentWalls, 
        ladders: currentLadders,
        portals: currentPortals,
        goalFlag: goalFlag,
        levelName: LEVELS[currentLevelIndex].name
    });
    socket.emit('gameState', { players: players });

    // ----------------------------------------------------------------------
    // --- NUEVO HANDLER: Petición para crear un jugador local adicional ---
    // ----------------------------------------------------------------------
    socket.on('requestLocalPlayer', () => {
        const count = localPlayersMap[socket.id] || 0;
        
        // Limitar a un máximo de 3 jugadores locales (4 jugadores en total)
        if (count >= 3) return; 
        
        const playerId = socket.id + '_L' + count; 
        localPlayersMap[socket.id] = count + 1;

        // Crear el objeto del nuevo jugador con las mismas propiedades
        players[playerId] = {
            id: playerId,
            x: 50, y: 740, width: 20, height: 40,
            color: getRandomColor(),
            vx: 0, vy: 0, 
            onGround: false, score: 0, 
            lastDashTime: 0, 
            isDashing: false, dashTimer: 0,
            boostTimer: 0,
            stunTimer: 0, 
            isWallSliding: false, 
            wallSlideDir: 0,   
            wallJumpTimer: 0, 
            lastSafePlatform: { x: 50, y: 740 },
            keys: { up: false, down: false }, 
            portalCooldownTimer: 0, 
            isRunning: false, 
            vx_override: 0,
        };

        resetPlayer(players[playerId]);
        
        // Notificar al cliente específico que un nuevo jugador fue creado
        io.to(socket.id).emit('localPlayerCreated', { playerId: playerId });
        console.log(`Jugador local adicional creado: ${playerId}`);
    });
    // ----------------------------------------------------------------------

    socket.on('playerAction', (data) => {
        // Usa data.playerId (para mandos) o socket.id (para teclado)
        const targetId = data.playerId || socket.id; 
        const player = players[targetId]; 
        
        if (!player || player.score === 1 || player.stunTimer > 0) return; 

        switch(data.action) {
            case 'jump':
                if (player.onGround) { 
                    player.vy = JUMP_VELOCITY; 
                    player.onGround = false;
                } else if (player.isWallSliding) { 
                    player.vy = WALL_JUMP_VELOCITY_Y;
                    player.vx_override = player.wallSlideDir * WALL_JUMP_VELOCITY_X; 
                    player.wallJumpTimer = WALL_JUMP_COOLDOWN; 
                    player.isWallSliding = false;
                }
                player.keys.up = true; // Necesario para el Salto Variable
                break;
            case 'stopJump': // 💥 AGREGADO/CORREGIDO: Stop Jump para Salto Variable
                player.keys.up = false;
                break;
            case 'startMoveDown':
                player.keys.down = true;
                break;
            case 'stopMoveDown':
                player.keys.down = false;
                break;
            case 'startMoveLeft':
                player.vx = -1; 
                break;
            case 'stopMoveLeft':
                if (player.vx < 0) player.vx = 0;
                break;
            case 'startMoveRight':
                player.vx = 1; 
                break;
            case 'stopMoveRight':
                if (player.vx > 0) player.vx = 0;
                break;
            case 'startRun': // 💥 AGREGADO: Iniciar Correr
                player.isRunning = true;
                break;
            case 'stopRun': // 💥 AGREGADO: Detener Correr
                player.isRunning = false;
                break;
            case 'dash': 
                const now = Date.now();
                if (now - player.lastDashTime > DASH_COOLDOWN_TIME * 1000 && !player.isDashing) {
                    player.isDashing = true;
                    player.dashTimer = DASH_DURATION;
                    player.lastDashTime = now;
                    // Elige la dirección de dash. Si está quieto, usa la última dirección o derecha (1).
                    player.dashDirection = (player.vx !== 0) ? player.vx : 1;
                    
                    io.to(player.id).emit('dashEffect', { playerId: player.id });
                }
                break;
        }
    });

    // ----------------------------------------------------------------------
    // --- HANDLER DE DESCONEXIÓN MODIFICADO ---
    // ----------------------------------------------------------------------
    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        
        // Eliminar todos los jugadores (principal y locales) asociados a este socket ID
        const playersToDelete = Object.keys(players).filter(id => id.startsWith(socket.id));
        playersToDelete.forEach(id => delete players[id]);
        
        // Limpiar el contador de jugadores locales
        delete localPlayersMap[socket.id];
    });
    // ----------------------------------------------------------------------

    socket.on('requestRestartGame', () => {
        console.log("Reiniciando juego por solicitud del cliente.");
        resetGame(); 
    });
});


// Bucle de sincronización del servidor
let lastUpdateTime = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000; 

    // 1. Mover Obstáculos
    for (const obs of currentObstacles) {
        if (obs.isVertical) {
            obs.y += (obs.speed * obs.dir) * deltaTime;
            if (obs.y > obs.max) { obs.y = obs.max; obs.dir = -1; }
            if (obs.y < obs.min) { obs.y = obs.min; obs.dir = 1; }
        } else {
            obs.x += (obs.speed * obs.dir) * deltaTime;
            if (obs.x > obs.max) { obs.x = obs.max; obs.dir = -1; }
            if (obs.x < obs.min) { obs.x = obs.min; obs.dir = 1; }
        }
    }

    // 2. Lógica de Jugadores
    for (const id in players) {
        const player = players[id];
        
        // A. Manejar Stun Timer y Cooldowns
        if (player.stunTimer > 0) {
            player.stunTimer -= deltaTime;
            player.vx = 0; 
            player.vy += GRAVITY * deltaTime;
            player.y += player.vy * deltaTime;
            player.onGround = false;
            
            const stunCollidables = [...currentWalls, ...currentPlatforms];
            
            for (const platform of stunCollidables) {
                 if (checkCollision(player, platform) && player.vy > 0 && player.y + player.height > platform.y && player.y < platform.y) {
                    player.y = platform.y - player.height; 
                    player.vy = 0; 
                    player.onGround = true;
                 }
            }
            continue; 
        }

        // B. Timers
        if (player.boostTimer > 0) player.boostTimer -= deltaTime;
        if (player.wallJumpTimer > 0) player.wallJumpTimer -= deltaTime;
        if (player.portalCooldownTimer > 0) player.portalCooldownTimer -= deltaTime;
        
        // C. Física Horizontal (X) y Lógica de Escalera
        let desired_vx = 0;
        let onLadder = false;
        
        for (const ladder of currentLadders) {
            if (checkCollision(player, ladder)) {
                onLadder = true;
                break;
            }
        }

        if (onLadder) {
            player.onGround = false;
            player.vy = 0; 
            if (player.keys.up) {
                player.vy = -LADDER_SPEED;
            } else if (player.keys.down) {
                player.vy = LADDER_SPEED;
            } else {
                player.vy = 0; 
            }
        }
        
        // Si NO está en la escalera, aplicar gravedad Y SALTO VARIABLE
        if (!onLadder) {
            player.vy += GRAVITY * deltaTime;
            
            // Lógica de Salto Variable
            if (player.vy < 0 && !player.keys.up) {
                player.vy *= JUMP_DAMPENING; 
            }
        }

        // 2. Movimiento Horizontal (CON LÓGICA DE CORRER)
        let currentSpeed;
        if (player.boostTimer > 0) {
            currentSpeed = HORIZONTAL_SPEED * BOOST_MULTIPLIER; // Boost anula todo
        } else if (player.isRunning) {
            currentSpeed = RUN_SPEED; // Correr
        } else {
            currentSpeed = HORIZONTAL_SPEED; // Andar
        }
        
        if (player.isDashing) {
            player.dashTimer -= deltaTime;
            desired_vx = player.dashDirection * DASH_SPEED;
            if (player.dashTimer <= 0) {
                player.isDashing = false;
            }
        } else if (player.vx_override) { 
            desired_vx = player.vx_override;
            if (player.wallJumpTimer <= 0) {
                player.vx_override = 0;
            }
        } else {
            if (!onLadder) { 
                 desired_vx = player.vx * currentSpeed;
            } else {
                 desired_vx = player.vx * (currentSpeed / 2);
            }
        }

        player.x += desired_vx * deltaTime;

        // D. Colisión Horizontal y Deslizamiento (SOLO CON WALLS SÓLIDOS)
        player.isWallSliding = false; 

        // Itera sobre los muros para corregir posición y activar deslizamiento
        for (const wall of currentWalls) {
            if (checkCollision(player, wall)) {
                
                // 1. CORRECCIÓN DE POSICIÓN (Debe ocurrir siempre)
                if (desired_vx > 0) { // Jugador moviéndose a la derecha
                    player.x = wall.x - player.width;
                } else if (desired_vx < 0) { // Jugador moviéndose a la izquierda
                    player.x = wall.x + wall.width;
                }
                
                // 2. CANCELAR WALL JUMP (si hubo colisión horizontal)
                if (desired_vx !== 0) {
                    player.vx_override = 0; 
                    player.wallJumpTimer = 0;
                }

                // 3. 💥 CANCELAR DASH AL COLISIONAR CON MURO 💥
                if (player.isDashing) {
                    player.isDashing = false;
                    player.dashTimer = 0; 
                }
                
                // 4. LÓGICA DE DESLIZAMIENTO (SOLO SI NO HAY COOLDOWN)
                if (player.wallJumpTimer <= 0) {
                    if (!player.onGround && player.vy > 0) {
                        // Deslizamiento a la derecha del muro (moviéndose a la izquierda)
                        if (player.vx === -1 && desired_vx < 0) { 
                            player.isWallSliding = true;
                            player.wallSlideDir = 1;
                        // Deslizamiento a la izquierda del muro (moviéndose a la derecha)
                        } else if (player.vx === 1 && desired_vx > 0) { 
                            player.isWallSliding = true;
                            player.wallSlideDir = -1;
                        }
                    }
                }
            }
        }


        // E. Física Vertical (Y)
        if (player.isWallSliding) {
            if (player.vy > WALL_SLIDE_SPEED) {
                player.vy = WALL_SLIDE_SPEED; 
            }
        }
        player.y += player.vy * deltaTime;
        player.onGround = false;

        // F. Colisiones Verticales
        const allCollidables = [...currentPlatforms, ...currentWalls]; 
        for (const platform of allCollidables) { 
            if (checkCollision(player, platform)) {
                
                const previousBottom = player.y + player.height - player.vy * deltaTime; 
                
                if (player.vy > 0 && previousBottom <= platform.y + 0.001) { 
                    player.y = platform.y - player.height; 
                    player.vy = 0; 
                    player.onGround = true;
                    
                    if (currentPlatforms.includes(platform) || currentWalls.includes(platform)) {
                        player.lastSafePlatform.x = platform.x + (platform.width / 2) - (player.width / 2);
                        player.lastSafePlatform.y = platform.y - player.height;
                    }
                }
                
                if (currentWalls.includes(platform)) {
                    if (player.vy < 0 && (player.y - player.vy * deltaTime) >= platform.y + platform.height) {
                        player.y = platform.y + platform.height;
                        player.vy = 0; 
                    }
                }
            }
        }
        
        // G. Colisiones con Zonas de Boost, Obstáculos y Portales
        
        // El dash te hace invencible a Stuns y Boosts
        if (!player.isDashing) { 
            for (const zone of currentBoostZones) {
                if (checkCollision(player, zone)) player.boostTimer = BOOST_DURATION;
            }
            
            for (const obs of currentObstacles) {
                if (checkCollision(player, obs)) player.stunTimer = STUN_DURATION;
            }
        }

        // Lógica de Portales
        for (const portal of currentPortals) {
            
            if (checkCollision(player, portal) && player.portalCooldownTimer <= 0) {
                
                const targetPortal = currentPortals.find(p => p.id === portal.targetId);

                if (targetPortal) {
                    player.x = targetPortal.x;
                    player.y = targetPortal.y - player.height - 1; 
                    
                    player.portalCooldownTimer = PORTAL_COOLDOWN_TIME;
                    
                    player.vy = 0;
                    player.isDashing = false;
                    player.wallJumpTimer = 0;
                    player.isWallSliding = false;
                    
                    player.x += (portal.x < targetPortal.x) ? 5 : -5;
                    
                    io.to(player.id).emit('portalEffect', { playerId: player.id });
                    
                    break; 
                }
            }
        }

        // H. Límites del Mundo
        if (player.x < 0) {
            player.x = 0;
            // 💥 CORRECCIÓN: Desactivar Wall Sliding en el límite izquierdo
            if (player.isWallSliding) player.isWallSliding = false; 
        }
        if (player.x + player.width > GAME_WORLD_WIDTH) {
            player.x = GAME_WORLD_WIDTH - player.width;
            // 💥 CORRECCIÓN: Desactivar Wall Sliding en el límite derecho
            if (player.isWallSliding) player.isWallSliding = false; 
        }

        // I. Victoria
        if (player.score === 0 && checkCollision(player, goalFlag)) {
            player.score = 1; 
            io.sockets.emit('gameOver', { winnerId: player.id, color: player.color });
            setTimeout(() => resetGame(), 5000); 
        }
        
        // J. Muerte
        if (player.y > DEATH_Y) {
            resetPlayer(player, true); 
        }
    }
    
    // 3. Enviar estado
    io.sockets.emit('gameState', { players: players });
    io.sockets.emit('obstaclesUpdate', currentObstacles);

    lastUpdateTime = now;
}, 1000 / 60); 

server.listen(PORT, () => console.log(`Servidor ejecutándose en http://localhost:${PORT}`));