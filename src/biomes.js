// Biome definitions and selection logic
// Data is loaded from JSON files for easy editing and documentation generation

import objectsData from "./data/objects.json";
import biomesData from "./data/biomes.json";

// Note: WORLD dimensions are now defined here to avoid circular imports
// World uses a circular island with noise-based coastline
// ~40x larger than original for extended gameplay
export const WORLD_WIDTH = 336 * 72; // 24192 - total world width (~40x original)
export const WORLD_HEIGHT = 262 * 72; // 18864 - total world height (~40x original)

// Island parameters for radial generation
export const WORLD_CENTER_X = WORLD_WIDTH / 2;
export const WORLD_CENTER_Y = WORLD_HEIGHT / 2;
export const ISLAND_RADIUS_X = WORLD_WIDTH * 0.35; // Base island radius (horizontal)
export const ISLAND_RADIUS_Y = WORLD_HEIGHT * 0.35; // Base island radius (vertical)

// Terrain speed multipliers (1.0 = normal speed)
export const TERRAIN_SPEED = {
    normal: 1.0,      // Meadow, forest, farmland, etc.
    beach: 0.75,      // Sand slows you down
    wetland: 0.7,     // Mud and water slow you down
    ocean: 0.4,       // Deep water is very slow
};

// Size at which terrain penalties are fully negated
export const TERRAIN_PENALTY_REDUCTION_SIZE = 200;

// Object definitions with spawn ranges based on player size
// minPlayerSize/maxPlayerSize control when objects appear (undefined = always)
// Objects can be collected when player is 125% of object size

// Export the objects data for use in other modules
export const OBJECTS = objectsData.objects;

// Helper function to get object name by emoji
export function getObjectName(emoji) {
    for (const obj of Object.values(OBJECTS)) {
        if (obj.emoji === emoji) {
            return obj.name;
        }
    }
    return null;
}

// Helper function to get object by ID
export function getObjectById(id) {
    return OBJECTS[id] || null;
}

// Convert JSON biome data to runtime format with emoji lookups
function buildBiomes() {
    const biomes = {};

    for (const [biomeId, biomeData] of Object.entries(biomesData.biomes)) {
        const biome = {
            id: biomeData.id,
            name: biomeData.name,
            description: biomeData.description,
            location: biomeData.location,
            colors: biomeData.colors,
            objects: {},
            objectDensity: biomeData.objectDensity,
        };

        // Copy optional properties
        if (biomeData.isOcean) biome.isOcean = true;
        if (biomeData.terrainSpeed) biome.terrainSpeed = biomeData.terrainSpeed;

        // Convert object IDs to emoji-based format for each season
        for (const season of ["spring", "summer", "fall", "winter"]) {
            const seasonObjects = biomeData.objects[season] || [];
            biome.objects[season] = seasonObjects.map(objEntry => {
                const objDef = OBJECTS[objEntry.id];
                if (!objDef) {
                    console.warn(`Unknown object ID: ${objEntry.id} in ${biomeId}/${season}`);
                    return null;
                }

                return {
                    emoji: objDef.emoji,
                    name: objDef.name,
                    minSize: objDef.minSize,
                    maxSize: objDef.maxSize,
                    weight: objEntry.weight,
                    spawnPattern: objDef.spawnPattern || "scattered",
                    ...(objEntry.minPlayerSize !== undefined && { minPlayerSize: objEntry.minPlayerSize }),
                    ...(objEntry.maxPlayerSize !== undefined && { maxPlayerSize: objEntry.maxPlayerSize }),
                };
            }).filter(obj => obj !== null);
        }

        biomes[biomeId] = biome;
    }

    return biomes;
}

// 9 biomes (8 land + ocean)
export const BIOMES = buildBiomes();

// Biome list for iteration
export const BIOME_LIST = Object.values(BIOMES);
export const BIOME_IDS = Object.keys(BIOMES);

// Zone influence map - which biomes are favored in which angular directions
// Organized by angle from center (8 sectors)
const ANGULAR_ZONE_BIOMES = {
    // North (angle ~90°)
    0: "meadow",
    // Northeast (angle ~45°)
    1: "forest",
    // East (angle ~0°)
    2: "orchard",   // Orchard zone (east)
    // Southeast (angle ~315°)
    3: "farmland",  // Farmland zone (southeast only - smaller area)
    // South (angle ~270°)
    4: "hills",
    // Southwest (angle ~225°)
    5: "beach",
    // West (angle ~180°)
    6: "wetland",
    // Northwest (angle ~135°)
    7: "orchard",   // Orchard zone (northwest)
};

// Get the normalized distance from center (0 = center, 1 = edge of island)
export function getDistanceFromCenter(x, y) {
    const dx = (x - WORLD_CENTER_X) / ISLAND_RADIUS_X;
    const dy = (y - WORLD_CENTER_Y) / ISLAND_RADIUS_Y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Get the angle from center (0-2π, where 0 is east, π/2 is north)
export function getAngleFromCenter(x, y) {
    const angle = Math.atan2(WORLD_CENTER_Y - y, x - WORLD_CENTER_X);
    return (angle + Math.PI * 2) % (Math.PI * 2);
}

// Calculate terrain type based on distance from center with noise
// Returns: "ocean", "beach", "wetland_shore", or "land"
// noiseValue should be 0-1 from simplex noise
export function getTerrainType(distFromCenter, noiseValue = 0.5) {
    // Add noise variation to the coastline (±15% of island radius)
    const coastlineVariation = (noiseValue - 0.5) * 0.3;
    const adjustedDist = distFromCenter - coastlineVariation;

    // Define terrain bands (from center outward)
    if (adjustedDist < 0.85) {
        return "land";
    } else if (adjustedDist < 0.95) {
        return "beach"; // Transition zone - beach
    } else if (adjustedDist < 1.05) {
        return "wetland_shore"; // Wetland/marsh zone near shore
    } else {
        return "ocean";
    }
}

// Check if a position is in the ocean
export function isOcean(x, y, noiseValue = 0.5) {
    const dist = getDistanceFromCenter(x, y);
    const terrain = getTerrainType(dist, noiseValue);
    return terrain === "ocean";
}

// Check if position is in beach transition zone
export function isBeach(x, y, noiseValue = 0.5) {
    const dist = getDistanceFromCenter(x, y);
    const terrain = getTerrainType(dist, noiseValue);
    return terrain === "beach";
}

// Check if position is in wetland shore zone
export function isWetlandShore(x, y, noiseValue = 0.5) {
    const dist = getDistanceFromCenter(x, y);
    const terrain = getTerrainType(dist, noiseValue);
    return terrain === "wetland_shore";
}

// Get the zone influence for a world position based on angle
export function getZoneInfluence(x, y) {
    const angle = getAngleFromCenter(x, y);
    // Convert angle to sector (0-7)
    const sector = Math.floor((angle / (Math.PI * 2)) * 8) % 8;
    return ANGULAR_ZONE_BIOMES[sector];
}

// Get zone influence strength based on distance from center
export function getZoneStrength(x, y) {
    const dist = getDistanceFromCenter(x, y);

    // Stronger zone influence near the middle ring of the island
    // Weaker at center (more meadow) and edges (more beach/wetland)
    if (dist < 0.3) {
        return 0.3; // Center is mostly meadow
    } else if (dist < 0.7) {
        return 0.8; // Middle ring has strong zone influence
    } else {
        return 0.5; // Edges blend with coastal biomes
    }
}

// Determine biome based on noise values, zone influence, and terrain type
// coastlineNoise should be passed in from the world's noise generator
// villageNoise is used to place villages as distinct clusters that attract farmland/orchard
export function selectBiome(elevation, moisture, temperature, zonePreference, zoneStrength, x, y, coastlineNoise = 0.5, villageNoise = 0.5) {
    const dist = getDistanceFromCenter(x, y);
    const terrainType = getTerrainType(dist, coastlineNoise);

    // Ocean biome for deep water
    if (terrainType === "ocean") {
        return BIOMES.ocean;
    }

    // Beach biome for coastal transition
    if (terrainType === "beach") {
        return BIOMES.beach;
    }

    // Wetland shore - mix of wetland characteristics
    if (terrainType === "wetland_shore") {
        // Sometimes beach, sometimes wetland based on moisture
        if (moisture > 0.5) {
            return BIOMES.wetland;
        }
        return BIOMES.beach;
    }

    // From here on, we're on land - use zone-based biome selection

    // === VILLAGE-CENTRIC APPROACH ===
    // Villages form at specific high-villageNoise spots (peaks in the noise)
    // Farmland and orchard form rings around villages
    const isVillageCore = villageNoise > 0.75 && dist > 0.2 && dist < 0.7;
    const isVillageRing = villageNoise > 0.55 && dist > 0.15 && dist < 0.75;

    // Village cores - the center of settlements
    if (isVillageCore && temperature > 0.4 && moisture < 0.6) {
        return BIOMES.village;
    }

    // Farmland forms around villages (inner ring)
    if (isVillageRing && villageNoise > 0.6 && moisture < 0.55) {
        return BIOMES.farmland;
    }

    // Orchard forms around farmland (outer ring) or in orchard zones
    if (isVillageRing && villageNoise > 0.55 && villageNoise <= 0.6) {
        return BIOMES.orchard;
    }

    // Farmland zone still has some farmland (but smaller area now)
    if (zonePreference === "farmland" && zoneStrength > 0.5 && temperature > 0.45 && moisture < 0.55) {
        return BIOMES.farmland;
    }

    // Beach appears at low elevation in beach zone (even inland)
    if (zonePreference === "beach" && elevation < 0.3) {
        return BIOMES.beach;
    }

    // Wetland appears in wet areas of wetland zone
    if (zonePreference === "wetland" && moisture > 0.6) {
        return BIOMES.wetland;
    }

    // Hills at high elevation
    if (elevation > 0.65) {
        return BIOMES.hills;
    }

    // Forest in forest zone or high moisture + medium elevation
    if (zonePreference === "forest" || (moisture > 0.55 && elevation > 0.4)) {
        if (zoneStrength > 0.4 || moisture > 0.6) {
            return BIOMES.forest;
        }
    }

    // Orchard in orchard zone
    if (zonePreference === "orchard" && zoneStrength > 0.5) {
        return BIOMES.orchard;
    }

    // Wetland can appear outside its zone if very wet
    if (moisture > 0.75) {
        return BIOMES.wetland;
    }

    // Default to meadow
    return BIOMES.meadow;
}

// Get terrain speed multiplier for a biome, reduced by player size
export function getTerrainSpeedMultiplier(biome, playerSize) {
    const terrainType = biome.terrainSpeed || "normal";
    const baseSpeed = TERRAIN_SPEED[terrainType] || TERRAIN_SPEED.normal;

    // Calculate size-based reduction (larger = less affected by terrain)
    // At size 12 (starting), full penalty. At TERRAIN_PENALTY_REDUCTION_SIZE, no penalty.
    const sizeRatio = Math.min(1, playerSize / TERRAIN_PENALTY_REDUCTION_SIZE);
    const penaltyReduction = sizeRatio * 0.8; // Max 80% reduction of penalty

    // Lerp from baseSpeed toward 1.0 based on size
    return baseSpeed + (1.0 - baseSpeed) * penaltyReduction;
}

// Check if an object should spawn for the current player size
export function shouldSpawnForPlayerSize(objDef, playerSize) {
    if (objDef.minPlayerSize !== undefined && playerSize < objDef.minPlayerSize) {
        return false;
    }
    if (objDef.maxPlayerSize !== undefined && playerSize > objDef.maxPlayerSize) {
        return false;
    }
    return true;
}

// Get all unique objects across all biomes and seasons for documentation
export function getAllObjects() {
    const objectMap = new Map();

    for (const biome of BIOME_LIST) {
        for (const season of ["spring", "summer", "fall", "winter"]) {
            const objs = biome.objects[season] || [];
            for (const obj of objs) {
                const key = obj.emoji;
                if (!objectMap.has(key)) {
                    objectMap.set(key, {
                        emoji: obj.emoji,
                        name: obj.name,
                        biomes: new Set(),
                        seasons: new Set(),
                        minSize: obj.minSize,
                        maxSize: obj.maxSize,
                        minPlayerSize: obj.minPlayerSize,
                        maxPlayerSize: obj.maxPlayerSize,
                    });
                }
                const entry = objectMap.get(key);
                entry.biomes.add(biome.id);
                entry.seasons.add(season);
                entry.minSize = Math.min(entry.minSize, obj.minSize);
                entry.maxSize = Math.max(entry.maxSize, obj.maxSize);
                if (obj.minPlayerSize !== undefined) {
                    entry.minPlayerSize = entry.minPlayerSize !== undefined
                        ? Math.min(entry.minPlayerSize, obj.minPlayerSize)
                        : obj.minPlayerSize;
                }
                if (obj.maxPlayerSize !== undefined) {
                    entry.maxPlayerSize = entry.maxPlayerSize !== undefined
                        ? Math.max(entry.maxPlayerSize, obj.maxPlayerSize)
                        : obj.maxPlayerSize;
                }
            }
        }
    }

    return Array.from(objectMap.values());
}
