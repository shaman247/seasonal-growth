#!/usr/bin/env node

/**
 * Sprite Generator for Seasonal Growth
 *
 * Pre-generates emoji sprites as PNG files at build time.
 * This avoids runtime font dependencies and speeds up game startup.
 *
 * Run with: npm run generate-sprites
 */

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Font configuration
const FONT_URL = 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf';
const FONTS_DIR = join(__dirname, '../fonts');
const FONT_PATH = join(FONTS_DIR, 'NotoColorEmoji.ttf');

/**
 * Download a file from a URL (follows redirects)
 */
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const handleResponse = (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                https.get(response.headers.location, handleResponse).on('error', reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                writeFileSync(dest, Buffer.concat(chunks));
                resolve();
            });
            response.on('error', reject);
        };
        https.get(url, handleResponse).on('error', reject);
    });
}

/**
 * Ensure the Noto Color Emoji font is available
 */
async function ensureFont() {
    if (existsSync(FONT_PATH)) {
        console.log('Noto Color Emoji font found');
        return true;
    }

    console.log('Downloading Noto Color Emoji font...');
    if (!existsSync(FONTS_DIR)) {
        mkdirSync(FONTS_DIR, { recursive: true });
    }

    try {
        await downloadFile(FONT_URL, FONT_PATH);
        console.log('Font downloaded successfully');
        return true;
    } catch (err) {
        console.warn('Failed to download font:', err.message);
        console.warn('Will use system fonts instead');
        return false;
    }
}

// Register font (called after ensureFont in main)
function registerFont() {
    if (existsSync(FONT_PATH)) {
        GlobalFonts.registerFromPath(FONT_PATH, 'Noto Color Emoji');
        console.log('Registered Noto Color Emoji font');
        return true;
    }
    return false;
}

// Sprite sizes
const DEFAULT_SPRITE_SIZE = 128;
const LARGE_SPRITE_SIZE = 256;

// Large objects that need 256px sprites
const LARGE_EMOJIS = new Set(["🏠", "🌲", "🌳", "🪨", "🐳", "🐋", "🐙", "🦑"]);

// Output directory
const OUTPUT_DIR = join(__dirname, '../public/sprites');

// Load objects data
const objectsData = JSON.parse(readFileSync(join(__dirname, '../src/data/objects.json'), 'utf8'));
const OBJECTS = objectsData.objects;

/**
 * Convert emoji to a safe filename using Unicode codepoints
 */
function emojiToFilename(emoji, size) {
    const codepoints = [...emoji]
        .map(char => char.codePointAt(0).toString(16).padStart(4, '0'))
        .join('-');
    return `${codepoints}-${size}.png`;
}

/**
 * Generate a sprite PNG for an emoji
 */
function generateSprite(emoji, size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Disable smoothing for pixelated look
    ctx.imageSmoothingEnabled = false;

    // Configure text rendering - use Noto Color Emoji as primary font
    const fontSize = Math.floor(size * 0.85);
    ctx.font = `${fontSize}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw emoji centered with slight offset
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);

    return canvas.toBuffer('image/png');
}

/**
 * Collect all unique emojis from objects data
 */
function getAllEmojis() {
    const emojis = new Set();
    for (const obj of Object.values(OBJECTS)) {
        emojis.add(obj.emoji);
    }
    return emojis;
}

/**
 * Main function
 */
async function main() {
    // Ensure font is available and register it
    await ensureFont();
    registerFont();

    console.log('Generating sprites...');

    // Create output directory
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Get all unique emojis
    const emojis = getAllEmojis();
    console.log(`Found ${emojis.size} unique emojis`);

    // Generate sprite index
    const index = {
        defaultSize: DEFAULT_SPRITE_SIZE,
        largeSize: LARGE_SPRITE_SIZE,
        sprites: {}
    };

    let generated = 0;
    let skipped = 0;

    for (const emoji of emojis) {
        const isLarge = LARGE_EMOJIS.has(emoji);

        // Generate default size sprite
        const defaultFilename = emojiToFilename(emoji, DEFAULT_SPRITE_SIZE);
        const defaultPath = join(OUTPUT_DIR, defaultFilename);

        try {
            const defaultBuffer = generateSprite(emoji, DEFAULT_SPRITE_SIZE);
            writeFileSync(defaultPath, defaultBuffer);
            generated++;
        } catch (err) {
            console.warn(`Failed to generate ${emoji} at ${DEFAULT_SPRITE_SIZE}px: ${err.message}`);
            skipped++;
            continue;
        }

        // Generate large size sprite if needed
        let largeFilename = null;
        if (isLarge) {
            largeFilename = emojiToFilename(emoji, LARGE_SPRITE_SIZE);
            const largePath = join(OUTPUT_DIR, largeFilename);

            try {
                const largeBuffer = generateSprite(emoji, LARGE_SPRITE_SIZE);
                writeFileSync(largePath, largeBuffer);
                generated++;
            } catch (err) {
                console.warn(`Failed to generate ${emoji} at ${LARGE_SPRITE_SIZE}px: ${err.message}`);
            }
        }

        // Add to index
        index.sprites[emoji] = {
            default: defaultFilename,
            large: largeFilename
        };
    }

    // Write index file
    const indexPath = join(OUTPUT_DIR, 'index.json');
    writeFileSync(indexPath, JSON.stringify(index, null, 2));

    console.log(`Generated ${generated} sprites (${skipped} skipped)`);
    console.log(`Index written to ${indexPath}`);
}

main().catch(err => {
    console.error('Sprite generation failed:', err);
    process.exit(1);
});
