// Browser-compatible version of sketch.js
// Uses window.PLAYER_1 and window.SYSTEM for keyboard input instead of @rcade/plugin-input-classic

import p5 from "p5";
import { Player } from "./player.js";
import { GameObject } from "./gameObject.js";
import { Camera } from "./camera.js";
import { World, WORLD_WIDTH, WORLD_HEIGHT, WORLD_CENTER_X, WORLD_CENTER_Y, ISLAND_RADIUS_X, ISLAND_RADIUS_Y, BIOMES } from "./world.js";
import { SeededRandom } from "./noise.js";
import { createEmojiSprite, DEFAULT_SPRITE_SIZE, LARGE_SPRITE_SIZE } from "./sprites.js";
import { shouldSpawnForPlayerSize } from "./biomes.js";

// Use window globals for keyboard input (set up in game.html)
const PLAYER_1 = window.PLAYER_1;
const SYSTEM = window.SYSTEM;

// RCade screen dimensions
const SCREEN_WIDTH = 336;
const SCREEN_HEIGHT = 262;

// Game states
const STATE = {
    TITLE: "title",
    PLAYING: "playing",
    PLANET_CONSUMED: "planet_consumed",
};

// 10 seasons: Spring 1 -> Summer 1 -> Fall 1 -> Winter 1 -> Spring 2 -> Summer 2 -> Fall 2 -> Winter 2 -> Spring 3 -> Summer 3 (win)
const SEASON_CYCLE = ["spring", "summer", "fall", "winter"];
const TOTAL_SEASONS = 10;

// Time-based seasons: each season lasts 15 seconds (900 frames at 60fps)
const SEASON_DURATION = 15 * 60; // 15 seconds in frames

// Season color transition: 3 seconds before season change
const SEASON_TRANSITION_DURATION = 3 * 60; // 4 seconds in frames
const SEASON_FADE_START = SEASON_DURATION - SEASON_TRANSITION_DURATION; // Start fading 3s before end

const STARTING_SIZE = 12;

// Planet consumption threshold - when player reaches this size, they consume the planet
const PLANET_CONSUME_SIZE = 2500;

// Zoom configuration - player should always be ~15% of screen height
const PLAYER_SCREEN_RATIO = 0.15; // Player is 15% of screen height
// At size 12: zoom = 52.4/12 = 4.37, at size 380: zoom = 52.4/380 = 0.14
const MIN_ZOOM = 0.1;        // Minimum zoom (for largest objects like the sun)
const MAX_ZOOM = 4.5;         // Maximum zoom (for starting size)

// Seasonal emoji for progress bar
const SEASON_EMOJI = {
    spring: "🌸",
    summer: "☀️",
    fall: "🍂",
    winter: "❄️"
};

// World seed (change for different world layouts)
const WORLD_SEED = 42;

// Distance-based object spawning configuration
// These are base values - actual radii scale with zoom (smaller zoom = larger radii)
const BASE_SPAWN_RADIUS = 400; // Base distance from player to spawn objects
const BASE_DESPAWN_RADIUS = 600; // Base distance from player to despawn objects
const BASE_KEEP_RADIUS = 250; // Base radius to always keep objects (protects small collectibles)
const SPAWN_CHECK_INTERVAL = 30; // Check every 30 frames
const MAX_OBJECTS = 1500; // Maximum objects on screen at once

// Permanent objects that persist across seasons (trees, rocks, buildings, large structures)
const PERMANENT_EMOJIS = new Set([
    "🌲", "🌳", "🌴",           // Trees
    "🪨",                       // Rocks
    "🏠", "🏚️", "🛖", "🏪",    // Buildings
    "🏰", "🏔️",                // Large structures
]);

const sketch = (p) => {
    let gameState = STATE.TITLE;
    let currentSeasonIndex = 0; // 0-9 for 10 seasons
    let seasonTimer = 0; // Frames elapsed in current season
    let player;
    let objects = [];
    let sprites = {};
    let screenShake = 0;
    let collectedCount = 0;

    let world;
    let camera;
    let spawnRng;

    // Particle system
    let particles = [];

    // Pickup notification system
    let pickupNotifications = [];
    let collectedTypes = {}; // Track count of each collected object type

    // Distance-based spawning
    let spawnCheckCounter = 0;
    let lastPlayerX = 0;

    // Space background stars (generated once)
    let backgroundStars = [];
    let lastPlayerY = 0;

    function getCurrentSeason() {
        return SEASON_CYCLE[currentSeasonIndex % 4];
    }

    function getSeasonYear() {
        return Math.floor(currentSeasonIndex / 4) + 1;
    }

    function getSeasonDisplayName() {
        const season = getCurrentSeason();
        const year = getSeasonYear();
        return `${season.charAt(0).toUpperCase() + season.slice(1)} ${year}`;
    }

    function getSeasonProgress() {
        return Math.min(seasonTimer / SEASON_DURATION, 1);
    }

    // Calculate blend factor for season color transition (0 = current season, 1 = next season)
    // Transition spans 4 seconds before season end
    function getSeasonColorBlend() {
        if (seasonTimer >= SEASON_FADE_START) {
            const fadeProgress = (seasonTimer - SEASON_FADE_START) / SEASON_TRANSITION_DURATION;
            // Linear interpolation from 0 to 1
            return fadeProgress;
        }
        return 0;
    }

    // Get the next season name
    function getNextSeason() {
        const nextIndex = (currentSeasonIndex + 1) % 4;
        return SEASON_CYCLE[nextIndex];
    }

    function calculateZoom() {
        // Calculate zoom so player is always PLAYER_SCREEN_RATIO of screen height
        // playerSize * zoom = SCREEN_HEIGHT * PLAYER_SCREEN_RATIO
        const targetScreenSize = SCREEN_HEIGHT * PLAYER_SCREEN_RATIO;
        const zoom = targetScreenSize / player.size;
        // Clamp to safety limits
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    }

    // Calculate wrapped distance between two points
    function getWrappedDistance(x1, y1, x2, y2) {
        let dx = Math.abs(x1 - x2);
        let dy = Math.abs(y1 - y2);
        if (dx > WORLD_WIDTH / 2) dx = WORLD_WIDTH - dx;
        if (dy > WORLD_HEIGHT / 2) dy = WORLD_HEIGHT - dy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Distance-based object management - despawn far objects and spawn nearby ones
    function updateDistanceBasedSpawning() {
        spawnCheckCounter++;
        if (spawnCheckCounter < SPAWN_CHECK_INTERVAL) return;
        spawnCheckCounter = 0;

        const playerX = player.x;
        const playerY = player.y;

        // Scale radii based on zoom (smaller zoom = see more world = need larger radii)
        const currentZoom = camera.zoom;
        const zoomScale = 1 / currentZoom;
        const spawnRadius = BASE_SPAWN_RADIUS * zoomScale;
        const despawnRadius = BASE_DESPAWN_RADIUS * zoomScale;
        const keepRadius = BASE_KEEP_RADIUS * zoomScale;

        // Check if player has moved significantly (scaled by zoom)
        const moveThreshold = 50 * zoomScale;
        const moveDistance = getWrappedDistance(playerX, playerY, lastPlayerX, lastPlayerY);
        if (moveDistance < moveThreshold) return; // Don't update if player hasn't moved much

        lastPlayerX = playerX;
        lastPlayerY = playerY;

        const season = getCurrentSeason();
        const playerSize = player.size;

        // Despawn objects that are too far
        const objectsToKeep = [];
        for (const obj of objects) {
            const dist = getWrappedDistance(obj.x, obj.y, playerX, playerY);
            if (dist < despawnRadius) {
                objectsToKeep.push(obj);
            }
        }

        // Calculate how many objects we lost
        const despawnedCount = objects.length - objectsToKeep.length;
        objects = objectsToKeep;

        // Enforce MAX_OBJECTS limit by removing objects that are far from player
        // Prioritize keeping nearby collectible objects (they're important for gameplay)
        if (objects.length > MAX_OBJECTS) {
            // Collectible threshold: objects smaller than 95% of player can be collected
            const collectibleThreshold = playerSize * 0.95;

            objects.sort((a, b) => {
                const distA = getWrappedDistance(a.x, a.y, playerX, playerY);
                const distB = getWrappedDistance(b.x, b.y, playerX, playerY);

                // Nearby collectible objects have HIGHEST priority (never cull them)
                const nearCollectibleA = distA < keepRadius && a.size < collectibleThreshold;
                const nearCollectibleB = distB < keepRadius && b.size < collectibleThreshold;
                if (nearCollectibleA && !nearCollectibleB) return 1; // Keep A
                if (nearCollectibleB && !nearCollectibleA) return -1; // Keep B

                // Objects within keepRadius get high priority
                const nearA = distA < keepRadius;
                const nearB = distB < keepRadius;
                if (nearA && !nearB) return 1; // Keep A
                if (nearB && !nearA) return -1; // Keep B

                // For objects outside keepRadius, prioritize by inverse distance
                const priorityA = 1 / Math.max(distA, 1);
                const priorityB = 1 / Math.max(distB, 1);
                return priorityA - priorityB; // Lower priority first (will be sliced off)
            });

            objects = objects.slice(objects.length - MAX_OBJECTS);
        }

        // Spawn new objects only to replace despawned ones and maintain minimum density
        // Check density in the visible area first
        const visibleRadius = spawnRadius * 0.5;
        let nearbyCount = 0;
        for (const obj of objects) {
            const dist = getWrappedDistance(obj.x, obj.y, playerX, playerY);
            if (dist < visibleRadius) {
                nearbyCount++;
            }
        }

        // Target density: roughly 1 object per 150x150 area within visible radius
        const visibleArea = Math.PI * visibleRadius * visibleRadius;
        const targetDensity = visibleArea / (150 * 150);
        const densityDeficit = Math.max(0, Math.floor(targetDensity - nearbyCount));

        // Only spawn to replace despawned objects or fill density deficit (not aggressively)
        const availableSlots = MAX_OBJECTS - objects.length;
        const spawnCount = Math.min(despawnedCount + densityDeficit, availableSlots);
        if (spawnCount > 0) {
            const spawnSeed = WORLD_SEED + p.frameCount;
            const rng = new SeededRandom(spawnSeed);

            for (let i = 0; i < spawnCount; i++) {
                // Spawn at edge of spawn radius in random direction
                const angle = rng.next() * Math.PI * 2;
                const dist = spawnRadius * 0.8 + rng.next() * spawnRadius * 0.4;

                let newX = playerX + Math.cos(angle) * dist;
                let newY = playerY + Math.sin(angle) * dist;

                // Wrap coordinates
                newX = ((newX % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
                newY = ((newY % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

                const biome = world.getBiomeAt(newX, newY);
                const seasonalObjects = biome.objects[season] || [];
                if (seasonalObjects.length === 0) continue;

                // Filter by player size
                const validObjects = seasonalObjects.filter(obj =>
                    shouldSpawnForPlayerSize(obj, playerSize)
                );
                if (validObjects.length === 0) continue;

                // Check density
                if (rng.next() > biome.objectDensity) continue;

                const objDef = weightedRandomSelect(validObjects, rng, playerSize);
                if (!objDef) continue;

                const size = objDef.minSize + rng.next() * (objDef.maxSize - objDef.minSize);
                const sprite = sprites[objDef.emoji];
                const obj = new GameObject(newX, newY, size, objDef, sprite);
                objects.push(obj);
            }
        }
    }

    function addPickupNotification(emoji, name, count, isRare = false) {
        // Check if there's already a notification for this emoji - update it instead of adding new
        const existing = pickupNotifications.find(n => n.emoji === emoji);
        if (existing) {
            existing.count = count;
            existing.timer = isRare ? 150 : 90; // Rare items stay longer
            if (isRare) existing.isRare = true;
            return;
        }

        pickupNotifications.push({
            emoji,
            name,
            count,
            timer: isRare ? 150 : 90, // ~2.5 seconds for rare, ~1.5 for normal
            y: 0,
            isRare,
        });
        // Keep only last 4 notifications
        if (pickupNotifications.length > 4) {
            pickupNotifications.shift();
        }
    }

    function updatePickupNotifications() {
        for (let i = pickupNotifications.length - 1; i >= 0; i--) {
            const notif = pickupNotifications[i];
            notif.timer--;
            if (notif.timer <= 0) {
                pickupNotifications.splice(i, 1);
            }
        }
    }

    function calculateGrowthAmount(objectSize, playerSize) {
        // Growth is proportional to object size relative to player
        // Smaller relative objects give less growth
        // This creates a natural progression where you need bigger objects as you grow
        const sizeRatio = objectSize / playerSize;
        const baseGrowth = objectSize * 0.04;
        const scaledGrowth = baseGrowth * Math.pow(sizeRatio, 0.5);
        return Math.max(0.1, scaledGrowth);
    }

    // Load sprites for all biome objects across all seasons
    function loadSprites() {
        for (const biome of Object.values(BIOMES)) {
            for (const season of SEASON_CYCLE) {
                const seasonalObjects = biome.objects[season] || [];
                for (const objDef of seasonalObjects) {
                    if (!sprites[objDef.emoji]) {
                        sprites[objDef.emoji] = createEmojiSprite(p, objDef.emoji, DEFAULT_SPRITE_SIZE);
                    }
                }
            }
        }

        // Load large object sprites at even higher resolution
        const largeEmojis = ["🏠", "🌲", "🌳", "🪨", "🐳", "🐋", "🐙", "🦑"];
        for (const emoji of largeEmojis) {
            if (!sprites[emoji]) {
                sprites[emoji] = createEmojiSprite(p, emoji, LARGE_SPRITE_SIZE);
            }
        }
    }

    function weightedRandomSelect(items, rng, playerSize = null) {
        if (!items || items.length === 0) return null;

        // Calculate adjusted weights to ensure a good mix of collectible and obstacle objects
        const adjustedItems = items.map(item => {
            let weight = item.weight || 1;

            if (playerSize !== null) {
                // Objects can be collected when they're < 95% of player size
                const collectibleThreshold = playerSize * 0.95;
                const avgSize = (item.minSize + item.maxSize) / 2;

                if (avgSize <= collectibleThreshold) {
                    // BOOST collectible objects - they're important for progression!
                    // Smaller objects relative to player get bigger boost
                    const sizeRatio = avgSize / collectibleThreshold;
                    // At ratio 0.5 (half player size): 3x boost
                    // At ratio 0.8 (close to player size): 1.5x boost
                    const boost = 1 + (1 - sizeRatio) * 4;
                    weight *= boost;
                } else {
                    // REDUCE obstacle objects significantly
                    // The larger the obstacle relative to player, the more we reduce weight
                    const obstacleRatio = avgSize / collectibleThreshold;
                    // At 2x player size: 95% reduction
                    // At 5x player size: 99% reduction
                    const reduction = Math.min(0.99, 1 - Math.pow(0.5, obstacleRatio - 1));
                    weight *= (1 - reduction);
                }
            }

            return { ...item, adjustedWeight: weight };
        });

        const totalWeight = adjustedItems.reduce((sum, item) => sum + item.adjustedWeight, 0);
        let rand = rng.next() * totalWeight;

        for (const item of adjustedItems) {
            rand -= item.adjustedWeight;
            if (rand <= 0) return item;
        }
        return items[0];
    }

    // Generate spawn points on the island (not ocean)
    function generateLandSpawnPoints(count, seed) {
        const rng = new SeededRandom(seed);
        const points = [];

        for (let i = 0; i < count; i++) {
            // Generate random angle and distance from center
            const angle = rng.next() * Math.PI * 2;
            // Use sqrt for uniform distribution across circular area
            const distRatio = Math.sqrt(rng.next()) * 0.85; // Stay within 85% of island radius

            const x = WORLD_CENTER_X + Math.cos(angle) * ISLAND_RADIUS_X * distRatio;
            const y = WORLD_CENTER_Y + Math.sin(angle) * ISLAND_RADIUS_Y * distRatio;
            const biome = world.getBiomeAt(x, y);

            // Skip if this ended up in ocean (due to noise-based coastline)
            if (biome.isOcean) continue;

            points.push({ x, y, biome });
        }

        return points;
    }

    // Generate spawn points in the ocean (around the island)
    function generateOceanSpawnPoints(count, seed) {
        const rng = new SeededRandom(seed);
        const points = [];

        for (let i = 0; i < count; i++) {
            // Generate random angle and distance from center (in ocean zone)
            const angle = rng.next() * Math.PI * 2;
            // Spawn between 1.1x and 1.4x island radius (in ocean)
            const distRatio = 1.1 + rng.next() * 0.3;

            const x = WORLD_CENTER_X + Math.cos(angle) * ISLAND_RADIUS_X * distRatio;
            const y = WORLD_CENTER_Y + Math.sin(angle) * ISLAND_RADIUS_Y * distRatio;

            // Make sure we're still within world bounds
            if (x < 50 || x > WORLD_WIDTH - 50 || y < 50 || y > WORLD_HEIGHT - 50) continue;

            const biome = world.getBiomeAt(x, y);

            // Only add if actually in ocean
            if (biome.isOcean) {
                points.push({ x, y, biome });
            }
        }

        return points;
    }

    // Spawn additional objects around a seed object based on its spawn pattern
    // Returns array of new objects to add
    function spawnPatternObjects(seedX, seedY, objDef, rng) {
        const newObjects = [];
        const pattern = objDef.spawnPattern || "scattered";

        if (pattern === "scattered") {
            // Scattered objects spawn alone - no additional objects
            return newObjects;
        }

        if (pattern === "clustered") {
            // Spawn 4-10 more objects in a cluster around the seed
            const clusterCount = 4 + Math.floor(rng.next() * 7);
            const clusterRadius = Math.max(60, objDef.maxSize * 3);

            for (let i = 0; i < clusterCount; i++) {
                const angle = rng.next() * Math.PI * 2;
                const dist = rng.next() * clusterRadius;
                let x = seedX + Math.cos(angle) * dist;
                let y = seedY + Math.sin(angle) * dist;

                // Wrap coordinates
                x = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
                y = ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

                // Check biome - only spawn if same biome or not ocean
                const pointBiome = world.getBiomeAt(x, y);
                if (pointBiome.isOcean) continue;

                const size = objDef.minSize + rng.next() * (objDef.maxSize - objDef.minSize);
                const sprite = sprites[objDef.emoji];
                const obj = new GameObject(x, y, size, objDef, sprite);
                newObjects.push(obj);
            }
        }

        if (pattern === "grid") {
            // Spawn a grid of objects around the seed
            const rows = 3 + Math.floor(rng.next() * 3); // 3-5 rows
            const cols = 4 + Math.floor(rng.next() * 4); // 4-7 cols
            const spacing = Math.max(objDef.maxSize * 1.5, 35);

            // Slight rotation for visual interest
            const rotation = rng.next() * Math.PI * 0.12 - Math.PI * 0.06; // ±11 degrees
            const cosR = Math.cos(rotation);
            const sinR = Math.sin(rotation);

            const startX = seedX - (cols - 1) * spacing / 2;
            const startY = seedY - (rows - 1) * spacing / 2;

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    // Skip the center (seed is already there)
                    if (row === Math.floor(rows / 2) && col === Math.floor(cols / 2)) continue;

                    // Add small jitter
                    const jitterX = (rng.next() - 0.5) * spacing * 0.2;
                    const jitterY = (rng.next() - 0.5) * spacing * 0.2;

                    const localX = col * spacing + jitterX;
                    const localY = row * spacing + jitterY;

                    // Apply rotation
                    const rotatedX = localX * cosR - localY * sinR;
                    const rotatedY = localX * sinR + localY * cosR;

                    let x = startX + rotatedX;
                    let y = startY + rotatedY;

                    // Wrap coordinates
                    x = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
                    y = ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

                    // Check biome - only spawn in same biome type or non-ocean
                    const pointBiome = world.getBiomeAt(x, y);
                    if (pointBiome.isOcean) continue;

                    const size = objDef.minSize + rng.next() * (objDef.maxSize - objDef.minSize);
                    const sprite = sprites[objDef.emoji];
                    const obj = new GameObject(x, y, size, objDef, sprite);
                    newObjects.push(obj);
                }
            }
        }

        return newObjects;
    }

    // Spawn objects around the player position
    // This is the main spawning function - spawns in rings around player
    function spawnObjectsAroundPlayer(centerX, centerY, maxRadius, targetCount, ringIndex = 0) {
        const season = getCurrentSeason();
        const playerSize = player ? player.size : STARTING_SIZE;
        // Use different seed for each ring to get variety
        const rng = new SeededRandom(WORLD_SEED + currentSeasonIndex * 1000 + ringIndex * 7777);

        let spawned = 0;
        const attempts = targetCount * 5; // More attempts to ensure we hit target

        for (let i = 0; i < attempts && spawned < targetCount; i++) {
            // Random position within radius
            const angle = rng.next() * Math.PI * 2;
            const dist = Math.sqrt(rng.next()) * maxRadius; // sqrt for uniform distribution

            let x = centerX + Math.cos(angle) * dist;
            let y = centerY + Math.sin(angle) * dist;

            // Wrap coordinates
            x = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
            y = ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

            const biome = world.getBiomeAt(x, y);
            const seasonalObjects = biome.objects[season] || [];
            if (seasonalObjects.length === 0) continue;

            // Skip density check for first ring - always spawn close objects
            // Other rings use density check
            if (ringIndex > 0 && rng.next() > biome.objectDensity) continue;

            // Filter to objects valid for player size
            const validObjects = seasonalObjects.filter(obj =>
                shouldSpawnForPlayerSize(obj, playerSize)
            );
            if (validObjects.length === 0) continue;

            const objDef = weightedRandomSelect(validObjects, rng, playerSize);
            if (!objDef) continue;

            const size = objDef.minSize + rng.next() * (objDef.maxSize - objDef.minSize);
            const sprite = sprites[objDef.emoji];
            const obj = new GameObject(x, y, size, objDef, sprite);
            objects.push(obj);
            spawned++;

            // Spawn pattern objects around the seed (clustered or grid)
            const patternObjects = spawnPatternObjects(x, y, objDef, rng);
            for (const pObj of patternObjects) {
                if (spawned >= targetCount) break;
                objects.push(pObj);
                spawned++;
            }
        }

        return spawned;
    }

    function spawnWorldObjects() {
        objects = [];

        // Spawn objects in rings around the player, starting close and expanding outward
        // This ensures nearby objects are always present
        const playerX = player ? player.x : WORLD_CENTER_X;
        const playerY = player ? player.y : WORLD_CENTER_Y;

        // Ring 0: Very close (0-100 pixels) - 80 objects (no density check)
        spawnObjectsAroundPlayer(playerX, playerY, 100, 80, 0);

        // Ring 1: Close (100-300 pixels) - 120 objects
        spawnObjectsAroundPlayer(playerX, playerY, 300, 120, 1);

        // Ring 2: Medium (300-600 pixels) - 150 objects
        spawnObjectsAroundPlayer(playerX, playerY, 600, 150, 2);

        // Ring 3: Far (600-1000 pixels) - 150 objects
        spawnObjectsAroundPlayer(playerX, playerY, 1000, 150, 3);
    }

    function createParticles(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = 2 + Math.random() * 2;
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                color,
            });
        }
    }

    // Create special golden burst effect for rare items
    function createRareParticles(x, y) {
        // Golden sparkle burst - more particles, multiple rings
        const colors = [
            [255, 215, 0],   // Gold
            [255, 255, 100], // Bright yellow
            [255, 180, 50],  // Orange gold
        ];

        // Inner fast burst
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 4 + Math.random() * 3;
            const color = colors[Math.floor(Math.random() * colors.length)];
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.2,
                color,
                isRare: true,
            });
        }

        // Outer slower sparkles
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 1.5;
            const color = colors[Math.floor(Math.random() * colors.length)];
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.5,
                color,
                isRare: true,
            });
        }
    }

    // Check if an object is rare (low spawn weight)
    function isRareObject(objType) {
        return objType.weight !== undefined && objType.weight <= 0.05;
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const part = particles[i];
            part.x += part.vx;
            part.y += part.vy;
            part.life -= 0.05;
            if (part.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function startGame() {
        currentSeasonIndex = 0;
        collectedCount = 0;
        particles = [];
        pickupNotifications = [];
        collectedTypes = {};

        // Create world and camera
        world = new World(WORLD_SEED);
        camera = new Camera(SCREEN_WIDTH, SCREEN_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);

        // Create player at start position
        const startPos = world.getStartPosition();
        player = new Player(startPos.x, startPos.y, STARTING_SIZE);

        // Center camera on player immediately
        camera.centerOn(player.x, player.y);

        // Reset season timer
        seasonTimer = 0;

        // Load sprites and spawn objects around the player
        loadSprites();
        spawnWorldObjects();

        // Initialize last player position for distance-based spawning
        lastPlayerX = player.x;
        lastPlayerY = player.y;

        gameState = STATE.PLAYING;
    }

    function advanceSeason() {
        currentSeasonIndex++;
        seasonTimer = 0;

        if (currentSeasonIndex >= TOTAL_SEASONS) {
            gameState = STATE.WIN;
        } else {
            // Load sprites for new season
            loadSprites();

            // Only respawn off-screen objects (keep visible ones for continuity)
            respawnOffScreenObjects();
        }
    }

    // Respawn only objects that are off-screen
    function respawnOffScreenObjects() {
        const season = getCurrentSeason();
        const playerSize = player ? player.size : STARTING_SIZE;
        spawnRng = new SeededRandom(WORLD_SEED + currentSeasonIndex * 1000);

        // Get visible bounds with some margin
        const bounds = camera.getVisibleBounds();
        const margin = 200;

        // Keep objects that are on-screen, or permanent objects (rocks, trees, houses) anywhere
        const onScreenObjects = objects.filter(obj => {
            const isOnScreen = obj.x > bounds.left - margin &&
                   obj.x < bounds.right + margin &&
                   obj.y > bounds.top - margin &&
                   obj.y < bounds.bottom + margin;
            const isPermanent = PERMANENT_EMOJIS.has(obj.type.emoji);
            return isOnScreen || isPermanent;
        });

        // Calculate how many objects to add (maintain reasonable density for larger world)
        const targetObjectCount = 8000;
        const objectsToAdd = Math.max(0, targetObjectCount - onScreenObjects.length);

        // Generate new spawn points for off-screen areas
        const newLandPoints = generateLandSpawnPoints(Math.floor(objectsToAdd * 0.8), WORLD_SEED + currentSeasonIndex * 100 + 50000);
        const newOceanPoints = generateOceanSpawnPoints(Math.floor(objectsToAdd * 0.2), WORLD_SEED + currentSeasonIndex * 200 + 50000);

        // Start fresh with on-screen objects
        objects = onScreenObjects;

        // Add new objects from land points
        for (const point of newLandPoints) {
            // Skip if too close to visible area
            if (point.x > bounds.left - margin &&
                point.x < bounds.right + margin &&
                point.y > bounds.top - margin &&
                point.y < bounds.bottom + margin) continue;

            const biome = point.biome;
            const seasonalObjects = biome.objects[season] || [];
            if (seasonalObjects.length === 0) continue;
            if (spawnRng.next() > biome.objectDensity) continue;

            const validObjects = seasonalObjects.filter(obj =>
                shouldSpawnForPlayerSize(obj, playerSize)
            );
            if (validObjects.length === 0) continue;

            const objDef = weightedRandomSelect(validObjects, spawnRng, playerSize);
            if (!objDef) continue;

            const size = objDef.minSize + spawnRng.next() * (objDef.maxSize - objDef.minSize);
            const sprite = sprites[objDef.emoji];
            const obj = new GameObject(point.x, point.y, size, objDef, sprite);
            objects.push(obj);
        }

        // Add new objects from ocean points
        for (const point of newOceanPoints) {
            if (point.x > bounds.left - margin &&
                point.x < bounds.right + margin &&
                point.y > bounds.top - margin &&
                point.y < bounds.bottom + margin) continue;

            const biome = point.biome;
            const seasonalObjects = biome.objects[season] || [];
            if (seasonalObjects.length === 0) continue;
            if (spawnRng.next() > biome.objectDensity) continue;

            const validObjects = seasonalObjects.filter(obj =>
                shouldSpawnForPlayerSize(obj, playerSize)
            );
            if (validObjects.length === 0) continue;

            const objDef = weightedRandomSelect(validObjects, spawnRng, playerSize);
            if (!objDef) continue;

            const size = objDef.minSize + spawnRng.next() * (objDef.maxSize - objDef.minSize);
            const sprite = sprites[objDef.emoji];
            const obj = new GameObject(point.x, point.y, size, objDef, sprite);
            objects.push(obj);
        }

    }

    p.setup = () => {
        p.createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
        p.textFont("sans-serif");

        // Generate background stars once
        generateBackgroundStars();
    };

    function generateBackgroundStars() {
        backgroundStars = [];
        const starRng = new SeededRandom(12345);

        // Create layers of stars with different properties
        for (let i = 0; i < 80; i++) {
            backgroundStars.push({
                x: starRng.next() * SCREEN_WIDTH,
                y: starRng.next() * SCREEN_HEIGHT,
                size: starRng.range(0.5, 2.5),
                brightness: starRng.range(100, 255),
                twinkleSpeed: starRng.range(0.02, 0.08),
                twinkleOffset: starRng.next() * Math.PI * 2,
                // Some stars have color tints
                hue: starRng.next() < 0.3 ? starRng.range(220, 320) : null, // Purple/pink range
            });
        }
    }

    function drawSpaceBackground() {
        const time = p.frameCount;

        // Deep space base - very dark with subtle purple
        p.background(8, 5, 18);

        // Draw bright, dynamic nebula clouds
        p.noStroke();
        for (let i = 0; i < 7; i++) {
            // More dynamic movement with multiple sine waves
            const nebulaX = (Math.sin(i * 1.7 + time * 0.003) * 0.4 +
                           Math.cos(i * 0.9 + time * 0.002) * 0.15 + 0.5) * SCREEN_WIDTH;
            const nebulaY = (Math.cos(i * 2.3 + time * 0.0025) * 0.4 +
                           Math.sin(i * 1.1 + time * 0.0015) * 0.15 + 0.5) * SCREEN_HEIGHT;

            // Pulsing size
            const pulseScale = 1 + Math.sin(time * 0.02 + i * 0.7) * 0.2;
            const nebulaSize = (100 + i * 35) * pulseScale;

            // Brighter purple/magenta/cyan nebula glow with color variation
            for (let r = nebulaSize; r > 0; r -= 15) {
                const normalizedR = r / nebulaSize;
                const alpha = normalizedR * 40; // Much brighter (was 15)
                // Cycle through purples, magentas, and occasional cyan
                const baseHue = 260 + i * 20 + Math.sin(time * 0.015 + i * 0.5) * 40;
                const hue = (baseHue + (1 - normalizedR) * 30) % 360;
                const saturation = 70 + Math.sin(time * 0.01 + r * 0.01) * 20;
                const brightness = 50 + normalizedR * 30; // Brighter cores
                p.colorMode(p.HSB);
                p.fill(hue, saturation, brightness, alpha / 255);
                p.ellipse(nebulaX, nebulaY, r, r * 0.7);
                p.colorMode(p.RGB);
            }
        }

        // Draw stars with twinkling
        p.noStroke();
        for (const star of backgroundStars) {
            const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7;
            const brightness = star.brightness * twinkle;

            if (star.hue !== null) {
                // Colored star (purple/pink tints)
                p.colorMode(p.HSB);
                p.fill(star.hue, 50, brightness / 255 * 100);
                p.colorMode(p.RGB);
            } else {
                // White/warm star
                p.fill(brightness, brightness * 0.95, brightness * 0.9);
            }

            p.ellipse(star.x, star.y, star.size * twinkle, star.size * twinkle);
        }
    }

    p.draw = () => {
        // Apply screen shake
        p.push();
        if (screenShake > 0) {
            p.translate(
                (Math.random() - 0.5) * screenShake,
                (Math.random() - 0.5) * screenShake
            );
            screenShake *= 0.9;
            if (screenShake < 0.5) screenShake = 0;
        }

        switch (gameState) {
            case STATE.TITLE:
                drawTitleScreen();
                break;
            case STATE.PLAYING:
                updateGame();
                drawGame();
                break;
            case STATE.PLANET_CONSUMED:
                drawPlanetConsumedScreen();
                break;
        }

        p.pop();
    };

    // Helper function to draw text with black outline
    function drawOutlinedText(text, x, y, outlineWeight = 2) {
        const currentFill = p.drawingContext.fillStyle;
        p.fill(0);
        for (let ox = -outlineWeight; ox <= outlineWeight; ox++) {
            for (let oy = -outlineWeight; oy <= outlineWeight; oy++) {
                if (ox !== 0 || oy !== 0) {
                    p.text(text, x + ox, y + oy);
                }
            }
        }
        p.drawingContext.fillStyle = currentFill;
        p.text(text, x, y);
    }

    function drawTitleScreen() {
        drawSpaceBackground();

        // Title
        p.fill(255);
        p.textSize(24);
        p.textAlign(p.CENTER, p.CENTER);
        drawOutlinedText("SEASONAL", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 50);
        drawOutlinedText("GROWTH", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 20);

        // Instructions
        p.textSize(9);
        p.fill(200);
        drawOutlinedText("How big can you get?", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 45);

        p.textSize(12);
        p.fill(255, 255, 100);
        const blink = Math.sin(p.frameCount * 0.1) > 0;
        if (blink) {
            drawOutlinedText("Press ENTER to Start", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 80);
        }

        if (SYSTEM.ONE_PLAYER) {
            startGame();
        }
    }

    function updateGame() {
        // Get input
        const input = {
            up: PLAYER_1.DPAD.up,
            down: PLAYER_1.DPAD.down,
            left: PLAYER_1.DPAD.left,
            right: PLAYER_1.DPAD.right,
        };

        // Update player with world bounds and world reference (for biome checks)
        player.update(input, WORLD_WIDTH, WORLD_HEIGHT, world);

        // Update camera zoom based on player size
        camera.setTargetZoom(calculateZoom());

        // Update camera to follow player
        camera.follow(player);

        // Update distance-based object spawning/despawning
        updateDistanceBasedSpawning();

        // Apply gravity and update all objects
        // Gravity strength: base value that gets multiplied by size-based factors in applyGravity
        const gravityStrength = 15;

        for (const obj of objects) {
            // Only apply gravity to objects the player can collect
            if (!obj.collected && player.canCollect(obj)) {
                obj.applyGravity(player.x, player.y, gravityStrength, player.size, WORLD_WIDTH, WORLD_HEIGHT);
            }
            obj.update(WORLD_WIDTH, WORLD_HEIGHT);
        }

        // Check collisions with collectible objects (with world wrapping)
        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (obj.collected) continue;

            if (player.collidesWith(obj, WORLD_WIDTH, WORLD_HEIGHT)) {
                if (player.canCollect(obj)) {
                    // Calculate growth based on object size relative to player
                    const growAmount = calculateGrowthAmount(obj.size, player.size);
                    player.grow(growAmount);
                    collectedCount++;

                    // Track collected type and show notification
                    const emoji = obj.type.emoji;
                    const name = obj.type.name;
                    collectedTypes[emoji] = (collectedTypes[emoji] || 0) + 1;

                    // Check if this is a rare item
                    const isRare = isRareObject(obj.type);

                    if (isRare) {
                        // Special golden burst for rare items
                        createRareParticles(obj.x, obj.y);
                        addPickupNotification(emoji, name, collectedTypes[emoji], true);
                        screenShake = 3; // Small celebratory shake
                    } else {
                        createParticles(obj.x, obj.y, [255, 255, 150]);
                        addPickupNotification(emoji, name, collectedTypes[emoji], false);
                    }

                    obj.collected = true;
                    objects.splice(i, 1);

                    // Check if player has grown large enough to consume the planet
                    if (player.size >= PLANET_CONSUME_SIZE) {
                        gameState = STATE.PLANET_CONSUMED;
                    }
                } else {
                    // Bounce (with wrapping support)
                    player.bounceFrom(obj.x, obj.y, WORLD_WIDTH, WORLD_HEIGHT);
                    screenShake = 4;
                }
            }
        }

        // Time-based season advancement
        seasonTimer++;
        if (seasonTimer >= SEASON_DURATION) {
            advanceSeason();
        }

        updateParticles();
        updatePickupNotifications();
    }

    function drawGame() {
        // Calculate season color blending (transitions 4 seconds before season change)
        const seasonBlend = getSeasonColorBlend();
        const nextSeason = getNextSeason();

        drawSpaceBackground();

        p.push();
        camera.applyTransform(p);

        if (seasonBlend > 0) {
            world.draw(p, camera, getCurrentSeason(), nextSeason, seasonBlend, player);
        } else {
            world.draw(p, camera, getCurrentSeason(), null, 0, player);
        }

        // Sort all objects by size for depth
        const visibleObjects = objects.filter(
            (obj) => !obj.collected && obj.isVisible(camera)
        );
        visibleObjects.sort((a, b) => a.size - b.size);

        // Draw objects at their wrapped positions
        for (const obj of visibleObjects) {
            const wrappedPos = camera.getWrappedPosition(obj.x, obj.y);
            obj.draw(p, wrappedPos.x, wrappedPos.y);
        }

        // Draw player at wrapped position
        const playerWrapped = camera.getWrappedPosition(player.x, player.y);
        player.draw(p, playerWrapped.x, playerWrapped.y);

        // Draw particles (in world space)
        drawParticlesTo(p);

        p.pop();

        // Draw UI (in screen space)
        drawUI();
    }

    // Draw particles to a specific graphics context
    function drawParticlesTo(g) {
        g.noStroke();
        for (const part of particles) {
            if (part.isRare) {
                // Rare particles have a sparkle effect
                const sparkle = Math.sin(p.frameCount * 0.3 + part.x * 0.1) * 0.5 + 0.5;
                const size = (5 + sparkle * 3) * part.life;
                g.fill(part.color[0], part.color[1], part.color[2], part.life * 255);
                g.ellipse(part.x, part.y, size, size);
                // Add a bright core
                g.fill(255, 255, 255, part.life * 200 * sparkle);
                g.ellipse(part.x, part.y, size * 0.4, size * 0.4);
            } else {
                g.fill(part.color[0], part.color[1], part.color[2], part.life * 255);
                g.ellipse(part.x, part.y, 4 * part.life, 4 * part.life);
            }
        }
    }

    function drawUI() {
        // Season name badge with progress bar and emoji
        const badgeWidth = 85;
        const badgeHeight = 28;
        p.fill(0, 0, 0, 120);
        p.noStroke();
        p.rect(5, 5, badgeWidth, badgeHeight, 3);

        // Season name
        p.fill(255);
        p.textSize(11);
        p.textAlign(p.LEFT, p.TOP);
        p.text(getSeasonDisplayName(), 10, 7);

        // Progress bar with seasonal emoji
        const progress = getSeasonProgress();
        const barWidth = badgeWidth - 10;
        const barHeight = 6;
        const barX = 10;
        const barY = 22;

        // Progress bar background
        p.fill(50, 50, 50, 150);
        p.rect(barX, barY, barWidth, barHeight, 2);

        // Progress bar fill with season-appropriate color
        const season = getCurrentSeason();
        const seasonColors = {
            spring: [120, 200, 120],
            summer: [220, 180, 50],
            fall: [200, 120, 60],
            winter: [140, 180, 220]
        };
        const barColor = seasonColors[season];
        p.fill(barColor[0], barColor[1], barColor[2]);
        p.rect(barX, barY, barWidth * progress, barHeight, 2);

        // Seasonal emoji sliding along the progress bar
        const emoji = SEASON_EMOJI[season];
        const emojiX = barX + barWidth * progress;
        const emojiY = barY + barHeight / 2;
        p.textSize(10);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(emoji, emojiX, emojiY);

        // Current biome indicator
        const currentBiome = world.getBiomeAt(player.x, player.y);
        p.fill(0, 0, 0, 100);
        p.rect(5, 36, 65, 14, 2);
        p.fill(200);
        p.textSize(8);
        p.textAlign(p.LEFT, p.TOP);
        p.text(currentBiome.name, 10, 38);

        // Size display (simplified)
        p.fill(0, 0, 0, 120);
        p.rect(SCREEN_WIDTH - 65, 5, 60, 18, 3);

        p.fill(255);
        p.textSize(10);
        p.textAlign(p.RIGHT, p.TOP);
        p.text(`${Math.floor(player.size)}`, SCREEN_WIDTH - 10, 8);

        // Pickup notifications (bottom right, above minimap area)
        drawPickupNotifications();

        // Mini-map (square, player-centered, scales with player size)
        const mapSize = 50;
        const mapX = 5;
        const mapY = SCREEN_HEIGHT - mapSize - 5;

        // Pass season blending parameters so minimap transitions match terrain
        const seasonBlend = getSeasonColorBlend();
        const nextSeason = getNextSeason();
        world.drawMiniMap(p, mapX, mapY, mapSize, player, getCurrentSeason(), nextSeason, seasonBlend);
    }

    function drawPickupNotifications() {
        const startY = SCREEN_HEIGHT - 60;
        const x = SCREEN_WIDTH - 5;

        for (let i = 0; i < pickupNotifications.length; i++) {
            const notif = pickupNotifications[i];
            const targetY = startY - i * 18;

            // Animate y position
            notif.y += (targetY - notif.y) * 0.2;

            // Fade out near end
            const alpha = notif.timer > 30 ? 255 : (notif.timer / 30) * 255;

            // Measure actual text width
            p.textSize(9);
            const notifText = notif.isRare
                ? `${notif.emoji} ${notif.name} x${notif.count}`
                : `${notif.emoji} ${notif.name} x${notif.count}`;
            const measuredWidth = p.textWidth(notifText);

            const padding = 8;
            const bgX = x - measuredWidth - padding;
            const bgY = notif.y - 6;
            const bgW = measuredWidth + padding;
            const bgH = 16;

            if (notif.isRare) {
                // Golden glowing background for rare items
                const pulse = Math.sin(p.frameCount * 0.15) * 0.3 + 0.7;

                // Outer glow
                p.noStroke();
                p.fill(255, 200, 50, alpha * 0.2 * pulse);
                p.rect(bgX - 2, bgY - 2, bgW + 4, bgH + 4, 5);

                // Golden background
                p.fill(80, 60, 0, alpha * 0.8);
                p.rect(bgX, bgY, bgW, bgH, 3);

                // Golden border
                p.stroke(255, 215, 0, alpha * pulse);
                p.strokeWeight(1);
                p.noFill();
                p.rect(bgX, bgY, bgW, bgH, 3);

                // Golden text
                p.noStroke();
                p.fill(255, 230, 100, alpha);
                p.textAlign(p.RIGHT, p.TOP);
                p.text(notifText, x - 5, notif.y - 4);
            } else {
                // Normal notification
                p.fill(0, 0, 0, alpha * 0.5);
                p.noStroke();
                p.rect(bgX, bgY, bgW, bgH, 3);

                // Text
                p.fill(255, 255, 255, alpha);
                p.textAlign(p.RIGHT, p.TOP);
                p.text(notifText, x - 5, notif.y - 4);
            }
        }
    }

    function drawPlanetConsumedScreen() {
        // Use shared space background
        drawSpaceBackground();

        const time = p.frameCount * 0.02;

        // Draw swirling void/black hole effect
        p.push();
        p.translate(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);

        // Accretion disk rings being sucked in
        for (let ring = 0; ring < 8; ring++) {
            const ringRadius = 120 - ring * 12 + Math.sin(time + ring) * 5;
            const alpha = 150 - ring * 15;
            const hue = (ring * 30 + p.frameCount) % 360;

            p.colorMode(p.HSB);
            p.noFill();
            p.strokeWeight(3 - ring * 0.3);
            p.stroke(hue, 80, 80, alpha / 255);

            // Draw distorted ellipse (sucked toward center)
            p.beginShape();
            for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
                const distortion = 1 + Math.sin(angle * 3 + time * 2) * 0.1;
                const r = ringRadius * distortion;
                const x = Math.cos(angle + time * (0.5 + ring * 0.1)) * r;
                const y = Math.sin(angle + time * (0.5 + ring * 0.1)) * r * 0.6;
                p.vertex(x, y);
            }
            p.endShape(p.CLOSE);
            p.colorMode(p.RGB);
        }

        // Central black hole (player)
        p.noStroke();
        p.fill(0, 0, 0);
        p.ellipse(0, 0, 60, 60);

        // Event horizon glow
        for (let i = 3; i > 0; i--) {
            p.fill(100, 50, 150, 30);
            p.ellipse(0, 0, 60 + i * 15, 60 + i * 15);
        }

        // Gravitational lensing effect - bright ring at event horizon
        p.noFill();
        p.strokeWeight(2);
        p.stroke(200, 150, 255, 200);
        p.ellipse(0, 0, 65, 65);

        p.pop();

        // Scattered stars being pulled in
        p.noStroke();
        for (let i = 0; i < 30; i++) {
            const starAngle = (i * 137.5 + time * 20) * Math.PI / 180;
            const starDist = 80 + (i * 7 + time * 30) % 150;
            const starX = SCREEN_WIDTH / 2 + Math.cos(starAngle) * starDist;
            const starY = SCREEN_HEIGHT / 2 + Math.sin(starAngle) * starDist * 0.7;
            const starAlpha = Math.max(0, 255 - starDist);

            p.fill(255, 255, 200, starAlpha);
            p.ellipse(starX, starY, 2, 2);
        }

        // Text with highlighted phrases
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(11);

        // "You grew too big and consumed the planet."
        // Measure text widths for positioning
        const line1Y = SCREEN_HEIGHT / 2 + 80;
        const line1Parts = ["You grew ", "too big", " and consumed the planet."];
        p.fill(180, 150, 200);
        const w1 = p.textWidth(line1Parts[0]);
        const w2 = p.textWidth(line1Parts[1]);
        const w3 = p.textWidth(line1Parts[2]);
        const totalW1 = w1 + w2 + w3;
        let xPos = SCREEN_WIDTH / 2 - totalW1 / 2;

        p.textAlign(p.LEFT, p.CENTER);
        p.fill(180, 150, 200);
        drawOutlinedText(line1Parts[0], xPos, line1Y, 1);
        xPos += w1;
        p.fill(255, 100, 150); // Highlight "too big"
        drawOutlinedText(line1Parts[1], xPos, line1Y, 1);
        xPos += w2;
        p.fill(180, 150, 200);
        drawOutlinedText(line1Parts[2], xPos, line1Y, 1);

        // "Finally, the cycle of seasons is over."
        const line2Y = SCREEN_HEIGHT / 2 + 100;
        const line2Parts = ["Finally, the cycle of ", "seasons", " is over."];
        const w4 = p.textWidth(line2Parts[0]);
        const w5 = p.textWidth(line2Parts[1]);
        const w6 = p.textWidth(line2Parts[2]);
        const totalW2 = w4 + w5 + w6;
        xPos = SCREEN_WIDTH / 2 - totalW2 / 2;

        p.fill(180, 150, 200);
        drawOutlinedText(line2Parts[0], xPos, line2Y, 1);
        xPos += w4;
        p.fill(100, 200, 255); // Highlight "seasons"
        drawOutlinedText(line2Parts[1], xPos, line2Y, 1);
        xPos += w5;
        p.fill(180, 150, 200);
        drawOutlinedText(line2Parts[2], xPos, line2Y, 1);

        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(10);
        p.fill(150, 100, 180);
        drawOutlinedText(`Final size: ${Math.floor(player.size)}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 125, 1);

        p.textSize(9);
        p.fill(150, 120, 180);
        const blink = Math.sin(p.frameCount * 0.1) > 0;
        if (blink) {
            drawOutlinedText("Press ENTER to play again", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 145, 1);
        }

        if (SYSTEM.ONE_PLAYER) {
            startGame();
        }
    }
};

new p5(sketch, document.getElementById("sketch"));
