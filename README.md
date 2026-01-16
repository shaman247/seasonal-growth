# Seasonal Growth

A Katamari Damacy-inspired 2D game where you roll up seasonal objects, growing ever larger. Built for the RCade arcade cabinet.

## About

Roll across a procedurally generated island through 10 seasons, collecting objects smaller than you. As you grow, you'll develop gravitational pull that sucks in nearby collectibles. Grow large enough and you'll consume the entire planet!

**Features:**
- Procedurally generated island with 9 distinct biomes
- 10 seasons of gameplay (Spring → Summer → Fall → Winter, repeated 2.5 times)
- Momentum-based physics with terrain speed modifiers
- Gravitational attraction that increases as you grow
- Special golden effects when collecting rare items
- Spherical terrain distortion at massive sizes

## About RCade

This game is built for [RCade](https://rcade.recurse.com), a custom arcade cabinet at The Recurse Center. Learn more about the project at [github.com/fcjr/RCade](https://github.com/fcjr/RCade).

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

This launches Vite on port 5173 and connects to the RCade cabinet emulator.

## Building

```bash
npm run build
```

This regenerates the game documentation and builds to `dist/`.

## Project Structure

```
├── public/           # Static assets (manual.html, etc.)
├── scripts/          # Build scripts (generate-docs.js)
├── src/
│   ├── sketch.js     # Main game loop, state management, rendering
│   ├── player.js     # Player ball with momentum physics
│   ├── gameObject.js # Collectible/obstacle class with gravity
│   ├── world.js      # World class, BiomeMap, terrain distortion
│   ├── biomes.js     # 9 biome definitions
│   ├── camera.js     # Smooth-follow camera with dynamic zoom
│   ├── noise.js      # Seeded simplex noise
│   ├── sprites.js    # Emoji sprite rendering
│   └── style.css     # Styles
├── index.html        # HTML entry
├── vite.config.js    # Vite configuration
└── package.json
```

## Adding Assets

**Imported assets** (recommended) - Place in `src/` and import them. Vite bundles these with hashed filenames for cache busting:

```js
import spriteUrl from './sprite.png';

let sprite;

p.preload = () => {
    sprite = p.loadImage(spriteUrl);
};

p.draw = () => {
    p.image(sprite, x, y);
};
```

**Static assets** - Place in `public/` for files copied as-is. Access via root path (`/sprite.png`).

## p5.js Basics

The template uses p5.js in [instance mode](https://github.com/processing/p5.js/wiki/Global-and-instance-mode):

```js
import p5 from "p5";

const sketch = (p) => {
    p.setup = () => {
        p.createCanvas(336, 262);  // RCade dimensions
    };

    p.draw = () => {
        p.background(26, 26, 46);
        p.fill(255);
        p.ellipse(p.width / 2, p.height / 2, 50, 50);
    };
};

new p5(sketch, document.getElementById("sketch"));
```

## Arcade Controls

This template uses `@rcade/plugin-input-classic` for arcade input:

```js
import { PLAYER_1, SYSTEM } from '@rcade/plugin-input-classic'

// D-pad
if (PLAYER_1.DPAD.up) { /* ... */ }
if (PLAYER_1.DPAD.down) { /* ... */ }
if (PLAYER_1.DPAD.left) { /* ... */ }
if (PLAYER_1.DPAD.right) { /* ... */ }

// Buttons
if (PLAYER_1.A) { /* ... */ }
if (PLAYER_1.B) { /* ... */ }

// System
if (SYSTEM.ONE_PLAYER) { /* Start game */ }
```

## RCade Screen Size

The RCade cabinet uses a 336x262 pixel display. The template is pre-configured with these dimensions.

## Deployment

First, create a new repository on GitHub:

1. Go to [github.com/new](https://github.com/new)
2. Create a new repository (can be public or private)
3. **Don't** initialize it with a README, .gitignore, or license

Then connect your local project and push:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

The included GitHub Actions workflow will automatically deploy to RCade.

---

Made with <3 at [The Recurse Center](https://recurse.com)
