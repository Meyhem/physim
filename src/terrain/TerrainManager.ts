import { TerrainGenerator } from './TerrainGenerator.ts';
import type { TerrainBlock } from './TerrainGenerator.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

export class TerrainManager {
  private blocks: TerrainBlock[] = [];
  private generator: TerrainGenerator;

  constructor() {
    this.generator = new TerrainGenerator();
  }

  public init(): void {
    // Generate terrain blocks
    this.blocks = this.generator.generateWorld();
    console.log(`Generated ${this.blocks.length} terrain blocks.`);
  }

  public getBlocks(): TerrainBlock[] {
    return this.blocks;
  }

  /**
   * Removes a block (e.g. when it gets fractured or fully destroyed)
   */
  public removeBlock(id: string): void {
    this.blocks = this.blocks.filter(b => b.id !== id);
  }

  /**
   * Adds a new block (e.g., if we create static terrain or replace blocks)
   */
  public addBlock(block: TerrainBlock): void {
    this.blocks.push(block);
  }

  /**
   * Gets a block by id
   */
  public getBlock(id: string): TerrainBlock | undefined {
    return this.blocks.find(b => b.id === id);
  }

  /**
   * Finds the terrain material directly beneath a world point (matching the
   * terrain a building mounted at x is resting on). Returns null if none.
   */
  public getMaterialBelow(x: number, y: number): TerrainBlock | null {
    let best: TerrainBlock | null = null;
    let bestTop = Infinity;

    for (const block of this.blocks) {
      let bMinX = Infinity, bMaxX = -Infinity;
      let bMinY = Infinity;
      for (const p of block.points) {
        if (p.x < bMinX) bMinX = p.x;
        if (p.x > bMaxX) bMaxX = p.x;
        if (p.y < bMinY) bMinY = p.y;
      }

      if (x < bMinX || x > bMaxX) continue;       // not under this column
      if (bMinY < y) continue;                     // terrain top is above the point

      if (bMinY < bestTop) {
        bestTop = bMinY;
        best = block;
      }
    }

    return best;
  }

  /**
   * Returns the terrain block containing the given world point, or null.
   */
  public getMaterialAtPoint(x: number, y: number): TerrainBlock | null {
    for (const block of this.blocks) {
      if (PolygonUtils.isPointInPolygon({ x, y } as Point2D, block.points)) {
        return block;
      }
    }
    return null;
  }
}
