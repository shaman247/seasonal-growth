#!/usr/bin/env node

/**
 * Documentation Generator for Seasonal Growth
 *
 * This script reads the game's JSON data files and generates HTML documentation.
 * Run with: npm run generate-docs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load JSON data
const objectsData = JSON.parse(readFileSync(join(__dirname, '../src/data/objects.json'), 'utf8'));
const biomesData = JSON.parse(readFileSync(join(__dirname, '../src/data/biomes.json'), 'utf8'));

const OBJECTS = objectsData.objects;
const BIOMES = biomesData.biomes;

// Build object lookup by emoji
const objectByEmoji = {};
for (const [id, obj] of Object.entries(OBJECTS)) {
    objectByEmoji[obj.emoji] = { ...obj, id };
}

// Collect all unique objects with their properties across all biomes
function getAllObjects() {
    const objectMap = new Map();

    for (const [biomeId, biome] of Object.entries(BIOMES)) {
        for (const season of ['spring', 'summer', 'fall', 'winter']) {
            const objs = biome.objects[season] || [];
            for (const objEntry of objs) {
                const objDef = OBJECTS[objEntry.id];
                if (!objDef) continue;

                const key = objDef.emoji;
                if (!objectMap.has(key)) {
                    objectMap.set(key, {
                        id: objEntry.id,
                        emoji: objDef.emoji,
                        name: objDef.name,
                        biomes: new Set(),
                        seasons: new Set(),
                        minSize: objDef.minSize,
                        maxSize: objDef.maxSize,
                        minPlayerSize: objEntry.minPlayerSize,
                        maxPlayerSize: objEntry.maxPlayerSize,
                    });
                }
                const entry = objectMap.get(key);
                entry.biomes.add(biomeId);
                entry.seasons.add(season);
                // Sizes come from objDef (intrinsic to the object), player size constraints come from objEntry (per-biome)
                if (objEntry.minPlayerSize !== undefined) {
                    entry.minPlayerSize = entry.minPlayerSize !== undefined
                        ? Math.min(entry.minPlayerSize, objEntry.minPlayerSize)
                        : objEntry.minPlayerSize;
                }
                if (objEntry.maxPlayerSize !== undefined) {
                    entry.maxPlayerSize = entry.maxPlayerSize !== undefined
                        ? Math.max(entry.maxPlayerSize, objEntry.maxPlayerSize)
                        : objEntry.maxPlayerSize;
                }
            }
        }
    }

    return Array.from(objectMap.values()).sort((a, b) => a.minSize - b.minSize);
}

// Generate biome tag HTML
function generateBiomeTags(biomes) {
    return Array.from(biomes).map(biomeId => {
        const biome = BIOMES[biomeId];
        return `<span class="biome-tag tag-${biomeId}">${biome.name}</span>`;
    }).join('');
}

// Generate season tags HTML
function generateSeasonTags(seasons) {
    const seasonAbbrevs = {
        spring: 'Sp',
        summer: 'Su',
        fall: 'Fa',
        winter: 'Wi'
    };
    return Array.from(seasons).map(season =>
        `<span class="season-tag tag-${season}">${seasonAbbrevs[season]}</span>`
    ).join('');
}

// Generate player size cell content
function generatePlayerSizeCell(obj) {
    if (obj.minPlayerSize !== undefined && obj.maxPlayerSize !== undefined) {
        return `<span class="player-min">&ge;${obj.minPlayerSize}</span> - <span class="player-max">&le;${obj.maxPlayerSize}</span>`;
    } else if (obj.minPlayerSize !== undefined) {
        return `<span class="player-min">&ge;${obj.minPlayerSize}</span>`;
    } else if (obj.maxPlayerSize !== undefined) {
        return `<span class="player-max">&le;${obj.maxPlayerSize}</span>`;
    }
    return '<span class="player-any">any</span>';
}

// Generate object table rows
function generateObjectRows() {
    const allObjects = getAllObjects();

    return allObjects.map(obj => `
                    <tr>
                        <td class="emoji-cell">${obj.emoji}</td>
                        <td class="name-cell">${obj.name}</td>
                        <td class="size-cell">${obj.minSize}-${obj.maxSize}px</td>
                        <td class="player-size-cell">${generatePlayerSizeCell(obj)}</td>
                        <td><div class="biome-tags">${generateBiomeTags(obj.biomes)}</div></td>
                        <td><div class="season-tags">${generateSeasonTags(obj.seasons)}</div></td>
                    </tr>`).join('');
}

// Generate season objects list for a biome
function generateSeasonObjects(biome, season) {
    const objs = biome.objects[season] || [];
    if (objs.length === 0) return '<span class="object-item">None</span>';

    return objs.map(objEntry => {
        const objDef = OBJECTS[objEntry.id];
        if (!objDef) return '';
        return `<span class="object-item"><span class="object-emoji">${objDef.emoji}</span> ${objDef.name}</span>`;
    }).filter(s => s).join('\n                            ');
}

// Generate biome card HTML
function generateBiomeCard(biomeId, biome) {
    const springColor = `rgb(${biome.colors.spring.join(', ')})`;
    const summerColor = `rgb(${biome.colors.summer.join(', ')})`;
    const fallColor = `rgb(${biome.colors.fall.join(', ')})`;
    const winterColor = `rgb(${biome.colors.winter.join(', ')})`;

    // Find large objects (permanent structures)
    const largeObjects = [];
    for (const season of ['spring', 'summer', 'fall', 'winter']) {
        for (const objEntry of (biome.objects[season] || [])) {
            const objDef = OBJECTS[objEntry.id];
            if (objDef && objDef.minSize >= 80 && !largeObjects.find(o => o.emoji === objDef.emoji)) {
                largeObjects.push({ emoji: objDef.emoji, name: objDef.name, minSize: objDef.minSize });
            }
        }
    }

    const densityLabel = biome.objectDensity >= 0.5 ? 'High' : biome.objectDensity >= 0.35 ? 'Medium' : 'Low';

    const largeObjectsSection = largeObjects.length > 0 ? `
                    <div class="boundaries-section">
                        <div class="boundaries-title">Large Objects (rollable at size &ge;${Math.min(...largeObjects.map(o => Math.ceil(o.minSize * 0.8)))}+)</div>
                        ${largeObjects.map(o => `<span class="boundary-item" style="background: #e0f0e0;"><span class="object-emoji">${o.emoji}</span> ${o.name}</span>`).join('\n                        ')}
                    </div>` : '';

    return `
            <!-- ${biome.name} -->
            <article class="biome-card">
                <div class="biome-header" style="background: linear-gradient(135deg, ${springColor}, ${summerColor});">
                    <h3>${biome.name}</h3>
                    <p>${biome.description}</p>
                    <span class="location-badge">${biome.location}</span>
                </div>
                <div class="terrain-colors">
                    <div class="terrain-color" style="background: ${springColor};" title="Spring"></div>
                    <div class="terrain-color" style="background: ${summerColor};" title="Summer"></div>
                    <div class="terrain-color" style="background: ${fallColor};" title="Fall"></div>
                    <div class="terrain-color" style="background: ${winterColor};" title="Winter"></div>
                </div>
                <div class="biome-content">
                    <div class="season-section">
                        <div class="season-title season-spring">Spring</div>
                        <div class="objects-list">
                            ${generateSeasonObjects(biome, 'spring')}
                        </div>
                    </div>
                    <div class="season-section">
                        <div class="season-title season-summer">Summer</div>
                        <div class="objects-list">
                            ${generateSeasonObjects(biome, 'summer')}
                        </div>
                    </div>
                    <div class="season-section">
                        <div class="season-title season-fall">Fall</div>
                        <div class="objects-list">
                            ${generateSeasonObjects(biome, 'fall')}
                        </div>
                    </div>
                    <div class="season-section">
                        <div class="season-title season-winter">Winter</div>
                        <div class="objects-list">
                            ${generateSeasonObjects(biome, 'winter')}
                        </div>
                    </div>${largeObjectsSection}
                    <div class="biome-stats">
                        <span>Density: ${densityLabel}</span>
                    </div>
                </div>
            </article>`;
}

// Generate all biome cards (excluding ocean for the main grid)
function generateBiomeCards() {
    const landBiomes = ['meadow', 'forest', 'wetland', 'beach', 'farmland', 'village', 'orchard', 'hills'];
    return landBiomes.map(biomeId => generateBiomeCard(biomeId, BIOMES[biomeId])).join('\n');
}

// Generate the full HTML document
function generateHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seasonal Growth - Game Manual</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #2d5a27 0%, #1a3a15 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        header {
            text-align: center;
            margin-bottom: 40px;
            color: white;
        }

        header h1 {
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            margin-bottom: 10px;
        }

        header p {
            font-size: 1.1em;
            opacity: 0.9;
            max-width: 600px;
            margin: 0 auto;
        }

        .world-map {
            background: rgba(255,255,255,0.95);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 40px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .world-map h2 {
            text-align: center;
            margin-bottom: 15px;
            color: #2d5a27;
        }

        .map-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4px;
            max-width: 400px;
            margin: 0 auto;
            border: 3px solid #333;
            border-radius: 8px;
            overflow: hidden;
        }

        .map-cell {
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 0.85em;
            color: white;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
            padding: 8px;
            text-align: center;
        }

        .map-legend {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 15px;
            font-size: 0.9em;
        }

        .biomes-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
        }

        .biome-card {
            background: rgba(255,255,255,0.95);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .biome-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        }

        .biome-header {
            padding: 15px 20px;
            color: white;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
        }

        .biome-header h3 {
            font-size: 1.4em;
            margin-bottom: 5px;
        }

        .biome-header p {
            font-size: 0.9em;
            opacity: 0.95;
        }

        .terrain-colors {
            display: flex;
            height: 8px;
        }

        .terrain-color {
            flex: 1;
        }

        .biome-content {
            padding: 20px;
        }

        .season-section {
            margin-bottom: 15px;
        }

        .season-section:last-child {
            margin-bottom: 0;
        }

        .season-title {
            font-weight: bold;
            font-size: 0.95em;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .season-spring { color: #4a9c4a; }
        .season-summer { color: #d4a520; }
        .season-fall { color: #c65d3d; }
        .season-winter { color: #5a8fbd; }

        .objects-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .object-item {
            display: flex;
            align-items: center;
            gap: 4px;
            background: #f0f0f0;
            padding: 4px 10px;
            border-radius: 15px;
            font-size: 0.85em;
        }

        .object-emoji {
            font-size: 1.2em;
        }

        .boundaries-section {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #e0e0e0;
        }

        .boundaries-title {
            font-weight: bold;
            font-size: 0.9em;
            color: #666;
            margin-bottom: 8px;
        }

        .boundary-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: #ffe0e0;
            padding: 4px 10px;
            border-radius: 15px;
            font-size: 0.85em;
            margin-right: 8px;
        }

        .location-badge {
            display: inline-block;
            background: rgba(0,0,0,0.1);
            padding: 3px 10px;
            border-radius: 10px;
            font-size: 0.8em;
            margin-top: 8px;
        }

        .biome-stats {
            display: flex;
            gap: 15px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #e0e0e0;
            font-size: 0.85em;
            color: #666;
        }

        /* Object Reference Section */
        .objects-reference {
            background: rgba(255,255,255,0.95);
            border-radius: 12px;
            padding: 25px;
            margin-top: 40px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .objects-reference h2 {
            text-align: center;
            margin-bottom: 10px;
            color: #2d5a27;
        }

        .objects-reference > p {
            text-align: center;
            color: #666;
            margin-bottom: 20px;
            font-size: 0.95em;
        }

        .objects-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85em;
        }

        .objects-table th {
            background: #2d5a27;
            color: white;
            padding: 10px 8px;
            text-align: left;
            position: sticky;
            top: 0;
        }

        .objects-table td {
            padding: 8px;
            border-bottom: 1px solid #e0e0e0;
            vertical-align: middle;
        }

        .objects-table tr:hover {
            background: #f5f5f5;
        }

        .objects-table .emoji-cell {
            font-size: 1.4em;
            text-align: center;
            width: 40px;
        }

        .objects-table .name-cell {
            font-weight: 500;
        }

        .objects-table .size-cell {
            font-family: monospace;
            color: #555;
        }

        .objects-table .player-size-cell {
            font-family: monospace;
            font-size: 0.9em;
        }

        .objects-table .biome-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
        }

        .objects-table .biome-tag {
            padding: 2px 6px;
            border-radius: 8px;
            font-size: 0.8em;
            color: white;
        }

        .objects-table .season-tags {
            display: flex;
            gap: 4px;
        }

        .objects-table .season-tag {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7em;
            color: white;
            font-weight: bold;
        }

        .tag-ocean { background: rgb(55, 115, 160); }
        .tag-meadow { background: rgb(145, 190, 125); }
        .tag-forest { background: rgb(75, 115, 75); }
        .tag-wetland { background: rgb(110, 155, 150); }
        .tag-beach { background: rgb(210, 195, 155); color: #333 !important; }
        .tag-farmland { background: rgb(155, 160, 115); }
        .tag-village { background: rgb(175, 165, 145); color: #333 !important; }
        .tag-orchard { background: rgb(135, 165, 115); }
        .tag-hills { background: rgb(150, 160, 135); }

        .tag-spring { background: #4a9c4a; }
        .tag-summer { background: #d4a520; }
        .tag-fall { background: #c65d3d; }
        .tag-winter { background: #5a8fbd; }

        .player-range {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .player-min { color: #4a9c4a; }
        .player-max { color: #c65d3d; }
        .player-any { color: #888; font-style: italic; }

        .table-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #e0e0e0;
            font-size: 0.85em;
            color: #666;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        footer {
            text-align: center;
            margin-top: 40px;
            color: rgba(255,255,255,0.7);
            font-size: 0.9em;
        }

        footer a {
            color: rgba(255,255,255,0.9);
        }

        /* Info sections */
        .info-section {
            background: rgba(255,255,255,0.95);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 30px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .info-section h2 {
            color: #2d5a27;
            margin-bottom: 15px;
            text-align: center;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
        }

        .info-box {
            background: #f8f8f8;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #2d5a27;
        }

        .info-box h3 {
            color: #2d5a27;
            margin-bottom: 10px;
            font-size: 1.1em;
        }

        .info-box p {
            font-size: 0.95em;
            line-height: 1.5;
            color: #555;
        }

        .info-box ul {
            margin-left: 20px;
            font-size: 0.95em;
            color: #555;
        }

        .info-box li {
            margin-bottom: 5px;
        }

        .controls-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }

        .controls-table td {
            padding: 8px;
            border-bottom: 1px solid #e0e0e0;
        }

        .controls-table td:first-child {
            font-weight: bold;
            width: 100px;
            color: #2d5a27;
        }

        .progression-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9em;
        }

        .progression-table th {
            background: #2d5a27;
            color: white;
            padding: 8px;
            text-align: left;
        }

        .progression-table td {
            padding: 8px;
            border-bottom: 1px solid #e0e0e0;
        }

        .toc {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 30px;
        }

        .toc a {
            background: rgba(255,255,255,0.9);
            padding: 8px 16px;
            border-radius: 20px;
            text-decoration: none;
            color: #2d5a27;
            font-weight: 500;
            transition: all 0.2s;
        }

        .toc a:hover {
            background: white;
            transform: translateY(-2px);
        }

        .generated-note {
            text-align: center;
            font-size: 0.8em;
            color: rgba(255,255,255,0.5);
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Seasonal Growth</h1>
            <p>A Katamari-inspired rolling adventure through 10 seasons. Grow from a tiny ball to planetary scale and roll up the Sun!</p>
        </header>

        <nav class="toc">
            <a href="#how-to-play">How to Play</a>
            <a href="#controls">Controls</a>
            <a href="#progression">Progression</a>
            <a href="#world-map">World Map</a>
            <a href="#biomes">Biomes</a>
            <a href="#objects">Objects</a>
        </nav>

        <!-- How to Play Section -->
        <section class="info-section" id="how-to-play">
            <h2>How to Play</h2>
            <div class="info-grid">
                <div class="info-box">
                    <h3>Goal</h3>
                    <p>Roll up objects smaller than you to grow larger. As you grow, you can collect bigger objects. Your ultimate goal is to grow large enough to exit the planet and roll up THE SUN!</p>
                </div>
                <div class="info-box">
                    <h3>Collection Rule</h3>
                    <p>You can only collect objects that are <strong>smaller than 80%</strong> of your size. Larger objects will bounce you away! The bigger you get, the more objects become available to collect.</p>
                </div>
                <div class="info-box">
                    <h3>World</h3>
                    <p>The game takes place on a procedurally generated island with 8 unique biomes, surrounded by ocean. The world wraps around seamlessly - roll off one edge and you'll appear on the other side!</p>
                </div>
                <div class="info-box">
                    <h3>Seasons</h3>
                    <p>The game progresses through 10 seasons (30 seconds each): Spring, Summer, Fall, Winter - repeated across 2.5 years. Each season brings different objects to collect!</p>
                </div>
            </div>
        </section>

        <!-- Controls Section -->
        <section class="info-section" id="controls">
            <h2>Controls</h2>
            <div class="info-grid">
                <div class="info-box">
                    <h3>Movement</h3>
                    <table class="controls-table">
                        <tr><td>Up</td><td>Roll forward</td></tr>
                        <tr><td>Down</td><td>Roll backward</td></tr>
                        <tr><td>Left</td><td>Roll left</td></tr>
                        <tr><td>Right</td><td>Roll right</td></tr>
                        <tr><td>1P START</td><td>Start game / Restart</td></tr>
                    </table>
                </div>
                <div class="info-box">
                    <h3>Physics</h3>
                    <p>Your ball has momentum-based physics:</p>
                    <ul>
                        <li><strong>Bigger = more inertia</strong> - harder to turn but slides more</li>
                        <li><strong>Terrain affects speed</strong> - sand/water slows you down</li>
                        <li><strong>Speed increases with size</strong> - but so does momentum</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- Progression Section -->
        <section class="info-section" id="progression">
            <h2>Progression</h2>
            <div class="info-grid">
                <div class="info-box">
                    <h3>Growth Milestones</h3>
                    <table class="progression-table">
                        <tr><th>Size</th><th>What You Can Do</th></tr>
                        <tr><td>12px</td><td>Starting size - collect tiny insects and flowers</td></tr>
                        <tr><td>30-50px</td><td>Collect fruits, small animals</td></tr>
                        <tr><td>70-100px</td><td>Roll up trees, boulders</td></tr>
                        <tr><td>100-150px</td><td>Roll up houses, large structures</td></tr>
                        <tr><td>200-300px</td><td>Roll up whales in the ocean</td></tr>
                        <tr><td>380px+</td><td>Large enough to roll up THE SUN</td></tr>
                    </table>
                </div>
                <div class="info-box">
                    <h3>Season Progression</h3>
                    <p>The game progresses through 10 seasons over ~5 minutes:</p>
                    <ul>
                        <li>Year 1: Spring, Summer, Fall, Winter</li>
                        <li>Year 2: Spring, Summer, Fall, Winter</li>
                        <li>Year 3: Spring, <strong>Summer (Final!)</strong></li>
                    </ul>
                    <p>THE SUN appears in the final Summer!</p>
                </div>
            </div>
        </section>

        <section class="world-map" id="world-map">
            <h2>World Map</h2>
            <div class="map-grid">
                <div class="map-cell" style="background: rgb(${BIOMES.wetland.colors.summer.join(', ')});">Wetland</div>
                <div class="map-cell" style="background: rgb(${BIOMES.meadow.colors.summer.join(', ')});">Meadow</div>
                <div class="map-cell" style="background: rgb(${BIOMES.forest.colors.summer.join(', ')});">Forest</div>
                <div class="map-cell" style="background: rgb(${BIOMES.wetland.colors.summer.join(', ')});">Wetland</div>
                <div class="map-cell" style="background: rgb(${BIOMES.meadow.colors.summer.join(', ')}); border: 3px solid gold;">Meadow (Start)</div>
                <div class="map-cell" style="background: rgb(${BIOMES.orchard.colors.summer.join(', ')});">Orchard</div>
                <div class="map-cell" style="background: rgb(${BIOMES.beach.colors.summer.join(', ')});">Beach</div>
                <div class="map-cell" style="background: rgb(${BIOMES.hills.colors.summer.join(', ')});">Hills</div>
                <div class="map-cell" style="background: rgb(${BIOMES.farmland.colors.summer.join(', ')});">Farmland / Village</div>
            </div>
            <p class="map-legend">Each zone influences which biomes appear, but boundaries blend organically based on terrain!</p>
        </section>

        <div class="biomes-grid" id="biomes">
${generateBiomeCards()}
        </div>

        <!-- Complete Objects Reference -->
        <section class="objects-reference" id="objects">
            <h2>Complete Object Reference</h2>
            <p>All ${getAllObjects().length} collectible objects with their spawn sizes, biomes, seasons, and player size requirements. Objects can be collected when player is at least 125% of the object's size.</p>

            <table class="objects-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>Object</th>
                        <th>Size Range</th>
                        <th>Player Size</th>
                        <th>Biomes</th>
                        <th>Seasons</th>
                    </tr>
                </thead>
                <tbody>
${generateObjectRows()}
                </tbody>
            </table>

            <div class="table-legend">
                <div class="legend-item"><span class="player-min">&ge;N</span> = Appears when player reaches size N</div>
                <div class="legend-item"><span class="player-max">&le;N</span> = Disappears when player exceeds size N</div>
                <div class="legend-item"><span class="player-any">any</span> = Always available</div>
                <div class="legend-item">Objects can be collected when player is &ge;125% of object size</div>
            </div>
        </section>

        <footer>
            <p>Seasonal Growth - A rolling adventure through the seasons</p>
            <p><a href="/">Back to Game</a></p>
            <p class="generated-note">Documentation auto-generated from game data on ${new Date().toLocaleDateString()}</p>
        </footer>
    </div>
</body>
</html>`;
}

// Main execution
console.log('Generating documentation from JSON data...');
const html = generateHTML();
const outputPath = join(__dirname, '../public/manual.html');
writeFileSync(outputPath, html, 'utf8');
console.log(`Documentation written to: ${outputPath}`);
console.log(`Total objects: ${getAllObjects().length}`);
console.log(`Total biomes: ${Object.keys(BIOMES).length}`);
