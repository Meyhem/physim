import { Container, Graphics } from 'pixi.js';
import { TerrainManager } from '../terrain/TerrainManager.ts';
import type { TerrainBlock } from '../terrain/TerrainGenerator.ts';
import { Materials } from '../terrain/Materials.ts';

export class TerrainRenderer {
  private container: Container;
  private blockGraphics: Map<string, Graphics> = new Map();

  constructor(container: Container) {
    this.container = container;
  }

  /**
   * Syncs the PixiJS graphics with the current terrain blocks state
   */
  public update(terrainManager: TerrainManager): void {
    const blocks = terrainManager.getBlocks();
    const currentIds = new Set<string>();

    for (const block of blocks) {
      currentIds.add(block.id);
      
      // If we don't have a graphics object for this block, create one
      if (!this.blockGraphics.has(block.id)) {
        this.createBlockGraphics(block);
      }
    }

    // Remove graphics for blocks that are no longer in the manager
    for (const [id, graphics] of this.blockGraphics.entries()) {
      if (!currentIds.has(id)) {
        this.container.removeChild(graphics);
        graphics.destroy();
        this.blockGraphics.delete(id);
      }
    }
  }

  private createBlockGraphics(block: TerrainBlock): void {
    const props = Materials[block.materialType];
    const graphics = new Graphics();

    // Set fill color
    graphics.fill({ color: props.color });
    
    // Draw polygon
    if (block.points.length > 0) {
      graphics.moveTo(block.points[0].x, block.points[0].y);
      for (let i = 1; i < block.points.length; i++) {
        graphics.lineTo(block.points[i].x, block.points[i].y);
      }
      graphics.closePath();
    }

    // Add a dark slate border for grid separation/strata look
    graphics.stroke({ color: 0x1a1a24, width: 2 });

    this.container.addChild(graphics);
    this.blockGraphics.set(block.id, graphics);
  }

  public clear(): void {
    for (const graphics of this.blockGraphics.values()) {
      graphics.destroy();
    }
    this.blockGraphics.clear();
  }
}
