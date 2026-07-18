import { Body, Bodies, Composite, World, Bounds } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

export interface CustomShapeDef {
  id: string;
  name: string;
  points: Point2D[];
  brushType: 'solid' | 'conveyor';
  thickness: number;
}

export function getPointsBounds(points: Point2D[]) {
  if (points.length === 0) return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
    maxX,
    maxY
  };
}

export class CustomShape extends Building {
  public def: CustomShapeDef;
  private segmentAngles: number[] = [];
  private segmentVectors: Point2D[] = [];

  constructor(id: string, def: CustomShapeDef, x: number, y: number) {
    const bounds = getPointsBounds(def.points);
    super(id, def.id, x, y, bounds.width, bounds.height);
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

  public initPhysics(world: World): void {
    const pts = this.def.points;
    if (pts.length < 2) {
      const dummy = Bodies.circle(this.x, this.y, 10, {
        collisionFilter: {
          category: CollisionCategories.TOOLS,
          mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
        }
      });
      Composite.add(world, dummy);
      this.bodies = [dummy];
      return;
    }

    const startPt = pts[0];
    const translatedPts = pts.map(p => ({
      x: p.x - startPt.x + this.x,
      y: p.y - startPt.y + this.y
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

    // Create a tiny sacrificial anchor body as parts[0].
    // Matter.js replaces parts[0] with the compound's convex hull,
    // so we sacrifice this anchor to preserve all real segment rects at parts[1..N].
    const anchor = Bodies.circle(this.x, this.y, 0.5, {
      isSensor: true,
      collisionFilter: { category: 0, mask: 0 }
    });

    // Combine segments into a compound body
    const compound = Body.create({
      parts: [anchor, ...rects],
      label: `custom:${this.def.brushType}:${this.def.id}`,
      frictionAir: 0.05,
      collisionFilter: {
        category: CollisionCategories.TOOLS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    Body.setStatic(compound, false);
    Body.setAngle(compound, this.angle);

    this.bodies = [compound];
    Composite.add(world, compound);
  }

  protected onItemEnter(_body: Body): void {
    // Custom shapes do not process items in a queue
  }

  public update(_dt: number, physicsWorld: any): void {
    if (this.def.brushType === 'conveyor') {
      const shards = physicsWorld.getShardBodies();
      this.applyConveyorForces(shards);
    }
  }

  public applyConveyorForces(shards: Set<Body>): void {
    if (this.def.brushType !== 'conveyor') return;
    const body = this.getBody();
    if (!body) return;

    const parts = body.parts.slice(1); // Skip parts[0] (compound convex hull), use actual segment rects
    const angle = body.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const vec = this.segmentVectors[i];

      const rx = vec.x * cos - vec.y * sin;
      const ry = vec.x * sin + vec.y * cos;

      for (const shard of shards) {
        if (shard.parts.length > 1) continue;

        const dx = shard.position.x - part.position.x;
        const dy = shard.position.y - part.position.y;
        const distSq = dx * dx + dy * dy;

        const maxDist = 80;
        if (distSq < maxDist * maxDist) {
          if (Bounds.overlaps(part.bounds, shard.bounds)) {
            const forceMag = 0.0006 * shard.mass;
            Body.applyForce(shard, shard.position, {
              x: rx * forceMag,
              y: ry * forceMag
            });
          }
        }
      }
    }
  }

  public getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const pts = this.def.points;
    if (pts.length === 0) {
      return { minX: this.x, maxX: this.x, minY: this.y, maxY: this.y };
    }
    const startPt = pts[0];
    const bounds = getPointsBounds(pts);
    return {
      minX: this.x + (bounds.minX - startPt.x),
      maxX: this.x + (bounds.maxX - startPt.x),
      minY: this.y + (bounds.minY - startPt.y),
      maxY: this.y + (bounds.maxY - startPt.y)
    };
  }
}
