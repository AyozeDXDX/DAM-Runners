const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const os = require('os');

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
const STUN_INVULNERABILITY_DURATION = 1.0; 

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
let isGameOver = false;
let gameTimer = 0; 
let gameTimerHandle = null; 

let currentPlatforms = [];
let currentWalls = [];
let currentBoostZones = []; 
let currentObstacles = [];
let currentLadders = [];
let currentPortals = []; 
let currentFerrisWheels = []; 

let localPlayersMap = {}; 

// --- Definición de Niveles (RESTAURADOS + Noria) ---
const LEVELS = [
    {
        name: "La Gran Escalada (con Noria)", // Nivel 1 modificado
        platforms: [
            { x: 950, y: 400, width: 100, height: 10, color: '#e67e22' },
            { x: 1100, y: 320, width: 100, height: 10, color: '#e67e22' },
            { x: 1250, y: 250, width: 150, height: 10, color: '#e67e22' },
            { x: 1000, y: 150, width: 100, height: 10, color: '#e67e22' },
        ],
        walls: [ 
            { x: 0, y: 780, width: 500, height: 20, color: '#27ae60' }, 
            { x: 600, y: 540, width: 100, height: 20, color: '#e67e22' },
            { x: 400, y: 620, width: 20, height: 100, color: '#7f8c8d' }, 
            { x: 1230, y: 250, width: 20, height: 100, color: '#7f8c8d' } 
        ],
        ferrisWheels: [ 
            { 
                cx: 700, cy: 600, radius: 100, speed: 0.5, color: '#8e44ad',
                platforms: [ 
                    { angle: 0, width: 150, height: 10, x: 0, y: 0, vx: 0, vy: 0 }, // x/y/vx/vy se calcularán
                    { angle: Math.PI, width: 150, height: 10, x: 0, y: 0, vx: 0, vy: 0 }
                ]
            }
        ],
        boostZones: [
            { x: 550, y: 680, width: 150, height: 5, color: '#3498db' } 
        ],
        obstacles: [
            { x: 950, y: 370, width: 30, height: 30, color: '#e74c3c', min: 950, max: 1100, speed: 100, dir: 1, isVertical: false },
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
    // ===================== NUEVOS NIVELES =====================
    {
        name: "Sprint del Cañón",
        platforms: [
            { x: 250, y: 650, width: 120, height: 10, color: '#d35400' },
            { x: 550, y: 580, width: 100, height: 10, color: '#d35400' },
            { x: 850, y: 520, width: 100, height: 10, color: '#d35400' },
            { x: 1150, y: 600, width: 130, height: 10, color: '#d35400' },
            { x: 1450, y: 500, width: 100, height: 10, color: '#d35400' },
            { x: 1750, y: 580, width: 120, height: 10, color: '#d35400' },
            { x: 2050, y: 650, width: 150, height: 10, color: '#d35400' },
        ],
        walls: [
            { x: 0, y: 780, width: 300, height: 20, color: '#27ae60' },
            { x: 700, y: 680, width: 100, height: 20, color: '#7f8c8d' },
            { x: 1350, y: 700, width: 80, height: 80, color: '#7f8c8d' },
        ],
        boostZones: [
            { x: 250, y: 630, width: 120, height: 5, color: '#3498db' },
            { x: 1450, y: 480, width: 100, height: 5, color: '#3498db' },
        ],
        obstacles: [
            { x: 600, y: 550, width: 25, height: 25, color: '#e74c3c', min: 550, max: 750, speed: 150, dir: 1, isVertical: false },
            { x: 1200, y: 500, width: 25, height: 25, color: '#e74c3c', min: 500, max: 580, speed: 80, dir: 1, isVertical: true },
        ],
        ladders: [],
        portals: [],
        ferrisWheels: [],
        goalX: 2200,
        goalY: 600,
    },
    {
        name: "Torres Gemelas (Wall Jump)",
        platforms: [
            { x: 200, y: 700, width: 80, height: 10, color: '#16a085' },
            { x: 500, y: 300, width: 200, height: 10, color: '#16a085' },
            { x: 900, y: 700, width: 80, height: 10, color: '#16a085' },
        ],
        walls: [
            { x: 0, y: 780, width: 150, height: 20, color: '#27ae60' },
            // Torre izquierda
            { x: 300, y: 300, width: 20, height: 480, color: '#7f8c8d' },
            { x: 480, y: 300, width: 20, height: 480, color: '#7f8c8d' },
            // Torre derecha
            { x: 720, y: 300, width: 20, height: 480, color: '#7f8c8d' },
            { x: 900, y: 300, width: 20, height: 480, color: '#7f8c8d' },
            // Puente superior
            { x: 500, y: 300, width: 220, height: 15, color: '#2c3e50' },
            // Techo meta
            { x: 600, y: 150, width: 100, height: 10, color: '#27ae60' },
        ],
        boostZones: [],
        obstacles: [
            { x: 550, y: 270, width: 25, height: 25, color: '#e74c3c', min: 520, max: 680, speed: 120, dir: 1, isVertical: false },
        ],
        ladders: [],
        portals: [],
        ferrisWheels: [],
        goalX: 630,
        goalY: 100,
    },
    {
        name: "Dimensión Portal",
        platforms: [
            { x: 400, y: 600, width: 100, height: 10, color: '#9b59b6' },
            { x: 1200, y: 400, width: 120, height: 10, color: '#9b59b6' },
            { x: 2000, y: 500, width: 100, height: 10, color: '#9b59b6' },
        ],
        walls: [
            { x: 0, y: 780, width: 300, height: 20, color: '#27ae60' },
            { x: 600, y: 500, width: 20, height: 280, color: '#7f8c8d' },
            { x: 1400, y: 300, width: 20, height: 200, color: '#7f8c8d' },
            { x: 1800, y: 600, width: 200, height: 20, color: '#7f8c8d' },
            { x: 2200, y: 400, width: 150, height: 20, color: '#27ae60' },
        ],
        boostZones: [
            { x: 100, y: 760, width: 100, height: 5, color: '#3498db' },
        ],
        obstacles: [
            { x: 1250, y: 370, width: 25, height: 25, color: '#e74c3c', min: 1200, max: 1300, speed: 90, dir: 1, isVertical: false },
        ],
        ladders: [
            { x: 580, y: 500, width: 20, height: 280, color: '#9b59b6' },
        ],
        portals: [
            { id: 1, x: 450, y: 560, width: 30, height: 40, targetId: 2, color: '#f1c40f' },
            { id: 2, x: 1220, y: 360, width: 30, height: 40, targetId: 3, color: '#e74c3c' },
            { id: 3, x: 2020, y: 460, width: 30, height: 40, targetId: 4, color: '#2ecc71' },
            { id: 4, x: 2250, y: 360, width: 30, height: 40, targetId: 1, color: '#3498db' },
        ],
        ferrisWheels: [],
        goalX: 2280,
        goalY: 350,
    },
    {
        name: "Caos de Norias",
        platforms: [
            { x: 200, y: 650, width: 100, height: 10, color: '#e67e22' },
            { x: 1500, y: 350, width: 120, height: 10, color: '#e67e22' },
        ],
        walls: [
            { x: 0, y: 780, width: 250, height: 20, color: '#27ae60' },
            { x: 1100, y: 500, width: 20, height: 280, color: '#7f8c8d' },
            { x: 1650, y: 250, width: 100, height: 15, color: '#27ae60' },
        ],
        ferrisWheels: [
            {
                cx: 500, cy: 550, radius: 120, speed: 0.6, color: '#8e44ad',
                platforms: [
                    { angle: 0, width: 130, height: 10, x: 0, y: 0, vx: 0, vy: 0 },
                    { angle: Math.PI * 0.66, width: 130, height: 10, x: 0, y: 0, vx: 0, vy: 0 },
                    { angle: Math.PI * 1.33, width: 130, height: 10, x: 0, y: 0, vx: 0, vy: 0 },
                ]
            },
            {
                cx: 900, cy: 400, radius: 100, speed: -0.7, color: '#e74c3c',
                platforms: [
                    { angle: 0, width: 120, height: 10, x: 0, y: 0, vx: 0, vy: 0 },
                    { angle: Math.PI, width: 120, height: 10, x: 0, y: 0, vx: 0, vy: 0 },
                ]
            },
            {
                cx: 1300, cy: 500, radius: 80, speed: 0.8, color: '#f39c12',
                platforms: [
                    { angle: 0, width: 100, height: 10, x: 0, y: 0, vx: 0, vy: 0 },
                    { angle: Math.PI, width: 100, height: 10, x: 0, y: 0, vx: 0, vy: 0 },
                ]
            },
        ],
        boostZones: [],
        obstacles: [
            { x: 1500, y: 320, width: 20, height: 20, color: '#e74c3c', min: 1500, max: 1600, speed: 80, dir: 1, isVertical: false },
        ],
        ladders: [],
        portals: [],
        goalX: 1680,
        goalY: 200,
    },
    {
        name: "La Carrera de Obstáculos",
        platforms: [
            { x: 300, y: 700, width: 100, height: 10, color: '#c0392b' },
            { x: 600, y: 650, width: 100, height: 10, color: '#c0392b' },
            { x: 900, y: 600, width: 120, height: 10, color: '#c0392b' },
            { x: 1200, y: 650, width: 100, height: 10, color: '#c0392b' },
            { x: 1500, y: 550, width: 130, height: 10, color: '#c0392b' },
            { x: 1800, y: 600, width: 100, height: 10, color: '#c0392b' },
            { x: 2100, y: 680, width: 150, height: 10, color: '#c0392b' },
        ],
        walls: [
            { x: 0, y: 780, width: 200, height: 20, color: '#27ae60' },
            { x: 450, y: 650, width: 20, height: 130, color: '#7f8c8d' },
            { x: 1050, y: 600, width: 20, height: 180, color: '#7f8c8d' },
            { x: 1650, y: 550, width: 20, height: 230, color: '#7f8c8d' },
        ],
        boostZones: [
            { x: 900, y: 580, width: 120, height: 5, color: '#3498db' },
        ],
        obstacles: [
            { x: 350, y: 670, width: 25, height: 25, color: '#e74c3c', min: 300, max: 500, speed: 130, dir: 1, isVertical: false },
            { x: 750, y: 620, width: 25, height: 25, color: '#e74c3c', min: 600, max: 760, speed: 110, dir: -1, isVertical: true },
            { x: 1250, y: 600, width: 25, height: 25, color: '#e74c3c', min: 1200, max: 1400, speed: 140, dir: 1, isVertical: false },
            { x: 1850, y: 560, width: 25, height: 25, color: '#e74c3c', min: 500, max: 580, speed: 90, dir: 1, isVertical: true },
        ],
        ladders: [],
        portals: [],
        ferrisWheels: [],
        goalX: 2200,
        goalY: 630,
    },
    {
        name: "Puente Celestial",
        platforms: [
            { x: 100, y: 500, width: 80, height: 10, color: '#2980b9' },
            { x: 300, y: 420, width: 80, height: 10, color: '#2980b9' },
            { x: 500, y: 350, width: 80, height: 10, color: '#2980b9' },
            { x: 700, y: 280, width: 80, height: 10, color: '#2980b9' },
            { x: 900, y: 220, width: 100, height: 10, color: '#2980b9' },
            { x: 1150, y: 280, width: 80, height: 10, color: '#2980b9' },
            { x: 1350, y: 350, width: 80, height: 10, color: '#2980b9' },
            { x: 1550, y: 280, width: 80, height: 10, color: '#2980b9' },
            { x: 1750, y: 200, width: 100, height: 10, color: '#2980b9' },
        ],
        walls: [
            { x: 0, y: 780, width: 150, height: 20, color: '#27ae60' },
            { x: 0, y: 600, width: 80, height: 20, color: '#7f8c8d' },
            // Columnas de soporte
            { x: 900, y: 220, width: 10, height: 560, color: '#34495e' },
            { x: 990, y: 220, width: 10, height: 560, color: '#34495e' },
            // Meta
            { x: 1850, y: 100, width: 100, height: 15, color: '#27ae60' },
        ],
        boostZones: [
            { x: 900, y: 200, width: 100, height: 5, color: '#3498db' },
        ],
        obstacles: [
            { x: 400, y: 320, width: 20, height: 20, color: '#e74c3c', min: 280, max: 400, speed: 70, dir: 1, isVertical: true },
            { x: 1200, y: 250, width: 20, height: 20, color: '#e74c3c', min: 1150, max: 1350, speed: 100, dir: 1, isVertical: false },
        ],
        ladders: [
            { x: 60, y: 600, width: 20, height: 180, color: '#9b59b6' },
        ],
        portals: [],
        ferrisWheels: [],
        goalX: 1880,
        goalY: 50,
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
    currentFerrisWheels = JSON.parse(JSON.stringify(currentLevel.ferrisWheels || [])); 

    goalFlag = {
        x: currentLevel.goalX,
        y: currentLevel.goalY,
        width: 30, height: 50, color: '#f1c40f' 
    };

    for (const id in players) {
        resetPlayer(players[id]);
    }
    
    console.log(`Nivel cargado: ${currentLevel.name}`);
    
    isGameOver = false;
    gameTimer = 0; 
    if (gameTimerHandle) {
        clearInterval(gameTimerHandle); 
        gameTimerHandle = null;
    }

    io.sockets.emit('levelData', {
        platforms: currentPlatforms,
        boostZones: currentBoostZones,
        obstacles: currentObstacles,
        walls: currentWalls,
        ladders: currentLadders,
        portals: currentPortals,
        ferrisWheels: currentFerrisWheels,
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
        player.score = 0; 
        if (!death) {
            player.vx = 0; 
        }
    }
    
    player.vy = 0;
    player.onGround = false;
    player.state = 'playing'; 
    player.lastDashTime = 0; 
    player.isDashing = false;
    player.dashTimer = 0;
    player.boostTimer = 0;
    player.stunTimer = 0; 
    player.invulnerabilityTimer = 0;
    player.isWallSliding = false; 
    player.wallSlideDir = 0;   
    player.wallJumpTimer = 0;
    player.keys.up = false;
    player.keys.down = false; 
    player.portalCooldownTimer = 0;
    player.isRunning = false; 
    player.vx_override = 0;
    player.ridingPlatform = null; 
}

resetGame();

function getRandomColor() {
    const letters = '012456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function checkCollision(obj1, obj2) {
    if (!obj1 || !obj2) return false;
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

function createNewPlayer(id, nickname) {
    players[id] = {
        id: id,
        nickname: nickname || id.substring(0, 8),
        x: 50, y: 740, width: 20, height: 40,
        color: getRandomColor(),
        vx: 0, vy: 0, 
        onGround: false, score: 0, 
        state: 'playing',
        lastDashTime: 0, 
        isDashing: false, dashTimer: 0,
        boostTimer: 0,
        stunTimer: 0, 
        invulnerabilityTimer: 0,
        isWallSliding: false, 
        wallSlideDir: 0,   
        wallJumpTimer: 0, 
        lastSafePlatform: { x: 50, y: 740 },
        keys: { up: false, down: false }, 
        portalCooldownTimer: 0, 
        isRunning: false, 
        vx_override: 0,
        ridingPlatform: null,
    };
    return players[id];
}


io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado:', socket.id);
    
    localPlayersMap[socket.id] = 0; 

    const hostname = os.hostname();
    createNewPlayer(socket.id, hostname);
    
    // Enviar el hostname al cliente para usarlo como nametag por defecto
    socket.emit('yourHostname', hostname);
    
    socket.emit('levelData', {
        platforms: currentPlatforms,
        boostZones: currentBoostZones,
        obstacles: currentObstacles,
        walls: currentWalls, 
        ladders: currentLadders,
        portals: currentPortals,
        ferrisWheels: currentFerrisWheels,
        goalFlag: goalFlag,
        levelName: LEVELS[currentLevelIndex].name
    });
    socket.emit('gameState', { players: players });


    socket.on('requestLocalPlayer', () => {
        const count = localPlayersMap[socket.id] || 0;
        
        if (count >= 3) return; 
        
        const playerId = socket.id + '_L' + count; 
        localPlayersMap[socket.id] = count + 1;

        const mainPlayer = players[socket.id];
        const baseNickname = mainPlayer ? mainPlayer.nickname : os.hostname();
        createNewPlayer(playerId, baseNickname + '_L' + count);
        
        io.to(socket.id).emit('localPlayerCreated', { playerId: playerId });
        console.log(`Jugador local adicional creado: ${playerId}`);
    });

    // --- Evento para cambiar color y/o nickname ---
    socket.on('setPlayerInfo', (data) => {
        const targetId = data.playerId || socket.id;
        const player = players[targetId];
        if (!player) return;
        
        // Verificar que el jugador pertenece a este socket
        if (!targetId.startsWith(socket.id)) return;
        
        // Cambiar color (validar formato hexadecimal)
        if (data.color && /^#[0-9A-Fa-f]{6}$/.test(data.color)) {
            player.color = data.color;
        }

        // --- NUEVO: Guardar Sistema Operativo ---
        if (data.os) {
            player.os = data.os;
        }
        
        // Cambiar nickname 
        if (data.nickname && typeof data.nickname === 'string') {
            player.nickname = data.nickname.substring(0, 20); // Limitar a 20 caracteres
        }
    });

    socket.on('playerAction', (data) => {
        const targetId = data.playerId || socket.id; 
        const player = players[targetId]; 
        
        if (!player) return;

        if (player.state === 'finished' || player.score === 1 || player.stunTimer > 0) {
             if (player.state === 'finished' && (data.action === 'startMoveLeft' || data.action === 'startMoveRight')) {
                io.to(socket.id).emit('spectatorChange', { 
                    direction: data.action === 'startMoveLeft' ? -1 : 1 
                });
             }
             return; 
        }
        
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
        playersToDelete.forEach(id => delete players[id]);
        
        delete localPlayersMap[socket.id];
    });

});


// Bucle de sincronización del servidor
let lastUpdateTime = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000; 

    // 1. Mover Obstáculos y Ruedas de Noria
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
    for (const wheel of currentFerrisWheels) {
        for (const platform of wheel.platforms) {
            const oldY = platform.y;
            const oldX = platform.x;
            
            platform.angle += wheel.speed * deltaTime;
            platform.x = wheel.cx + Math.cos(platform.angle) * wheel.radius - (platform.width / 2);
            platform.y = wheel.cy + Math.sin(platform.angle) * wheel.radius - (platform.height / 2);
            
            platform.vx = (platform.x - oldX) / deltaTime;
            platform.vy = (platform.y - oldY) / deltaTime;
        }
    }


    // 2. Lógica de Jugadores
    for (const id in players) {
        const player = players[id];
        
        if (player.state === 'finished') continue; 

        // A. Manejar Stun Timer y Cooldowns
        if (player.stunTimer > 0) {
            player.stunTimer -= deltaTime;
            player.vx = 0; 
            player.vy += GRAVITY * deltaTime;
            player.y += player.vy * deltaTime;
            player.onGround = false;
            
            const stunCollidables = [...currentWalls, ...currentPlatforms, ...currentFerrisWheels.flatMap(w => w.platforms)];
            
            for (const platform of stunCollidables) {
                 if (checkCollision(player, platform) && player.vy > 0 && player.y + player.height > platform.y && player.y < platform.y) {
                    player.y = platform.y - player.height; 
                    player.vy = 0; 
                    player.onGround = true;
                 }
            }
            if (player.stunTimer <= 0) {
                player.invulnerabilityTimer = STUN_INVULNERABILITY_DURATION;
            }
            continue; 
        }

        // B. Timers
        if (player.boostTimer > 0) player.boostTimer -= deltaTime;
        if (player.wallJumpTimer > 0) player.wallJumpTimer -= deltaTime;
        if (player.portalCooldownTimer > 0) player.portalCooldownTimer -= deltaTime;
        if (player.invulnerabilityTimer > 0) player.invulnerabilityTimer -= deltaTime;
        
        player.ridingPlatform = null; 

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
            if (!player.isDashing) {
                player.vy += GRAVITY * deltaTime;
            }
            
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
            
            player.vy = 0; 

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

        // 💥💥 INICIO DE LA LÓGICA DE COLISIÓN CORREGIDA 💥💥
        // F. Colisiones Verticales
        const allCollidables = [...currentPlatforms, ...currentWalls, ...currentFerrisWheels.flatMap(w => w.platforms)]; 
        
        for (const platform of allCollidables) { 
            if (checkCollision(player, platform)) {
                
                const previousBottom = player.y + player.height - player.vy * deltaTime; 
                const previousTop = player.y - (player.vy * deltaTime);

                let isNoriaPlat = false;
                for(const wheel of currentFerrisWheels) {
                    if(wheel.platforms.includes(platform)) {
                        isNoriaPlat = true;
                        break;
                    }
                }

                // --- 1. ATERRIZAJE (Si el jugador se mueve hacia abajo) ---
                if (player.vy >= 0) {
                    
                    let isSolidTop = currentWalls.includes(platform) || isNoriaPlat || currentPlatforms.includes(platform);
                    
                    // 💥 CORRECCIÓN: La lógica 'previousBottom' impedía aterrizar después de un 'head-bonk'.
                    // Ahora, si el jugador está cayendo (vy >= 0) Y su parte inferior está "casi" en la parte superior de la plataforma
                    // Y venía desde arriba (previousBottom), entonces aterriza.
                    
                    if (isSolidTop && previousBottom <= platform.y + 1) { 
                    
                        player.y = platform.y - player.height; 
                        player.vy = 0; 
                        player.onGround = true;

                        if (isNoriaPlat) {
                            player.ridingPlatform = platform; // "Pegar" al jugador
                        } else if (currentPlatforms.includes(platform) || currentWalls.includes(platform)) {
                            // Guardar como punto seguro
                            player.lastSafePlatform.x = platform.x + (platform.width / 2) - (player.width / 2);
                            player.lastSafePlatform.y = platform.y - player.height;
                        }
                    }
                }
                
                // --- 2. GOLPE DE CABEZA (Si el jugador se mueve hacia arriba) ---
                // 💥 CORRECCIÓN: Solo los Muros (currentWalls) bloquean por debajo.
                // La Noria (isNoriaPlat) y las Plataformas (currentPlatforms) no.
                if (player.vy < 0 && currentWalls.includes(platform)) {
                    if (previousTop >= platform.y + platform.height - 1) {
                        player.y = platform.y + platform.height;
                        player.vy = 0; 
                    }
                }
            }
        }
        // 💥💥 FIN DE LA LÓGICA DE COLISIÓN CORREGIDA 💥💥
        
        // G. Colisiones con Zonas de Boost, Obstáculos y Portales
        if (!player.isDashing) { 
            for (const zone of currentBoostZones) {
                if (checkCollision(player, zone)) player.boostTimer = BOOST_DURATION;
            }
            
            for (const obs of currentObstacles) {
                if (checkCollision(player, obs) && player.invulnerabilityTimer <= 0) {
                    player.stunTimer = STUN_DURATION;
                    player.invulnerabilityTimer = STUN_DURATION + STUN_INVULNERABILITY_DURATION; 
                }
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

        // H. Límites del Mundo
        if (player.x < 0) {
            player.x = 0;
            if (player.isWallSliding) player.isWallSliding = false; 
        }
        if (player.x + player.width > GAME_WORLD_WIDTH) {
            player.x = GAME_WORLD_WIDTH - player.width;
            if (player.isWallSliding) player.isWallSliding = false; 
        }

        // I. Victoria (Modo Espectador y Temporizador)
        if (player.score === 0 && checkCollision(player, goalFlag)) {
            player.score = 1; 
            player.state = 'finished'; // ¡Jugador terminado!
            
            // Si es el PRIMER jugador en terminar
            if (gameTimerHandle === null) { 
                gameTimer = 60; 
                
                io.sockets.emit('gameOver', { 
                    winnerId: player.id, 
                    color: player.color,
                    nickname: player.nickname,
                    message: `¡${player.nickname} ha ganado! ¡60s restantes!`
                });
                
                gameTimerHandle = setInterval(() => {
                    gameTimer--;
                    
                    const allPlayingFinished = Object.values(players).every(p => p.state === 'finished' || p.score === 1);
                    
                    if (allPlayingFinished && gameTimer > 5) {
                        console.log("Todos han terminado. Reduciendo temporizador a 5s.");
                        gameTimer = 5; 
                    }

                    if (gameTimer <= 0) {
                        resetGame(); 
                    }
                    
                    io.sockets.emit('gameTimerUpdate', gameTimer);
                    
                }, 1000);
            }
        }
        
        // J. Muerte
        if (player.y > DEATH_Y) {
            resetPlayer(player, true); 
        }
        
        // K. LÓGICA DE STICKING (Adherencia a Noria)
        if (player.ridingPlatform) {
            player.x += player.ridingPlatform.vx * deltaTime;
            player.y += player.ridingPlatform.vy * deltaTime;
        }

    } // <-- Fin del bucle 'for (const id in players)'
    
    // 3. Enviar estado
    io.sockets.emit('gameState', { players: players });
    io.sockets.emit('obstaclesUpdate', currentObstacles);
    io.sockets.emit('ferrisWheelUpdate', currentFerrisWheels);

    lastUpdateTime = now;
}, 1000 / 60); 

server.listen(PORT, () => console.log(`Servidor ejecutándose en http://localhost:${PORT}`));
