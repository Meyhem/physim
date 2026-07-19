import { MaterialType } from './Materials.ts';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.ts';

// Seeded random number generator
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  public next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
}

// Deterministic 2D Value Noise
export class Noise2D {
  private grid: Float32Array;
  private size: number = 256;
  private mask: number = 255;

  constructor(seed: number) {
    const rnd = new SeededRandom(seed);
    this.grid = new Float32Array(this.size * this.size);
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = rnd.next();
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  public noise(x: number, y: number): number {
    const X = Math.floor(x) & this.mask;
    const Y = Math.floor(y) & this.mask;
    
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    
    const u = this.fade(xf);
    const v = this.fade(yf);
    
    const n00 = this.grid[X + Y * this.size];
    const n10 = this.grid[((X + 1) & this.mask) + Y * this.size];
    const n01 = this.grid[X + (((Y + 1) & this.mask) * this.size)];
    const n11 = this.grid[((X + 1) & this.mask) + (((Y + 1) & this.mask) * this.size)];
    
    const x1 = this.lerp(u, n00, n10);
    const x2 = this.lerp(u, n01, n11);
    
    return this.lerp(v, x1, x2);
  }
}

export interface TerrainBlock {
  id: string;
  materialType: MaterialType;
  points: { x: number; y: number }[];
}

export class TerrainGenerator {
  private noiseGen: Noise2D;
  private colWidth: number = 400; // 4 meters per column

  constructor(seed: number = 42) {
    this.noiseGen = new Noise2D(seed);
  }

  /**
   * Generates all terrain blocks for the world.
   */
  public generateWorld(): TerrainBlock[] {
    const blocks: TerrainBlock[] = [];
    const numCols = Math.ceil(WORLD_WIDTH / this.colWidth);
    
    const baseSurfaceY = 3000; // Surface starts around 30m depth
    const maxAmplitude = 600;  // Up to 6m surface variation

    for (let col = 0; col < numCols; col++) {
      const xStart = col * this.colWidth;
      const xEnd = Math.min(WORLD_WIDTH, (col + 1) * this.colWidth);

      // 1. Calculate surface heights using noise
      const yLeft = baseSurfaceY + this.noiseGen.noise(xStart * 0.001, 0) * maxAmplitude;
      const yRight = baseSurfaceY + this.noiseGen.noise(xEnd * 0.001, 0) * maxAmplitude;

      // 2. Dirt Layer (0m - 5m depth)
      const dirtDepth = 500; // 5 meters
      const dirtPoints = [
        { x: xStart, y: yLeft },
        { x: xEnd, y: yRight },
        { x: xEnd, y: yRight + dirtDepth },
        { x: xStart, y: yLeft + dirtDepth }
      ];
      blocks.push({
        id: `dirt_${col}`,
        materialType: MaterialType.DIRT,
        points: dirtPoints
      });

      // 3. Sandstone Layer (5m - 15m depth)
      const sandstoneStartLeft = yLeft + dirtDepth;
      const sandstoneStartRight = yRight + dirtDepth;
      const sandstoneDepth = 1000; // 10 meters
      const sandstonePoints = [
        { x: xStart, y: sandstoneStartLeft },
        { x: xEnd, y: sandstoneStartRight },
        { x: xEnd, y: sandstoneStartRight + sandstoneDepth },
        { x: xStart, y: sandstoneStartLeft + sandstoneDepth }
      ];
      blocks.push({
        id: `sandstone_${col}`,
        materialType: MaterialType.SANDSTONE,
        points: sandstonePoints
      });

      // 4. Granite and Ore layers (from sandstone bottom to world bottom)
      const graniteStartLeft = sandstoneStartLeft + sandstoneDepth;
      const graniteStartRight = sandstoneStartRight + sandstoneDepth;
      const worldBottom = WORLD_HEIGHT;

      // We segment the granite layer vertically to distribute different ores
      const graniteHeight = worldBottom - Math.max(graniteStartLeft, graniteStartRight);
      const segmentHeight = 1000; // 10m segments
      const numSegments = Math.ceil(graniteHeight / segmentHeight);

      let currentLeft = graniteStartLeft;
      let currentRight = graniteStartRight;

      for (let s = 0; s < numSegments; s++) {
        const nextLeft = Math.min(worldBottom, currentLeft + segmentHeight);
        const nextRight = Math.min(worldBottom, currentRight + segmentHeight);

        // Determine material based on noise
        const midY = (currentLeft + nextLeft) / 2;
        const midX = (xStart + xEnd) / 2;
        
        // Noise queries for ores
        const ironNoise = this.noiseGen.noise(midX * 0.002, midY * 0.002);
        const copperNoise = this.noiseGen.noise(midX * 0.003 + 50, midY * 0.003 + 50);
        const goldNoise = this.noiseGen.noise(midX * 0.005 + 100, midY * 0.005 + 100);

        let mat = MaterialType.GRANITE;
        if (goldNoise > 0.85 && midY > 8000) {
          mat = MaterialType.GOLD_ORE;
        } else if (copperNoise > 0.8 && midY > 5000) {
          mat = MaterialType.COPPER_ORE;
        } else if (ironNoise > 0.75) {
          mat = MaterialType.IRON_ORE;
        }

        const segmentPoints = [
          { x: xStart, y: currentLeft },
          { x: xEnd, y: currentRight },
          { x: xEnd, y: nextRight },
          { x: xStart, y: nextLeft }
        ];

        blocks.push({
          id: `granite_col${col}_seg${s}`,
          materialType: mat,
          points: segmentPoints
        });

        currentLeft = nextLeft;
        currentRight = nextRight;
        if (currentLeft >= worldBottom && currentRight >= worldBottom) {
          break;
        }
      }
    }

    return blocks;
  }
}
