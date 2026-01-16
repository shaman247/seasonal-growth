// Procedural world generation with noise-based biomes

import { SimplexNoise, SeededRandom, createNoiseGenerators } from "./noise.js";
import {
    BIOMES,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    WORLD_CENTER_X,
    WORLD_CENTER_Y,
    ISLAND_RADIUS_X,
    ISLAND_RADIUS_Y,
    getZoneInfluence,
    getZoneStrength,
    selectBiome,
    getDistanceFromCenter,
} from "./biomes.js";

// Re-export world dimensions
export { WORLD_WIDTH, WORLD_HEIGHT, WORLD_CENTER_X, WORLD_CENTER_Y, ISLAND_RADIUS_X, ISLAND_RADIUS_Y };

// Tile size for biome map (smaller = more detail, larger = better performance)
export const TILE_SIZE = 32;

// Number of tiles in each dimension
const TILES_X = Math.ceil(WORLD_WIDTH / TILE_SIZE);
const TILES_Y = Math.ceil(WORLD_HEIGHT / TILE_SIZE);

// Default world seed
const DEFAULT_SEED = 42;

export class BiomeMap {
    constructor(seed = DEFAULT_SEED) {
        this.seed = seed;
        this.rng = new SeededRandom(seed);
        this.noise = createNoiseGenerators(seed);

        // Pre-compute biome grid for performance
        this.biomeGrid = this.generateBiomeGrid();
    }

    generateBiomeGrid() {
        const grid = [];

        for (let ty = 0; ty < TILES_Y; ty++) {
            const row = [];
            for (let tx = 0; tx < TILES_X; tx++) {
                // Sample noise at tile center
                const worldX = (tx + 0.5) * TILE_SIZE;
                const worldY = (ty + 0.5) * TILE_SIZE;

                const biome = this.sampleBiome(worldX, worldY);
                row.push(biome);
            }
            grid.push(row);
        }

        return grid;
    }

    sampleBiome(x, y) {
        // Normalize coordinates for noise sampling (relative to world size)
        const nx = x / WORLD_WIDTH;
        const ny = y / WORLD_HEIGHT;

        // Sample coastline noise for organic island shape
        // Use a different scale and seed for variety
        const coastlineNoise = this.noise.coastline.fbm(nx * 3, ny * 3, 3, 0.5, 2, 1);

        // Sample different noise layers with varying scales
        const elevation = this.noise.elevation.fbm(nx * 4, ny * 4, 4, 0.5, 2, 1);
        const moisture = this.noise.moisture.fbm(nx * 3, ny * 3, 3, 0.6, 2, 1);
        const temperature = this.noise.temperature.fbm(nx * 2.5, ny * 2.5, 3, 0.5, 2, 1);

        // Village noise - larger scale for distinct settlement clusters
        // Uses a different noise channel to create independent village placement
        const villageNoise = this.noise.elevation.fbm(nx * 6 + 100, ny * 6 + 100, 2, 0.4, 2, 1);

        // Adjust elevation based on distance from center (higher in middle)
        const dist = getDistanceFromCenter(x, y);
        const centerBonus = Math.max(0, 1 - dist) * 0.3;
        const adjustedElevation = elevation * 0.7 + centerBonus;

        // Get zone influence (now based on angle from center)
        const zonePref = getZoneInfluence(x, y);
        const zoneStrength = getZoneStrength(x, y);

        return selectBiome(adjustedElevation, moisture, temperature, zonePref, zoneStrength, x, y, coastlineNoise, villageNoise);
    }

    // Get coastline noise at a position (for consistent terrain checks)
    getCoastlineNoise(x, y) {
        const nx = x / WORLD_WIDTH;
        const ny = y / WORLD_HEIGHT;
        return this.noise.coastline.fbm(nx * 3, ny * 3, 3, 0.5, 2, 1);
    }

    // Get biome at any world position (with wrapping support)
    getBiomeAt(x, y) {
        // Wrap coordinates
        const wrappedX = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
        const wrappedY = ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

        const tx = Math.floor(wrappedX / TILE_SIZE);
        const ty = Math.floor(wrappedY / TILE_SIZE);

        // Clamp to grid bounds (shouldn't be needed with proper wrapping)
        const clampedTx = Math.max(0, Math.min(TILES_X - 1, tx));
        const clampedTy = Math.max(0, Math.min(TILES_Y - 1, ty));

        return this.biomeGrid[clampedTy][clampedTx];
    }

    // Get terrain color at position for a given season
    getColorAt(x, y, season) {
        const biome = this.getBiomeAt(x, y);
        return biome.colors[season] || biome.colors.spring;
    }
}

export class World {
    constructor(seed = DEFAULT_SEED) {
        this.seed = seed;
        this.biomeMap = new BiomeMap(seed);
        this.rng = new SeededRandom(seed);
    }

    getBiomeAt(x, y) {
        return this.biomeMap.getBiomeAt(x, y);
    }

    // Wrap coordinates to stay within world bounds
    wrapCoordinates(x, y) {
        return {
            x: ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH,
            y: ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT
        };
    }

    // Get the starting position (find meadow near center of island)
    getStartPosition() {
        // Start near center of world (which is center of island)
        const centerX = WORLD_CENTER_X;
        const centerY = WORLD_CENTER_Y;

        // Search in expanding circles for a meadow tile
        for (let radius = 0; radius < 500; radius += TILE_SIZE) {
            for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;

                const biome = this.biomeMap.getBiomeAt(x, y);
                if (biome.id === "meadow") {
                    return { x, y };
                }
            }
        }

        // Fallback to center
        return { x: centerX, y: centerY };
    }

    // Draw the world terrain (with wrapping support and optional season blending)
    // seasonBlend: 0-1 value for transitioning between seasons (0 = current, 1 = next)
    // player: optional player object for gravity distortion effect
    draw(p, camera, currentSeason, nextSeason = null, seasonBlend = 0, player = null) {
        const bounds = camera.getVisibleBounds();

        // Calculate visible tile range (extended for wrapping)
        const startTx = Math.floor(bounds.left / TILE_SIZE) - 1;
        const endTx = Math.ceil(bounds.right / TILE_SIZE) + 1;
        const startTy = Math.floor(bounds.top / TILE_SIZE) - 1;
        const endTy = Math.ceil(bounds.bottom / TILE_SIZE) + 1;

        // Calculate gravity distortion parameters based on player size
        // Localized effect near the player - terrain bends toward the ball
        let distortionStrength = 0;
        let distortionRadius = 0;
        let playerWorldX = 0;
        let playerWorldY = 0;

        if (player && player.size > 80) {
            // Distortion starts at size 80, grows steeply toward late game
            // The effect is localized - only terrain near the player warps
            // At size 80: barely visible
            // At size 150: subtle warping close to player
            // At size 300: noticeable bend effect
            // At size 500+: strong visual warping (good end-game state)
            // At size 1000+: dramatic sphere-like pull
            const sizeAbove80 = player.size - 80;
            // Strength grows with steep curve - stays subtle until mid-late game
            distortionStrength = Math.pow(sizeAbove80 / 400, 2.0) * 0.08;
            // Radius scales with player size but stays tight
            // ~1.5x player size early, grows to ~3x at large sizes
            const radiusScale = 1.5 + Math.min(1.5, sizeAbove80 / 12000);
            distortionRadius = player.size * radiusScale;

            // Get player position (handle camera wrapping)
            const wrappedPlayer = camera.getWrappedPosition(player.x, player.y);
            playerWorldX = wrappedPlayer.x;
            playerWorldY = wrappedPlayer.y;
        }

        p.noStroke();

        // Draw tiles (with wrapping and spherical gravity distortion)
        for (let ty = startTy; ty <= endTy; ty++) {
            for (let tx = startTx; tx <= endTx; tx++) {
                // Wrap tile indices
                const wrappedTx = ((tx % TILES_X) + TILES_X) % TILES_X;
                const wrappedTy = ((ty % TILES_Y) + TILES_Y) % TILES_Y;

                let worldX = tx * TILE_SIZE;
                let worldY = ty * TILE_SIZE;

                // Apply spherical gravity distortion - fisheye lens effect toward player
                if (distortionStrength > 0) {
                    const tileCenterX = worldX + TILE_SIZE / 2;
                    const tileCenterY = worldY + TILE_SIZE / 2;

                    const dx = playerWorldX - tileCenterX;
                    const dy = playerWorldY - tileCenterY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 0 && dist < distortionRadius) {
                        // Spherical distortion using fisheye-style mapping
                        // Points closer to center get pulled more dramatically
                        const normalizedDist = dist / distortionRadius;

                        // Spherical falloff - creates a dome-like warping effect
                        // sqrt(1 - x^2) gives a hemisphere profile
                        const sphereFactor = Math.sqrt(1 - normalizedDist * normalizedDist);

                        // Combine with power falloff for smooth transition at edges
                        const edgeFalloff = Math.pow(1 - normalizedDist, 1.5);
                        const pull = distortionStrength * sphereFactor * edgeFalloff * dist;

                        // Normalize direction and apply pull
                        const nx = dx / dist;
                        const ny = dy / dist;

                        worldX += nx * pull;
                        worldY += ny * pull;
                    }
                }

                const biome = this.biomeMap.biomeGrid[wrappedTy]?.[wrappedTx];
                if (!biome) continue;

                const currentColor = biome.colors[currentSeason] || biome.colors.spring;

                // Calculate final color (with optional blending to next season)
                let finalColor;
                if (nextSeason && seasonBlend > 0) {
                    const nextColor = biome.colors[nextSeason] || biome.colors.spring;
                    finalColor = [
                        currentColor[0] + (nextColor[0] - currentColor[0]) * seasonBlend,
                        currentColor[1] + (nextColor[1] - currentColor[1]) * seasonBlend,
                        currentColor[2] + (nextColor[2] - currentColor[2]) * seasonBlend,
                    ];
                } else {
                    finalColor = currentColor;
                }

                // Add subtle noise variation to break up flat areas
                const variation = ((wrappedTx * 7 + wrappedTy * 13) % 10) - 5;
                p.fill(
                    finalColor[0] + variation,
                    finalColor[1] + variation,
                    finalColor[2] + variation
                );

                p.rect(worldX, worldY, TILE_SIZE + 1, TILE_SIZE + 1);
            }
        }
    }

    // Draw mini-map centered on player with size-based scaling
    // As player grows, the visible area expands to eventually show the whole world
    // Supports season color blending just like the main terrain
    drawMiniMap(p, mapX, mapY, mapSize, player, currentSeason, nextSeason = null, seasonBlend = 0) {
        // Background (square)
        p.fill(0, 0, 0, 180);
        p.noStroke();
        p.rect(mapX, mapY, mapSize, mapSize, 3);

        // Calculate visible world area based on player size
        // At size 12 (start): show ~400 world units (small area around player)
        // At size 380 (sun): show half the world
        const minViewRadius = 200;  // Radius at smallest player size
        const maxViewRadius = Math.max(WORLD_WIDTH, WORLD_HEIGHT) / 4;  // Quarter world radius

        // Scale view radius with player size (logarithmic for smoother progression)
        const sizeRatio = Math.log(player.size / 12 + 1) / Math.log(380 / 12 + 1);
        const viewRadius = minViewRadius + (maxViewRadius - minViewRadius) * sizeRatio;
        const viewDiameter = viewRadius * 2;

        // Scale factor: map pixels per world unit
        const scale = mapSize / viewDiameter;

        // Player is always at center of minimap
        const mapCenterX = mapX + mapSize / 2;
        const mapCenterY = mapY + mapSize / 2;

        // Wrap player coordinates
        const wrappedPlayer = this.wrapCoordinates(player.x, player.y);

        // Calculate tile sampling step based on view size
        const tilesInView = viewDiameter / TILE_SIZE;
        const sampleStep = Math.max(1, Math.floor(tilesInView / mapSize) * 2);

        // Draw biome colors in the visible area
        const startWorldX = wrappedPlayer.x - viewRadius;
        const startWorldY = wrappedPlayer.y - viewRadius;
        const endWorldX = wrappedPlayer.x + viewRadius;
        const endWorldY = wrappedPlayer.y + viewRadius;

        // Calculate tile range
        const startTx = Math.floor(startWorldX / TILE_SIZE);
        const endTx = Math.ceil(endWorldX / TILE_SIZE);
        const startTy = Math.floor(startWorldY / TILE_SIZE);
        const endTy = Math.ceil(endWorldY / TILE_SIZE);

        // Clip to minimap bounds
        p.push();
        // Use manual clipping by only drawing within bounds

        for (let ty = startTy; ty <= endTy; ty += sampleStep) {
            for (let tx = startTx; tx <= endTx; tx += sampleStep) {
                // Wrap tile indices
                const wrappedTx = ((tx % TILES_X) + TILES_X) % TILES_X;
                const wrappedTy = ((ty % TILES_Y) + TILES_Y) % TILES_Y;

                const biome = this.biomeMap.biomeGrid[wrappedTy]?.[wrappedTx];
                if (!biome) continue;

                const currentColor = biome.colors[currentSeason] || biome.colors.spring;

                // Calculate final color (with optional blending to next season)
                let color;
                if (nextSeason && seasonBlend > 0) {
                    const nextColor = biome.colors[nextSeason] || biome.colors.spring;
                    color = [
                        currentColor[0] + (nextColor[0] - currentColor[0]) * seasonBlend,
                        currentColor[1] + (nextColor[1] - currentColor[1]) * seasonBlend,
                        currentColor[2] + (nextColor[2] - currentColor[2]) * seasonBlend,
                    ];
                } else {
                    color = currentColor;
                }

                // Calculate world position of this tile
                const tileWorldX = tx * TILE_SIZE;
                const tileWorldY = ty * TILE_SIZE;

                // Convert to map coordinates (relative to player center)
                const relX = tileWorldX - wrappedPlayer.x;
                const relY = tileWorldY - wrappedPlayer.y;

                // Handle wrapping for display
                let displayRelX = relX;
                let displayRelY = relY;
                if (displayRelX > WORLD_WIDTH / 2) displayRelX -= WORLD_WIDTH;
                if (displayRelX < -WORLD_WIDTH / 2) displayRelX += WORLD_WIDTH;
                if (displayRelY > WORLD_HEIGHT / 2) displayRelY -= WORLD_HEIGHT;
                if (displayRelY < -WORLD_HEIGHT / 2) displayRelY += WORLD_HEIGHT;

                const px = mapCenterX + displayRelX * scale;
                const py = mapCenterY + displayRelY * scale;
                const pw = TILE_SIZE * sampleStep * scale;
                const ph = TILE_SIZE * sampleStep * scale;

                // Only draw if within map bounds
                if (px + pw >= mapX && px <= mapX + mapSize &&
                    py + ph >= mapY && py <= mapY + mapSize) {
                    p.fill(color[0], color[1], color[2], 200);
                    p.rect(px, py, pw + 1, ph + 1);
                }
            }
        }

        // Player dot (always at center)
        p.noStroke();
        p.fill(255, 255, 100);
        p.ellipse(mapCenterX, mapCenterY, 4, 4);

        p.pop();
    }
}

// Re-export biome data for use elsewhere
export { BIOMES } from "./biomes.js";
