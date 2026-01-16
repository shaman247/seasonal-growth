// Seeded simplex noise generator for deterministic world generation

// Permutation table for noise
const PERM_SIZE = 256;

export class SeededRandom {
    constructor(seed = 12345) {
        this.seed = seed;
        this.state = seed;
    }

    // Simple mulberry32 PRNG
    next() {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    reset() {
        this.state = this.seed;
    }

    // Get a random float in range [min, max)
    range(min, max) {
        return min + this.next() * (max - min);
    }

    // Get a random integer in range [min, max]
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    }
}

export class SimplexNoise {
    constructor(seed = 12345) {
        this.seed = seed;
        this.rng = new SeededRandom(seed);
        this.perm = this.generatePermutation();
        this.permMod12 = this.perm.map((v) => v % 12);

        // Gradient vectors for 2D
        this.grad2 = [
            [1, 1], [-1, 1], [1, -1], [-1, -1],
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [-1, 1], [1, -1], [-1, -1],
        ];

        // Skewing factors for 2D simplex
        this.F2 = 0.5 * (Math.sqrt(3) - 1);
        this.G2 = (3 - Math.sqrt(3)) / 6;
    }

    generatePermutation() {
        const perm = [];
        for (let i = 0; i < PERM_SIZE; i++) {
            perm[i] = i;
        }
        // Fisher-Yates shuffle with seeded random
        for (let i = PERM_SIZE - 1; i > 0; i--) {
            const j = this.rng.int(0, i);
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        // Double the permutation table for overflow handling
        return [...perm, ...perm];
    }

    dot2(g, x, y) {
        return g[0] * x + g[1] * y;
    }

    // 2D Simplex noise - returns value in range [-1, 1]
    noise2D(x, y) {
        const { perm, permMod12, grad2, F2, G2 } = this;

        // Skew input space to determine simplex cell
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);

        // Unskew back to (x, y) space
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;

        // Determine which simplex we're in
        let i1, j1;
        if (x0 > y0) {
            i1 = 1;
            j1 = 0;
        } else {
            i1 = 0;
            j1 = 1;
        }

        // Offsets for corners
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;

        // Hash coordinates of the three simplex corners
        const ii = i & 255;
        const jj = j & 255;
        const gi0 = permMod12[ii + perm[jj]];
        const gi1 = permMod12[ii + i1 + perm[jj + j1]];
        const gi2 = permMod12[ii + 1 + perm[jj + 1]];

        // Calculate contribution from three corners
        let n0, n1, n2;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) {
            n0 = 0;
        } else {
            t0 *= t0;
            n0 = t0 * t0 * this.dot2(grad2[gi0], x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) {
            n1 = 0;
        } else {
            t1 *= t1;
            n1 = t1 * t1 * this.dot2(grad2[gi1], x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) {
            n2 = 0;
        } else {
            t2 *= t2;
            n2 = t2 * t2 * this.dot2(grad2[gi2], x2, y2);
        }

        // Scale to [-1, 1]
        return 70 * (n0 + n1 + n2);
    }

    // Normalized noise in range [0, 1]
    noise2DNormalized(x, y) {
        return (this.noise2D(x, y) + 1) / 2;
    }

    // Fractal Brownian Motion - layered octaves for more natural terrain
    fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2, scale = 1) {
        let total = 0;
        let frequency = scale;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.noise2DNormalized(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / maxValue;
    }
}

// Create offset noise generators for different map layers
export function createNoiseGenerators(seed) {
    return {
        elevation: new SimplexNoise(seed),
        moisture: new SimplexNoise(seed + 1000),
        temperature: new SimplexNoise(seed + 2000),
        detail: new SimplexNoise(seed + 3000),
        coastline: new SimplexNoise(seed + 4000), // For organic island shape
    };
}
