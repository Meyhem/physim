import { Container, Graphics } from 'pixi.js';
import type { CustomShape } from '../tools/CustomShape.ts';

export class CustomShapeRenderer {
  private container: Container;
  private shapeGraphics: Map<string, Graphics> = new Map();

  constructor(container: Container) {
    this.container = container;
  }

  /**
   * Synchronizes the rendering of placed custom shapes.
   */
  public update(shapes: CustomShape[]): void {
    const activeIds = new Set<string>();

    for (const shape of shapes) {
      if (!shape.body) continue;
      const id = shape.def.id;
      activeIds.add(id);

      let graphics = this.shapeGraphics.get(id);
      if (!graphics) {
        graphics = this.createShapeGraphics(shape);
        this.container.addChild(graphics);
        this.shapeGraphics.set(id, graphics);
      }

      // Sync position and rotation of the compound shape container
      graphics.x = shape.body.position.x;
      graphics.y = shape.body.position.y;
      graphics.rotation = shape.body.angle;
    }

    // Clean up removed shapes
    for (const [id, graphics] of this.shapeGraphics.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(graphics);
        graphics.destroy();
        this.shapeGraphics.delete(id);
      }
    }
  }

  private createShapeGraphics(shape: CustomShape): Graphics {
    const graphics = new Graphics();
    const body = shape.body;
    if (!body) return graphics;

    // Matter.js body.parts contains the compound shapes.
    // part[0] is the compound parent container, part[1..N] are individual segment shapes.
    const parts = body.parts.slice(1);
    const strokeColor = shape.def.brushType === 'solid' ? 0x7f8c8d : 0xf39c12;

    for (const part of parts) {
      const vertices = part.vertices;
      if (vertices.length > 0) {
        // Draw segment polygon relative to the compound parent's center position
        graphics.moveTo(vertices[0].x - body.position.x, vertices[0].y - body.position.y);
        for (let i = 1; i < vertices.length; i++) {
          graphics.lineTo(vertices[i].x - body.position.x, vertices[i].y - body.position.y);
        }
        graphics.closePath();
      }
    }

    // Call fill and stroke after the full geometry is defined
    graphics.fill({ color: strokeColor });
    graphics.stroke({ color: 0x111116, width: 1.5 });

    return graphics;
  }

  public clear(): void {
    for (const graphics of this.shapeGraphics.values()) {
      graphics.destroy();
    }
    this.shapeGraphics.clear();
  }
}
