// Sprite generation from emoji - renders emoji directly without pixelation

const spriteCache = new Map();

// Higher resolution for clearer sprites
const DEFAULT_SPRITE_SIZE = 128;
const LARGE_SPRITE_SIZE = 256;

export function createEmojiSprite(p, emoji, size = DEFAULT_SPRITE_SIZE) {
    const cacheKey = `${emoji}_${size}`;
    if (spriteCache.has(cacheKey)) {
        return spriteCache.get(cacheKey);
    }

    // Create canvas for emoji at requested size (higher resolution for clarity)
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Disable smoothing for pixelated look
    ctx.imageSmoothingEnabled = false;

    // Draw emoji at full size
    ctx.font = `${size * 0.85}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);

    // Convert to p5 image
    const img = p.createImage(size, size);
    img.drawingContext.drawImage(canvas, 0, 0);

    spriteCache.set(cacheKey, img);
    return img;
}

export { DEFAULT_SPRITE_SIZE, LARGE_SPRITE_SIZE };

export function preloadSeasonSprites(p, seasonObjects) {
    const sprites = {};
    for (const obj of seasonObjects) {
        sprites[obj.emoji] = createEmojiSprite(p, obj.emoji, DEFAULT_SPRITE_SIZE);
    }
    return sprites;
}

export function clearSpriteCache() {
    spriteCache.clear();
}
