import { Container, Graphics } from 'pixi.js';
import { Body } from 'matter-js';
import { Materials } from '../terrain/Materials.ts';
import { MaterialType } from '../terrain/Materials.ts';

export class ShardRenderer {
  private container: Container;
  private shardGraphics: Map<number, Graphics> = new Map();

  constructor(container: Container) {
    this.container = container;
  }

  /**
   * Synchronizes the rendering of physics shard bodies.
   */
  public update(bodies: Set<Body>): void {
    const activeIds = new Set<number>();

    for (const body of bodies) {
      activeIds.add(body.id);

      let graphics = this.shardGraphics.get(body.id);
      if (!graphics) {
        graphics = this.createShardGraphics(body);
        this.container.addChild(graphics);
        this.shardGraphics.set(body.id, graphics);
      }

      // Sync position and rotation
      graphics.x = body.position.x;
      graphics.y = body.position.y;
      graphics.rotation = body.angle;
    }

    // Clean up removed bodies
    for (const [id, graphics] of this.shardGraphics.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(graphics);
        graphics.destroy();
        this.shardGraphics.delete(id);
      }
    }
  }

  private createShardGraphics(body: Body): Graphics {
    const graphics = new Graphics();
    
    // Extract material type from label "shard:material_type"
    const labelParts = body.label.split(':');
    const matType = (labelParts[1] as MaterialType) || MaterialType.DIRT;
    const props = Materials[matType] || Materials[MaterialType.DIRT];

    // Draw the vertices relative to the body's center
    // Matter.js body.parts[0].vertices contains the polygon vertices
    const vertices = body.parts[0].vertices;
    if (vertices.length > 0) {
      // Vertices are relative to the body position in Matter.js if we use relative offsets, 
      // but in body.vertices they are in absolute coordinates. 
      // To draw relative to graphics (0, 0), we subtract the body position:
      const cx = body.position.x;
      const cy = body.position.y;

      graphics.moveTo(vertices[0].x - cx, vertices[0].y - cy);
      for (let i = 1; i < vertices.length; i++) {
        graphics.lineTo(vertices[i].x - cx, vertices[i].y - cy);
      }
      graphics.closePath();
    }

    // Set fill color and stroke after path is created
    graphics.fill({ color: props.color });
    graphics.stroke({ color: 0x111116, width: 1 });

    return graphics;
  }

  public clear(): void {
    for (const graphics of this.shardGraphics.values()) {
      graphics.destroy();
    }
    this.shardGraphics.clear();
  }
}
