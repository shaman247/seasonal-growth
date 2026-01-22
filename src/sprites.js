// Sprite loading from pre-generated PNG files
// Sprites are generated at build time using scripts/generate-sprites.js

const spriteCache = new Map();

// Sprite sizes (must match generate-sprites.js)
const DEFAULT_SPRITE_SIZE = 128;
const LARGE_SPRITE_SIZE = 256;

// Sprite index (loaded at startup)
let spriteIndex = null;

// Large objects that use 256px sprites
const LARGE_EMOJIS = new Set(["🏠", "🌲", "🌳", "🪨", "🐳", "🐋", "🐙", "🦑"]);

/**
 * Load the sprite index JSON file
 * Should be called during p5 preload()
 */
export function loadSpriteIndex(p, callback) {
    p.loadJSON('/sprites/index.json', (data) => {
        spriteIndex = data;
        if (callback) callback();
    }, (err) => {
        console.warn('Failed to load sprite index, will fall back to runtime generation:', err);
        spriteIndex = null;
        if (callback) callback();
    });
}

/**
 * Check if sprite index is loaded
 */
export function isSpriteIndexLoaded() {
    return spriteIndex !== null;
}

/**
 * Load a sprite for an emoji
 * Returns a p5.Image or null if still loading
 */
export function loadSprite(p, emoji, size = DEFAULT_SPRITE_SIZE) {
    const cacheKey = `${emoji}_${size}`;

    if (spriteCache.has(cacheKey)) {
        return spriteCache.get(cacheKey);
    }

    // If no sprite index, fall back to runtime generation
    if (!spriteIndex) {
        return createEmojiSpriteFallback(p, emoji, size);
    }

    // Look up the sprite filename
    const spriteInfo = spriteIndex.sprites[emoji];
    if (!spriteInfo) {
        console.warn(`No sprite found for emoji: ${emoji}`);
        return createEmojiSpriteFallback(p, emoji, size);
    }

    // Determine which size to use
    const useLarge = size > DEFAULT_SPRITE_SIZE && spriteInfo.large;
    const filename = useLarge ? spriteInfo.large : spriteInfo.default;
    const spritePath = `/sprites/${filename}`;

    // Load the image (synchronously cache a placeholder, async load the real image)
    const img = p.loadImage(spritePath,
        () => {
            // Image loaded successfully
        },
        () => {
            console.warn(`Failed to load sprite: ${spritePath}`);
        }
    );

    spriteCache.set(cacheKey, img);
    return img;
}

/**
 * Preload all sprites for a list of emojis
 * Should be called during p5 preload() or early in setup()
 */
export function preloadSprites(p, emojis) {
    const sprites = {};
    for (const emoji of emojis) {
        const isLarge = LARGE_EMOJIS.has(emoji);
        const size = isLarge ? LARGE_SPRITE_SIZE : DEFAULT_SPRITE_SIZE;
        sprites[emoji] = loadSprite(p, emoji, size);
    }
    return sprites;
}

/**
 * Preload sprites for seasonal objects from all biomes
 */
export function preloadSeasonSprites(p, seasonObjects) {
    const sprites = {};
    for (const obj of seasonObjects) {
        const isLarge = LARGE_EMOJIS.has(obj.emoji);
        const size = isLarge ? LARGE_SPRITE_SIZE : DEFAULT_SPRITE_SIZE;
        sprites[obj.emoji] = loadSprite(p, obj.emoji, size);
    }
    return sprites;
}

/**
 * Fallback: generate sprite at runtime (used if PNG not available)
 */
function createEmojiSpriteFallback(p, emoji, size) {
    const cacheKey = `${emoji}_${size}_fallback`;
    if (spriteCache.has(cacheKey)) {
        return spriteCache.get(cacheKey);
    }

    // Create canvas for emoji at requested size
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = false;
    ctx.font = `${size * 0.85}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);

    const img = p.createImage(size, size);
    img.drawingContext.drawImage(canvas, 0, 0);

    spriteCache.set(cacheKey, img);
    return img;
}

/**
 * Legacy function for compatibility - now loads pre-generated sprites
 */
export function createEmojiSprite(p, emoji, size = DEFAULT_SPRITE_SIZE) {
    return loadSprite(p, emoji, size);
}

export function clearSpriteCache() {
    spriteCache.clear();
}

export { DEFAULT_SPRITE_SIZE, LARGE_SPRITE_SIZE };
