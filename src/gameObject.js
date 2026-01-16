// Collectible and obstacle objects

export class GameObject {
    constructor(x, y, size, type, sprite = null) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.type = type;
        this.sprite = sprite;
        this.collected = false;
        this.isBoundary = false; // Boundary objects can never be collected

        // Velocity for gravity attraction
        this.vx = 0;
        this.vy = 0;

        // Rotation (slower for larger objects)
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.02 * (20 / Math.max(size, 20));

        // Slight bobbing animation (less for larger objects)
        this.bobOffset = Math.random() * Math.PI * 2;
        this.bobSpeed = 0.05 + Math.random() * 0.03;
        this.bobAmount = Math.max(0.5, 2 - size * 0.02);
    }

    get radius() {
        return this.size / 2;
    }

    update(worldWidth = null, worldHeight = null) {
        this.rotation += this.rotationSpeed;
        this.bobOffset += this.bobSpeed;

        // Apply velocity from gravity
        if (this.vx !== 0 || this.vy !== 0) {
            this.x += this.vx;
            this.y += this.vy;

            // Wrap coordinates if world dimensions provided
            if (worldWidth && worldHeight) {
                this.x = ((this.x % worldWidth) + worldWidth) % worldWidth;
                this.y = ((this.y % worldHeight) + worldHeight) % worldHeight;
            }

            // Apply friction to slow down
            this.vx *= 0.95;
            this.vy *= 0.95;

            // Stop very small velocities
            if (Math.abs(this.vx) < 0.01) this.vx = 0;
            if (Math.abs(this.vy) < 0.01) this.vy = 0;
        }
    }

    // Apply gravitational attraction toward a point (player position)
    // strength: base attraction strength
    // playerSize: used to scale effect (bigger player = stronger pull)
    applyGravity(targetX, targetY, strength, playerSize, worldWidth, worldHeight) {
        // Calculate wrapped distance to target
        let dx = targetX - this.x;
        let dy = targetY - this.y;

        // Handle world wrapping - find shortest path
        if (Math.abs(dx) > worldWidth / 2) {
            dx = dx > 0 ? dx - worldWidth : dx + worldWidth;
        }
        if (Math.abs(dy) > worldHeight / 2) {
            dy = dy > 0 ? dy - worldHeight : dy + worldHeight;
        }

        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return; // Avoid division by zero

        // Normalize direction
        const nx = dx / dist;
        const ny = dy / dist;

        // Gravity strength scales smoothly with player size
        // Gradual increase - noticeable early, strong late
        // At size 12: subtle pull on very close objects
        // At size 50: noticeable pull on nearby small objects
        // At size 100: moderate suction effect
        // At size 300+: strong pull that rapidly sucks in objects
        const sizeMultiplier = Math.pow(playerSize / 12, 1.8) * 0.02;

        // Objects smaller than player are attracted more strongly
        // Objects close to player size are barely affected
        const sizeRatio = this.size / playerSize;
        const attractability = Math.max(0, 1 - sizeRatio * 1.2); // 0 when obj is 83%+ of player

        // Gravity radius scales super-linearly with player size
        // Weaker early game, much stronger past size ~1200
        // At size 12: radius = ~10
        // At size 50: radius = ~54
        // At size 100: radius = ~130
        // At size 200: radius = ~310
        // At size 500: radius = ~1000
        // At size 1200: radius = ~2900
        // At size 2000: radius = ~5700
        const gravityRadius = playerSize * Math.sqrt(playerSize / 12) * 0.6;
        if (dist > gravityRadius) return;

        // Distance falloff - much steeper for faster suction when close
        const normalizedDist = dist / gravityRadius;
        const distanceFactor = Math.pow(1 - normalizedDist, 2.5);

        // Final force - objects accelerate rapidly toward player
        const force = strength * sizeMultiplier * attractability * distanceFactor;

        // Apply to velocity
        this.vx += nx * force;
        this.vy += ny * force;

        // Much higher velocity cap for rapid suction
        const maxVel = 15;
        const vel = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (vel > maxVel) {
            this.vx = (this.vx / vel) * maxVel;
            this.vy = (this.vy / vel) * maxVel;
        }
    }

    draw(p, renderX = null, renderY = null) {
        if (this.collected) return;

        // Use provided render position or default to actual position
        const drawX = renderX !== null ? renderX : this.x;
        const drawY = renderY !== null ? renderY : this.y;

        const bobY = Math.sin(this.bobOffset) * this.bobAmount;

        p.push();
        p.translate(drawX, drawY + bobY);

        // Only rotate smaller objects
        if (this.size < 40) {
            p.rotate(this.rotation);
        }

        if (this.sprite) {
            // Draw sprite centered with pixelated scaling
            p.imageMode(p.CENTER);
            p.drawingContext.imageSmoothingEnabled = false;
            p.image(this.sprite, 0, 0, this.size, this.size);
        } else {
            // Fallback: draw colored circle
            p.noStroke();
            p.fill(this.type.color || [200, 100, 100]);
            p.ellipse(0, 0, this.size, this.size);
        }

        p.pop();
    }

    // Check if visible within camera bounds
    isVisible(camera) {
        return camera.isVisible(this.x, this.y, this.size);
    }
}
