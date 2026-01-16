# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/claude-code) when working with code in this repository.

## Project Overview

**Seasonal Growth** is a 2D video game inspired by Katamari Damacy. The player controls a ball that rolls up seasonal objects, growing larger with each pickup. The game takes place on a procedurally generated island surrounded by ocean, with wraparound toroidal topology. The game progresses through 10 seasons (Spring → Summer → Fall → Winter, repeated 2.5 times). Grow large enough and you'll consume the entire planet.

## Tech Stack

- **Game Engine**: p5.js (instance mode)
- **Build Tool**: Vite
- **Target Platform**: RCade arcade cabinet (336x262 pixel display)
- **Input**: `@rcade/plugin-input-classic` for arcade controls

## Common Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 5173)
npm run build        # Build to dist/
```

## Project Structure

```
├── public/           # Static assets (copied as-is)
├── src/
│   ├── sketch.js     # Main game loop, state management, rendering
│   ├── player.js     # Player ball class with momentum physics
│   ├── gameObject.js # Collectible/obstacle class
│   ├── world.js      # World class, BiomeMap, tile-based rendering
│   ├── biomes.js     # 9 biome definitions (8 land + ocean), terrain speed
│   ├── noise.js      # Seeded simplex noise for procedural generation
│   ├── camera.js     # Smooth-follow camera system
│   ├── sprites.js    # Emoji sprite rendering (pixelated scaling)
│   └── style.css     # Styles
├── index.html        # HTML entry point
├── vite.config.js    # Vite configuration
└── package.json
```

## Architecture Notes

### p5.js Instance Mode

All p5 functions are accessed through the `p` parameter rather than globally:

```js
const sketch = (p) => {
    p.setup = () => { /* ... */ };
    p.draw = () => { /* ... */ };
};
```

### Arcade Controls

```js
import { PLAYER_1, SYSTEM } from '@rcade/plugin-input-classic'

// D-pad: PLAYER_1.DPAD.up/down/left/right
// Buttons: PLAYER_1.A, PLAYER_1.B
// System: SYSTEM.ONE_PLAYER (start button)
```

### Asset Handling

- **Sprites**: Generated at runtime from emoji at 128px (256px for large objects like houses, whales)
- **Static assets**: Place in `public/`, access via root path (`/filename.png`)

## World System

### Dimensions

- **Total world size**: 24192 x 18864 pixels (~40x original, wraps seamlessly)
- **Island shape**: Elliptical landmass in center, surrounded by ocean
- **Island radius**: ~35% of world size (~8467 x 6602 pixels approximate)
- **Screen size**: 336 x 262 pixels
- **Tile size**: 32 x 32 pixels (larger tiles for better performance)
- **Camera**: Smooth follow with dynamic zoom (player always 20% of screen height)

### World Topology

The world wraps around seamlessly in both directions (toroidal). The camera follows the player without clamping to edges, and objects/terrain render at their wrapped positions for smooth transitions. The island is generated using distance from center combined with noise for organic coastlines.

### Procedural Biome Generation

The world uses **seeded simplex noise** for deterministic, organic biome placement. The same seed always produces the same world layout.

**Noise layers:**
- `elevation` - Height variation (hills at high values)
- `moisture` - Wetness (wetlands at high values)
- `temperature` - Warmth (affects farmland/village)
- `coastline` - Creates organic island shape with irregular shoreline

**Radial zone system:**
Biomes are organized by angle from the island center (8 sectors):
- North: Meadow (player start)
- Northeast: Forest
- East: Orchard
- Southeast: Farmland/Village
- South: Hills
- Southwest: Beach
- West/Northwest: Wetland

**Coastal transitions:**
- Distance 0-85% from center: Normal land biomes
- Distance 85-95%: Beach transition zone
- Distance 95-105%: Wetland/marsh shore
- Distance 105%+: Ocean

### 9 Biomes

| Biome | Location | Speed | Features |
|-------|----------|-------|----------|
| **Ocean** | Surrounds island | 40% | Fish, squid, whales |
| **Beach** | Coastal ring | 75% | Shells, crabs, sand |
| **Wetland** | West + shores | 70% | Ponds, frogs, waterfowl |
| **Meadow** | Center/North | 100% | Flowers, insects (start area) |
| **Forest** | Northeast | 100% | Trees (100-220px), mushrooms |
| **Farmland** | Southeast | 100% | Crops, farmhouses (150-280px) |
| **Village** | Within Farmland | 100% | Houses (140-260px), decor |
| **Orchard** | East | 100% | Fruit trees (100-180px) |
| **Hills** | South | 100% | Boulders (100-200px) |

Speed penalties are reduced as player grows (80% reduction at size 200).

See `public/manual.html` for detailed game manual including biome documentation and all seasonal objects.

### Noise System (noise.js)

**SeededRandom**: Deterministic PRNG (mulberry32 algorithm)
```js
const rng = new SeededRandom(42);
rng.next();        // 0-1 float
rng.range(10, 20); // float in range
rng.int(1, 6);     // integer in range (inclusive)
```

**SimplexNoise**: 2D simplex noise generator
```js
const noise = new SimplexNoise(seed);
noise.noise2D(x, y);           // -1 to 1
noise.noise2DNormalized(x, y); // 0 to 1
noise.fbm(x, y, octaves, persistence, lacunarity, scale); // Fractal Brownian Motion
```

## Game Design

### Game States

- `TITLE` - Start screen, waiting for 1P START
- `PLAYING` - Main gameplay loop (season transitions are seamless)
- `PLANET_CONSUMED` - Victory screen after growing to size 2500+

### Core Mechanics

- **Movement**: Momentum-based physics with gentle size-dependent inertia
- **Terrain Speed**: Beach/wetland slow you down, ocean is very slow (reduced by size)
- **Collection**: Objects smaller than 80% of player size can be collected
- **Growth**: Proportional to object size relative to player
- **Bounce**: Colliding with larger objects causes knockback + screen shake
- **All Objects Rollable**: Trees, rocks, houses spawn from start as obstacles
- **World Wrapping**: Player and camera wrap around world edges seamlessly
- **Camera Zoom**: Player is always 20% of screen height (zoom range: 0.05 to 1.5)
- **Pickup Notifications**: Brief popup showing collected object name and count
- **Distance Culling**: Objects far from player despawn and respawn nearby for efficiency (max 500 objects)

### Physics Constants (player.js)

```js
BASE_ACCELERATION = 0.35  // D-pad input strength (divided by momentum factor)
BASE_FRICTION = 0.92      // Velocity decay per frame
BASE_MAX_SPEED = 4.5      // Maximum velocity

// Momentum factor: gentler scaling so player stays responsive
// At size 12: factor = 1.0, at size 400: factor = ~1.5
getMomentumFactor() = 1 + Math.log10(size / 10) * 0.3

// Terrain speed multipliers (from biomes.js)
TERRAIN_SPEED.normal = 1.0   // Most biomes
TERRAIN_SPEED.beach = 0.75   // Sand slows you
TERRAIN_SPEED.wetland = 0.7  // Mud/water slows you
TERRAIN_SPEED.ocean = 0.4    // Deep water is very slow

// Terrain penalties reduce by 80% at size 200
```

### Season Progression (10 seasons)

The game spans 10 seasons over ~5 minutes total (30 seconds per season):
- Spring 1 → Summer 1 → Fall 1 → Winter 1
- Spring 2 → Summer 2 → Fall 2 → Winter 2
- Spring 3 → Summer 3

**Season color transitions:**
- Last 10 seconds: Current season colors linearly fade toward next season
- This creates smooth visual transitions without interrupting gameplay

**Object respawning:**
- On season change, only off-screen objects are replaced
- On-screen objects remain for gameplay continuity
- New seasonal objects spawn in unexplored areas

**Win condition:** Grow to size 2500+ to consume the planet

### Gravity System

As the player grows, they develop gravitational pull that attracts nearby collectible objects:

**Object Attraction (gameObject.js):**
- Gravity radius stays small until late game (starts affecting at size ~50+)
- Radius uses sigmoid-like curve: `baseRadius + lateGameBonus`
- `lateGameBonus` activates after size 150, scales exponentially
- Objects smaller than 83% of player size are attracted
- Fast suction: `sizeMultiplier = pow(playerSize/12, 2.2) * 0.02`
- Steep distance falloff: `pow(1 - normalizedDist, 2.5)`
- High velocity cap (15) for rapid suction effect

**Terrain Distortion (world.js):**
- Spherical fisheye lens effect toward player
- Activates at size 100+, stays subtle until very large sizes
- Uses hemisphere profile: `sqrt(1 - normalizedDist^2)`
- Combined with edge falloff for smooth transitions
- At size 2500: whole screen warps dramatically toward player

### Rare Item Effects

Items with spawn weight ≤ 0.05 are considered rare and trigger special feedback:

**Visual Effects:**
- Golden particle burst with multiple rings (inner fast, outer slow)
- Sparkle animation on particles (pulsing size + bright core)
- Golden glowing notification with pulsing border
- Small celebratory screen shake

**UI Notifications:**
- Golden background with animated border glow
- Longer display time (2.5s vs 1.5s for normal items)
- Bright yellow text color

Starting size: 12px

### Seasonal Objects

Objects are defined per-biome in `BIOMES` (biomes.js). Each object entry has:
- `emoji`: Source character for sprite generation
- `minSize`/`maxSize`: Random size range when spawned
- `weight`: Spawn probability (higher = more common)
- `maxPlayerSize`: Optional - object stops spawning when player exceeds this size
- `spawnPattern`: "clustered", "scattered", or "grid" (per-object, e.g., crops use "grid" while animals use "scattered")

Biome properties:
- `objects`: Seasonal collectible objects (per season)
- `objectDensity`: Relative spawn density (0.3 = sparse ocean, 1.1 = dense farmland)
- `isOcean`: Boolean flag for ocean biome
- `terrainSpeed`: Speed modifier type ("normal", "beach", "wetland", "ocean")

### Object Size Ranges

Objects span a wide range of sizes to create obstacles and goals:
- **Tiny** (3-12px): Insects, drops, seeds
- **Small** (10-30px): Flowers, fruit, small animals
- **Medium** (25-70px): Pumpkins, snowmen, beach balls
- **Large** (100-220px): Trees, boulders
- **Huge** (140-280px): Houses, farmhouses
- **Giant** (200-350px): Whales (ocean)

## UI Elements

- **Season badge**: Top-left, shows current season name with progress bar and sliding emoji
- **Biome indicator**: Below season badge, shows current biome name
- **Size display**: Top-right, shows current size (simplified)
- **Mini-map**: Bottom-left, player-centered square that scales with player size
- **Pickup notifications**: Bottom-right, shows recently collected objects

## RCade Platform Constraints

- Screen size: 336x262 pixels
- Limited to D-pad + 2 buttons (A, B) per player
- Designed for quick arcade play sessions (~5 minutes)

## Player Appearance

The player is a light gray ball (200, 200, 200) with a thin dark gray border (80, 80, 80) and a white highlight. The border thickness scales with player size (size * 0.03, minimum 1px).
