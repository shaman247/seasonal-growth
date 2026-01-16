// Player ball with momentum-based physics

import { getTerrainSpeedMultiplier } from "./biomes.js";

const BASE_ACCELERATION = 0.35;
const BASE_FRICTION = 0.92;
const BASE_MAX_SPEED = 4.5;

export class Player {
    constructor(x, y, size = 12) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.size = size;
        this.currentBiome = null;
        this.terrainSpeedMultiplier = 1.0;
    }

    get radius() {
        return this.size / 2;
    }

    // Calculate momentum/inertia factor based on size
    // Larger = more momentum (slower to accelerate, slower to stop)
    getMomentumFactor() {
        // At size 12, factor is 1.0
        // At size 100, factor is ~1.3
        // At size 400, factor is ~1.5
        // Much gentler scaling so player stays responsive
        return 1 + Math.log10(this.size / 10) * 0.3;
    }

    update(input, worldWidth, worldHeight, world) {
        // Check current biome and calculate terrain speed multiplier
        if (world) {
            this.currentBiome = world.getBiomeAt(this.x, this.y);
            if (this.currentBiome) {
                this.terrainSpeedMultiplier = getTerrainSpeedMultiplier(this.currentBiome, this.size);
            }
        }

        // Calculate momentum factor (larger = more inertia)
        const momentum = this.getMomentumFactor();

        // Acceleration scales sublinearly with size (sqrt) for better control at large sizes
        // Momentum factor adds slight sluggishness at large sizes for feel
        const sizeSpeedScale = Math.sqrt(this.size / 12);
        const acceleration = (BASE_ACCELERATION * sizeSpeedScale / momentum) * this.terrainSpeedMultiplier;

        // Apply acceleration based on input
        if (input.up) this.vy -= acceleration;
        if (input.down) this.vy += acceleration;
        if (input.left) this.vx -= acceleration;
        if (input.right) this.vx += acceleration;

        // Friction is affected by momentum (bigger = slides more)
        let baseFriction = BASE_FRICTION;
        baseFriction = baseFriction + (1 - baseFriction) * (1 - 1 / momentum) * 0.5;

        // Additional friction in slow terrain (ocean/wetland/beach)
        if (this.terrainSpeedMultiplier < 1.0) {
            const terrainFrictionBonus = (1 - this.terrainSpeedMultiplier) * 0.1;
            baseFriction *= (1 - terrainFrictionBonus);
        }

        // Apply friction uniformly (always slows player down)
        this.vx *= baseFriction;
        this.vy *= baseFriction;

        // Max speed scales sublinearly with size (sqrt) for better control at large sizes
        const currentMaxSpeed = BASE_MAX_SPEED * sizeSpeedScale * this.terrainSpeedMultiplier;

        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > currentMaxSpeed) {
            this.vx = (this.vx / speed) * currentMaxSpeed;
            this.vy = (this.vy / speed) * currentMaxSpeed;
        }

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Wrap around world boundaries (toroidal world)
        if (this.x < 0) this.x += worldWidth;
        if (this.x >= worldWidth) this.x -= worldWidth;
        if (this.y < 0) this.y += worldHeight;
        if (this.y >= worldHeight) this.y -= worldHeight;
    }

    grow(amount) {
        this.size += amount;
    }

    bounceFrom(objX, objY, worldWidth, worldHeight) {
        // Calculate bounce direction away from object (with wrapping consideration)
        let dx = this.x - objX;
        let dy = this.y - objY;

        // Handle wrapping for bounce direction
        if (Math.abs(dx) > worldWidth / 2) {
            dx = dx > 0 ? dx - worldWidth : dx + worldWidth;
        }
        if (Math.abs(dy) > worldHeight / 2) {
            dy = dy > 0 ? dy - worldHeight : dy + worldHeight;
        }

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;

            // Knockback scales with size (sqrt) so it feels proportionate
            const sizeSpeedScale = Math.sqrt(this.size / 12);
            const knockback = 3 * sizeSpeedScale;
            this.vx = nx * knockback;
            this.vy = ny * knockback;
        }
    }

    // Check collision with wrapping
    collidesWith(obj, worldWidth, worldHeight) {
        let dx = this.x - obj.x;
        let dy = this.y - obj.y;

        // Handle wrapping for collision detection
        if (Math.abs(dx) > worldWidth / 2) {
            dx = dx > 0 ? dx - worldWidth : dx + worldWidth;
        }
        if (Math.abs(dy) > worldHeight / 2) {
            dy = dy > 0 ? dy - worldHeight : dy + worldHeight;
        }

        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < this.radius + obj.radius;
    }

    canCollect(obj) {
        // Can only collect objects smaller than ~95% of player size
        return obj.size < this.size * 0.95;
    }

    draw(p, renderX = null, renderY = null) {
        // Use provided render position or default to actual position
        const drawX = renderX !== null ? renderX : this.x;
        const drawY = renderY !== null ? renderY : this.y;


        // Draw main ball - translucent fill with opaque border
        // Dark gray border (opaque)
        p.stroke(80, 80, 80);
        p.strokeWeight(Math.max(1, this.size * 0.03));
        // Light gray fill (50% translucent)
        p.fill(50, 50, 50, 127);
        p.ellipse(drawX, drawY, this.size, this.size);
    }
}
