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
const GAME_WORLD_WIDTH = 3500; // Ampliado para el lobby
const GAME_WORLD_HEIGHT = 800; 
const DEATH_Y = 850;
const LADDER_SPEED = 200; 

// --- Dash ---
const DASH_SPEED = 1200; 
const DASH_DURATION = 0.2; 
const DASH_COOLDOWN_TIME = 2; 

// --- Boost ---
const BOOST_MULTIPLIER = 2.0;
const BOOST_DURATION = 3; // 💥 ¡AQUÍ ESTÁ LA CORRECCIÓN!

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

// --- Lógica de Equipos y Lobby ---
const POINT_DISTRIBUTION = [10, 5, 3, 1]; 
const LOBBY_WIDTH = 800; 
const LOBBY_SPAWN = { x: 100, y: 740 };
const GAME_SPAWN = { x: LOBBY_WIDTH + 100, y: 740 };
const LOBBY_TIMER_DURATION = 20; 

let teamScores = { red: 0, blue: 0 };
let teamCounts = { red: 0, blue: 0 };
let finishedPlayers = []; 
let isGameOver = false;
let currentGameState = 'lobby'; 
let nextGameMode = 'teams'; 
let lobbyTimer = LOBBY_TIMER_DURATION;

let players = {}; 
let goalFlag = {}; 
let currentLevelIndex = -1; 

let currentPlatforms = [];
let currentWalls = [];
let currentBoostZones = []; 
let currentObstacles = [];
let currentLadders = [];
let currentPortals = []; 
let currentTeamZones = []; 

let localPlayersMap = {}; 

// --- Definición del Lobby (Estático) ---
const LOBBY_OBJECTS = {
    platforms: [
        { x: 0, y: 780, width: LOBBY_WIDTH, height: 20, color: '#1A2530' }, // Suelo del Lobby
    ],
    walls: [
        { x: 0, y: 0, width: 10, height: GAME_WORLD_HEIGHT, color: '#1A2530' },
        { x: LOBBY_WIDTH - 10, y: 0, width: 10, height: GAME_WORLD_HEIGHT, color: '#1A2530' },
    ],
    teamSelectZones: [
        { x: 150, y: 700, width: 100, height: 80, team: 'red', color: '#e74c3c' },
        { x: 550, y: 700, width: 100, height: 80, team: 'blue', color: '#3498db' },
    ],
    modeSelectZones: [
        { x: 300, y: 700, width: 80, height: 50, mode: 'individual', color: '#ecf0f1' },
        { x: 420, y: 700, width: 80, height: 50, mode: 'teams', color: '#f1c40f' },
    ]
};

// --- Definición de Niveles (¡OFFSET X + LOBBY_WIDTH!) ---
const LEVELS = [
    {
        name: "La Gran Escalada (OFFSET)",
        platforms: [
            { x: 800 + 550, y: 700, width: 150, height: 10, color: '#e67e22' },
            { x: 800 + 750, y: 480, width: 150, height: 10, color: '#e67e22' },
        ],
        walls: [ 
            { x: 800 + 0, y: 780, width: 500, height: 20, color: '#27ae60' }, 
            { x: 800 + 600, y: 540, width: 100, height: 20, color: '#e67e22' },
            { x: 800 + 400, y: 620, width: 20, height: 100, color: '#7f8c8d' }, 
        ],
        boostZones: [
            { x: 800 + 550, y: 680, width: 150, height: 5, color: '#3498db' } 
        ],
        obstacles: [
            { x: 800 + 750, y: 450, width: 30, height: 30, color: '#e74c3c', min: 800 + 750, max: 800 + 900, speed: 100, dir: 1, isVertical: false },
        ],
        ladders: [],
        portals: [],
        goalX: 800 + 1030, 
        goalY: 100,  
    },
    // ... (Puedes añadir el resto de tus niveles aquí, adaptados con +800 a las X)
];

// --- Función para Calcular Puntos ---
function awardPoints() {
    if (nextGameMode !== 'teams') return; 

    finishedPlayers.forEach((playerId, index) => {
        const player = players[playerId];
        if (!player) return;

        const points = POINT_DISTRIBUTION[index] || 0; 
        
        if (points > 0) {
            teamScores[player.team] += points;
            console.log(`Jugador ${playerId} (Equipo ${player.team}) terminó ${index + 1}º y ganó ${points} puntos.`);
        }
    });
    io.sockets.emit('teamScoreUpdate', teamScores);
}

// --- Lógica de Nivel y Juego ---

function startNewRound() {
    console.log(`Iniciando ronda. Modo: ${nextGameMode}`);
    currentGameState = 'playing';
    isGameOver = false;
    finishedPlayers = [];
    
    let newIndex = Math.floor(Math.random() * LEVELS.length);
    const selectedLevel = LEVELS[newIndex];
    currentLevelIndex = newIndex;
    
    currentPlatforms = LOBBY_OBJECTS.platforms.concat(selectedLevel.platforms || []);
    currentWalls = LOBBY_OBJECTS.walls.concat(selectedLevel.walls || []);
    currentBoostZones = selectedLevel.boostZones || []; 
    currentObstacles = JSON.parse(JSON.stringify(selectedLevel.obstacles || [])); 
    currentLadders = LOBBY_OBJECTS.ladders ? LOBBY_OBJECTS.ladders.concat(selectedLevel.ladders || []) : (selectedLevel.ladders || []);
    currentPortals = LOBBY_OBJECTS.portals ? LOBBY_OBJECTS.portals.concat(selectedLevel.portals || []) : (selectedLevel.portals || []);
    
    currentTeamZones = LOBBY_OBJECTS.teamSelectZones || []; 
    
    goalFlag = selectedLevel.goalFlag;

    for (const id in players) {
        resetPlayer(players[id]); 
        players[id].x = GAME_SPAWN.x;
        players[id].y = GAME_SPAWN.y;
    }
    
    io.sockets.emit('levelData', {
        platforms: currentPlatforms,
        walls: currentWalls,
        boostZones: currentBoostZones,
        obstacles: currentObstacles,
        ladders: currentLadders,
        portals: currentPortals,
        teamSelectZones: currentTeamZones, 
        modeSelectZones: LOBBY_OBJECTS.modeSelectZones, 
        goalFlag: goalFlag,
        levelName: selectedLevel.name
    });
    io.sockets.emit('gameState', { players: players }); 
    io.sockets.emit('teamScoreUpdate', teamScores);
}

function resetGame() {
    if (isGameOver) {
        awardPoints();
    }
    
    console.log("Fin de ronda. Volviendo al Lobby.");
    currentGameState = 'lobby';
    isGameOver = false;
    finishedPlayers = [];
    lobbyTimer = LOBBY_TIMER_DURATION;
    
    currentPlatforms = LOBBY_OBJECTS.platforms || [];
    currentWalls = LOBBY_OBJECTS.walls || [];
    currentBoostZones = []; 
    currentObstacles = []; 
    currentLadders = LOBBY_OBJECTS.ladders || [];
    currentPortals = LOBBY_OBJECTS.portals || [];
    currentTeamZones = LOBBY_OBJECTS.teamSelectZones || [];
    goalFlag = {}; 

    for (const id in players) {
        resetPlayer(players[id]);
        players[id].x = LOBBY_SPAWN.x;
        players[id].y = LOBBY_SPAWN.y;
    }
    
    io.sockets.emit('levelData', {
        platforms: currentPlatforms,
        walls: currentWalls,
        boostZones: currentBoostZones,
        obstacles: currentObstacles,
        ladders: currentLadders,
        portals: currentPortals,
        teamSelectZones: currentTeamZones,
        modeSelectZones: LOBBY_OBJECTS.modeSelectZones,
        goalFlag: goalFlag,
        levelName: "Lobby (Elige Equipo)"
    });
    io.sockets.emit('gameState', { players: players }); 
    io.sockets.emit('teamScoreUpdate', teamScores);
    io.sockets.emit('gameModeUpdate', nextGameMode);
    
    setTimeout(startNewRound, LOBBY_TIMER_DURATION * 1000);
}

function resetPlayer(player, death = false) {
    if (death && currentGameState === 'playing') {
        player.x = GAME_SPAWN.x;
        player.y = GAME_SPAWN.y;
    } 
    else if (death && currentGameState === 'lobby') {
        player.x = LOBBY_SPAWN.x;
        player.y = LOBBY_SPAWN.y;
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
    player.vx_override = 0;
}

resetGame();

function getTeamColor(team) {
    if (team === 'red') {
        return `hsl(0, ${Math.floor(Math.random() * 30) + 70}%, ${Math.floor(Math.random() * 20) + 50}%)`;
    } else {
        return `hsl(240, ${Math.floor(Math.random() * 30) + 70}%, ${Math.floor(Math.random() * 20) + 50}%)`;
    }
}

function checkCollision(obj1, obj2) {
    if (!obj1 || !obj2) return false;
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

function createNewPlayer(id, team) {
    teamCounts[team]++;
    const player = {
        id: id,
        x: LOBBY_SPAWN.x, y: LOBBY_SPAWN.y, width: 20, height: 40,
        color: getTeamColor(team),
        team: team,
        vx: 0, vy: 0, 
        onGround: false, score: 0, 
        lastDashTime: 0, 
        isDashing: false, dashTimer: 0,
        boostTimer: 0,
        stunTimer: 0, 
        isWallSliding: false, 
        wallSlideDir: 0,   
        wallJumpTimer: 0, 
        lastSafePlatform: { x: LOBBY_SPAWN.x, y: LOBBY_SPAWN.y },
        keys: { up: false, down: false }, 
        portalCooldownTimer: 0, 
        isRunning: false, 
        vx_override: 0,
    };
    players[id] = player;
    return player;
}

io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado:', socket.id);
    
    localPlayersMap[socket.id] = 0; 

    const team = (teamCounts.red <= teamCounts.blue) ? 'red' : 'blue';
    createNewPlayer(socket.id, team);
    
    socket.emit('levelData', {
        platforms: currentPlatforms,
        boostZones: currentBoostZones,
        obstacles: currentObstacles,
        walls: currentWalls, 
        ladders: currentLadders,
        portals: currentPortals,
        teamSelectZones: currentTeamZones,
        modeSelectZones: LOBBY_OBJECTS.modeSelectZones,
        goalFlag: goalFlag,
        levelName: currentGameState === 'lobby' ? "Lobby (Elige Equipo)" : LEVELS[currentLevelIndex].name
    });
    socket.emit('gameState', { players: players });
    socket.emit('teamScoreUpdate', teamScores);
    socket.emit('gameModeUpdate', nextGameMode);


    socket.on('requestLocalPlayer', () => {
        const count = localPlayersMap[socket.id] || 0;
        
        if (count >= 3) return; 
        
        const playerId = socket.id + '_L' + count; 
        localPlayersMap[socket.id] = count + 1;

        const parentPlayer = players[socket.id];
        const localTeam = parentPlayer.team;
        
        createNewPlayer(playerId, localTeam);
        
        io.to(socket.id).emit('localPlayerCreated', { playerId: playerId });
        console.log(`Jugador local adicional creado: ${playerId}`);
    });

    socket.on('playerAction', (data) => {
        const targetId = data.playerId || socket.id; 
        const player = players[targetId]; 
        
        if (!player || player.score === 1 || player.stunTimer > 0 || (isGameOver && currentGameState === 'playing')) return; 

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
                player.keys.up = true;
                break;
            case 'stopJump':
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
            case 'startRun':
                player.isRunning = true;
                break;
            case 'stopRun':
                player.isRunning = false;
                break;
            case 'dash': 
                if (currentGameState !== 'playing') break;
                
                const now = Date.now();
                if (now - player.lastDashTime > DASH_COOLDOWN_TIME * 1000 && !player.isDashing) {
                    player.isDashing = true;
                    player.dashTimer = DASH_DURATION;
                    player.lastDashTime = now;
                    player.dashDirection = (player.vx !== 0) ? player.vx : 1;
                    
                    io.to(player.id).emit('dashEffect', { playerId: player.id });
                }
                break;
        }
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        
        const playersToDelete = Object.keys(players).filter(id => id.startsWith(socket.id));
        
        playersToDelete.forEach(id => {
            const player = players[id];
            if (player) {
                teamCounts[player.team]--;
            }
            delete players[id];
        });
        
        delete localPlayersMap[socket.id];
    });

});


// Bucle de sincronización del servidor
let lastUpdateTime = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000; 

    // 1. Mover Obstáculos
    if (currentGameState === 'playing') {
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
        
        if (!onLadder) {
            player.vy += GRAVITY * deltaTime;
            
            if (player.vy < 0 && !player.keys.up) {
                player.vy *= JUMP_DAMPENING; 
            }
        }

        // 2. Movimiento Horizontal
        let currentSpeed;
        if (player.boostTimer > 0) {
            currentSpeed = HORIZONTAL_SPEED * BOOST_MULTIPLIER;
        } else if (player.isRunning) {
            currentSpeed = RUN_SPEED;
        } else {
            currentSpeed = HORIZONTAL_SPEED;
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

        // D. Colisión Horizontal y Deslizamiento
        player.isWallSliding = false; 

        for (const wall of currentWalls) {
            if (checkCollision(player, wall)) {
                
                if (desired_vx > 0) {
                    player.x = wall.x - player.width;
                } else if (desired_vx < 0) {
                    player.x = wall.x + wall.width;
                }
                
                if (desired_vx !== 0) {
                    player.vx_override = 0; 
                    player.wallJumpTimer = 0;
                }

                if (player.isDashing) {
                    player.isDashing = false;
                    player.dashTimer = 0; 
                }
                
                if (player.wallJumpTimer <= 0) {
                    if (!player.onGround && player.vy > 0) {
                        if (player.vx === -1 && desired_vx < 0) { 
                            player.isWallSliding = true;
                            player.wallSlideDir = 1;
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
        
        // G. Colisiones de Lógica (Boost, Stun, Portals)
        
        if (!player.isDashing) { 
            for (const zone of currentBoostZones) {
                if (checkCollision(player, zone)) player.boostTimer = BOOST_DURATION;
            }
            
            for (const obs of currentObstacles) {
                if (checkCollision(player, obs)) player.stunTimer = STUN_DURATION;
            }
        }

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
        
        // Lógica de Lobby
        if (currentGameState === 'lobby') {
            for (const zone of currentTeamZones) {
                if (checkCollision(player, zone)) {
                    if (player.team !== zone.team) {
                        teamCounts[player.team]--;
                        player.team = zone.team;
                        teamCounts[player.team]++;
                        player.color = getTeamColor(player.team);
                    }
                }
            }
            for (const zone of LOBBY_OBJECTS.modeSelectZones) {
                if (checkCollision(player, zone)) {
                    if (nextGameMode !== zone.mode) {
                        nextGameMode = zone.mode;
                        io.sockets.emit('gameModeUpdate', nextGameMode); 
                    }
                }
            }
        }


        // H. Límites del Mundo
        if (player.x < 0) {
            player.x = 0;
            if (player.isWallSliding) player.isWallSliding = false; 
        }
        if (player.x + player.width > GAME_WORLD_WIDTH) {
            player.x = GAME_WORLD_WIDTH - player.width;
            if (player.isWallSliding) player.isWallSliding = false; 
        }

        // I. Victoria (Lógica de Equipos)
        if (currentGameState === 'playing' && player.score === 0 && checkCollision(player, goalFlag)) {
            player.score = 1; 
            finishedPlayers.push(player.id); 

            if (!isGameOver) { 
                isGameOver = true; 
                io.sockets.emit('gameOver', { 
                    winnerId: player.id, 
                    color: player.color, 
                    team: player.team 
                });
                
                setTimeout(() => resetGame(), 5000); 
            }
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
