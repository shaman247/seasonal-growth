#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const biomes = JSON.parse(readFileSync(join(__dirname, '../src/data/biomes.json'), 'utf8'));

// Remove minSize and maxSize from each object entry in biomes
for (const [biomeId, biome] of Object.entries(biomes.biomes)) {
    for (const season of ['spring', 'summer', 'fall', 'winter']) {
        biome.objects[season] = (biome.objects[season] || []).map(obj => {
            const newObj = { id: obj.id, weight: obj.weight };
            if (obj.maxPlayerSize !== undefined) {
                newObj.maxPlayerSize = obj.maxPlayerSize;
            }
            if (obj.minPlayerSize !== undefined) {
                newObj.minPlayerSize = obj.minPlayerSize;
            }
            return newObj;
        });
    }
}

console.log(JSON.stringify(biomes, null, 2));
