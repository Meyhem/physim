import { Body, Bodies, Composite, World, Bounds } from 'matter-js';
import { CollisionCategories } from '../core/Constants.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

export interface CustomShapeDef {
  id: string;
  name: string;
  points: Point2D[];
  brushType: 'solid' | 'conveyor';
  thickness: number;
}

export class CustomShape {
  public def: CustomShapeDef;
  public body: Body | null = null;
  private segmentAngles: number[] = [];
  private segmentVectors: Point2D[] = [];

  constructor(def: CustomShapeDef) {
    this.def = def;
    this.precomputeSegments();
  }

  private precomputeSegments(): void {
    const pts = this.def.points;
    if (pts.length < 2) return;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0.001) {
        this.segmentAngles.push(Math.atan2(dy, dx));
        this.segmentVectors.push({ x: dx / len, y: dy / len });
      } else {
        this.segmentAngles.push(0);
        this.segmentVectors.push({ x: 1, y: 0 });
      }
    }
  }

  /**
   * Spawns this custom shape as a physical body in the world.
   */
  public spawn(x: number, y: number, world: World): Body {
    // Translate all points relative to the first point, then offset by spawn position (x, y)
    const pts = this.def.points;
    if (pts.length < 2) {
      // Return a dummy small circle if shape is degenerate
      const dummy = Bodies.circle(x, y, 10);
      Composite.add(world, dummy);
      return dummy;
    }

    const startPt = pts[0];
    const translatedPts = pts.map(p => ({
      x: p.x - startPt.x + x,
      y: p.y - startPt.y + y
    }));

    // Create rectangles for each segment
    const rects: Body[] = [];
    for (let i = 0; i < translatedPts.length - 1; i++) {
      const p1 = translatedPts[i];
      const p2 = translatedPts[i + 1];
      
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      // Create segment rectangle
      const rect = Bodies.rectangle(cx, cy, length, this.def.thickness, {
        angle: angle,
        friction: 0.1,
        restitution: 0.1,
        collisionFilter: {
          category: CollisionCategories.TOOLS,
          mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
        }
      });
      rects.push(rect);
    }

    // Combine segments into a compound body
    // Matter.js Body.create requires parts array where the first part is the main container body
    // We create a container, or simply use Body.create directly
    const compound = Body.create({
      parts: rects,
      label: `custom:${this.def.brushType}:${this.def.id}`,
      collisionFilter: {
        category: CollisionCategories.TOOLS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    // Make it non-static so it can be grabbed and dragged around!
    Body.setStatic(compound, false);

    this.body = compound;
    Composite.add(world, compound);
    return compound;
  }

  /**
   * Applies conveyor propulsion force to touching bodies.
   */
  public applyConveyorForces(shards: Set<Body>): void {
    if (this.def.brushType !== 'conveyor' || !this.body) return;

    // For each segment in the compound body, check collision/touch
    // Since Matter.js handles parts, body.parts contains all individual segment bodies
    const parts = this.body.parts.slice(1); // part[0] is the compound parent

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const vec = this.segmentVectors[i]; // Direction vector of this segment

      // Find if any shard is touching this segment
      for (const shard of shards) {
        // Skip compound parent bodies
        if (shard.parts.length > 1) continue;

        // Simple distance check to see if shard touches segment bounding box
        const dx = shard.position.x - part.position.x;
        const dy = shard.position.y - part.position.y;
        const distSq = dx * dx + dy * dy;

        // If close enough, check AABB overlap
        const maxDist = 80;
        if (distSq < maxDist * maxDist) {
          if (Bounds.overlaps(part.bounds, shard.bounds)) {
            // Apply force along conveyor segment direction
            const forceMag = 0.0006 * shard.mass;
            Body.applyForce(shard, shard.position, {
              x: vec.x * forceMag,
              y: vec.y * forceMag
            });
          }
        }
      }
    }
  }
}
