#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const objects = JSON.parse(readFileSync(join(__dirname, '../src/data/objects.json'), 'utf8'));
const biomes = JSON.parse(readFileSync(join(__dirname, '../src/data/biomes.json'), 'utf8'));

// Collect all size ranges for each object ID
const sizeRanges = {};

for (const [biomeId, biome] of Object.entries(biomes.biomes)) {
    for (const season of ['spring', 'summer', 'fall', 'winter']) {
        for (const obj of (biome.objects[season] || [])) {
            if (!sizeRanges[obj.id]) {
                sizeRanges[obj.id] = { minSizes: [], maxSizes: [] };
            }
            sizeRanges[obj.id].minSizes.push(obj.minSize);
            sizeRanges[obj.id].maxSizes.push(obj.maxSize);
        }
    }
}

// Calculate canonical size range for each object
const newObjects = { objects: {} };
for (const [id, obj] of Object.entries(objects.objects)) {
    const ranges = sizeRanges[id];
    if (ranges) {
        newObjects.objects[id] = {
            emoji: obj.emoji,
            name: obj.name,
            minSize: Math.min(...ranges.minSizes),
            maxSize: Math.max(...ranges.maxSizes)
        };
    } else {
        // Object not used in any biome yet (like "sun")
        newObjects.objects[id] = {
            emoji: obj.emoji,
            name: obj.name,
            minSize: 380,  // Default for sun
            maxSize: 380
        };
    }
}

console.log(JSON.stringify(newObjects, null, 2));
