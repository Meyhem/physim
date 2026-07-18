import { TerrainGenerator } from './TerrainGenerator.ts';
import type { TerrainBlock } from './TerrainGenerator.ts';

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
}
