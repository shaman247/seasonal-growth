// Camera system with smooth follow, zoom, and seamless world wrapping

export class Camera {
    constructor(screenWidth, screenHeight, worldWidth, worldHeight) {
        this.screenWidth = screenWidth;
        this.screenHeight = screenHeight;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        // Camera position (top-left corner in world coordinates)
        this.x = 0;
        this.y = 0;

        // Zoom level (1 = normal, <1 = zoomed out, >1 = zoomed in)
        this.zoom = 1;
        this.targetZoom = 1;
        this.zoomSmoothing = 0.03;

        // Smoothing factor (0 = instant, 1 = no movement)
        this.smoothing = 0.08;
    }

    setTargetZoom(zoom) {
        // Extended zoom range for larger world/player
        this.targetZoom = Math.max(0.15, Math.min(2, zoom));
    }

    follow(target) {
        // Smoothly interpolate zoom
        this.zoom += (this.targetZoom - this.zoom) * this.zoomSmoothing;

        // Effective viewport size (larger when zoomed out)
        const effectiveWidth = this.screenWidth / this.zoom;
        const effectiveHeight = this.screenHeight / this.zoom;

        // Calculate desired camera position (centered on target)
        let targetX = target.x - effectiveWidth / 2;
        let targetY = target.y - effectiveHeight / 2;

        // Calculate delta with wrapping - find shortest path across world boundary
        let dx = targetX - this.x;
        let dy = targetY - this.y;

        // Wrap deltas to find shortest path
        if (dx > this.worldWidth / 2) dx -= this.worldWidth;
        if (dx < -this.worldWidth / 2) dx += this.worldWidth;
        if (dy > this.worldHeight / 2) dy -= this.worldHeight;
        if (dy < -this.worldHeight / 2) dy += this.worldHeight;

        // Smooth interpolation using wrapped delta
        this.x += dx * this.smoothing;
        this.y += dy * this.smoothing;
    }

    // Convert world coordinates to screen coordinates (accounting for zoom)
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.x) * this.zoom,
            y: (worldY - this.y) * this.zoom,
        };
    }

    // Convert screen coordinates to world coordinates (accounting for zoom)
    screenToWorld(screenX, screenY) {
        return {
            x: screenX / this.zoom + this.x,
            y: screenY / this.zoom + this.y,
        };
    }

    // Check if a world object is visible on screen (accounting for zoom and wrapping)
    isVisible(worldX, worldY, size) {
        const effectiveWidth = this.screenWidth / this.zoom;
        const effectiveHeight = this.screenHeight / this.zoom;
        const margin = size;

        // Check if object is visible considering wrapping
        // The object could be visible through any of the world copies
        const bounds = this.getVisibleBounds();

        // Simple visibility check for objects near the camera
        // More complex wrapping checks are handled in rendering
        let dx = worldX - (this.x + effectiveWidth / 2);
        let dy = worldY - (this.y + effectiveHeight / 2);

        // Handle wrapping for visibility
        if (dx > this.worldWidth / 2) dx -= this.worldWidth;
        if (dx < -this.worldWidth / 2) dx += this.worldWidth;
        if (dy > this.worldHeight / 2) dy -= this.worldHeight;
        if (dy < -this.worldHeight / 2) dy += this.worldHeight;

        return (
            Math.abs(dx) < effectiveWidth / 2 + margin &&
            Math.abs(dy) < effectiveHeight / 2 + margin
        );
    }

    // Apply camera transform to p5 context (includes zoom)
    applyTransform(p) {
        p.scale(this.zoom);
        p.translate(-this.x, -this.y);
    }

    // Get visible bounds in world coordinates (accounting for zoom)
    // Note: bounds may extend beyond world dimensions for seamless wrapping
    getVisibleBounds() {
        const effectiveWidth = this.screenWidth / this.zoom;
        const effectiveHeight = this.screenHeight / this.zoom;
        return {
            left: this.x,
            right: this.x + effectiveWidth,
            top: this.y,
            bottom: this.y + effectiveHeight,
        };
    }

    // Instantly center on a position (for game start/teleports)
    centerOn(x, y) {
        const effectiveWidth = this.screenWidth / this.zoom;
        const effectiveHeight = this.screenHeight / this.zoom;

        this.x = x - effectiveWidth / 2;
        this.y = y - effectiveHeight / 2;
    }

    // Get the wrapped position of an object relative to camera for rendering
    // Returns the position that should be used for drawing (closest to camera center)
    getWrappedPosition(objX, objY) {
        const effectiveWidth = this.screenWidth / this.zoom;
        const effectiveHeight = this.screenHeight / this.zoom;
        const camCenterX = this.x + effectiveWidth / 2;
        const camCenterY = this.y + effectiveHeight / 2;

        let dx = objX - camCenterX;
        let dy = objY - camCenterY;

        // Wrap to find closest position
        if (dx > this.worldWidth / 2) dx -= this.worldWidth;
        if (dx < -this.worldWidth / 2) dx += this.worldWidth;
        if (dy > this.worldHeight / 2) dy -= this.worldHeight;
        if (dy < -this.worldHeight / 2) dy += this.worldHeight;

        return {
            x: camCenterX + dx,
            y: camCenterY + dy
        };
    }
}
