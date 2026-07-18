import { Body, Bodies, Composite, World } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

export interface CustomShapeDef {
  id: string;
  name: string;
  polygons: Point2D[][]; // Relative to origin
  brushType: 'solid' | 'conveyor';
  thickness: number;
  conveyorSegments?: { poly: Point2D[]; dir: Point2D }[]; // Relative to origin
  points?: Point2D[]; // Optional legacy property
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

export function getPolygonsBounds(polygons: Point2D[][]) {
  if (!polygons || polygons.length === 0) return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
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
  private relativeSegments: { poly: Point2D[]; dir: Point2D }[] = [];

  constructor(id: string, def: CustomShapeDef, x: number, y: number) {
    const bounds = getPolygonsBounds(def.polygons);
    super(id, def.id, x, y, bounds.width, bounds.height);
    this.def = def;
  }

  public initPhysics(world: World): void {
    const polys = this.def.polygons;
    if (!polys || polys.length === 0) {
      const dummy = Bodies.circle(this.x, this.y, 10, {
        isStatic: true,
        collisionFilter: {
          category: CollisionCategories.TOOLS,
          mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
        }
      });
      Composite.add(world, dummy);
      this.bodies = [dummy];
      return;
    }

    // Create a body for each polygon (triangulating them to handle concavity)
    const rects: Body[] = [];
    for (const poly of polys) {
      if (poly.length < 3) continue;

      const triangles = PolygonUtils.triangulate(poly);

      for (const tri of triangles) {
        if (tri.length < 3) continue;

        // Translate triangle to world coordinates (relative to this.x, this.y)
        const worldTri = tri.map(p => ({
          x: p.x + this.x,
          y: p.y + this.y
        }));

        const centroid = PolygonUtils.getCentroid(worldTri);
        const centeredPoints = worldTri.map(p => ({ x: p.x - centroid.x, y: p.y - centroid.y }));

        const isConveyor = this.def.brushType === 'conveyor';
        const body = Bodies.fromVertices(centroid.x, centroid.y, [centeredPoints], {
          friction: 0.9,
          restitution: 0.1,
          density: isConveyor ? 0.35 : 0.015,
          collisionFilter: {
            category: CollisionCategories.TOOLS,
            mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
          }
        });
        if (body) {
          rects.push(body);
        }
      }
    }

    if (rects.length === 0) {
      const dummy = Bodies.circle(this.x, this.y, 10, {
        isStatic: true,
        collisionFilter: {
          category: CollisionCategories.TOOLS,
          mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
        }
      });
      Composite.add(world, dummy);
      this.bodies = [dummy];
      return;
    }

    // Create a tiny sacrificial anchor body as parts[0]
    const anchor = Bodies.circle(this.x, this.y, 0.1, {
      collisionFilter: {
        category: CollisionCategories.TOOLS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    // Combine into a compound body
    const compound = Body.create({
      parts: [anchor, ...rects],
      label: `custom:${this.def.brushType}:${this.def.id}`,
      isStatic: true,
      frictionAir: 0.05,
      collisionFilter: {
        category: CollisionCategories.TOOLS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    Body.setStatic(compound, true);
    Body.setAngle(compound, this.angle);

    this.bodies = [compound];
    Composite.add(world, compound);

    // Compute active relative segments based on compound's unrotated center of mass
    const segments = this.def.conveyorSegments || [];
    this.relativeSegments = segments.map(seg => {
      return {
        poly: seg.poly.map(p => {
          const worldX = this.x + p.x;
          const worldY = this.y + p.y;
          return {
            x: worldX - compound.position.x,
            y: worldY - compound.position.y
          };
        }),
        dir: { x: seg.dir.x, y: seg.dir.y }
      };
    });
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

    const angle = body.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const segments = this.relativeSegments || [];

    for (const seg of segments) {
      // Transform conveyor segment polygon to world space
      const worldPoly = seg.poly.map(p => ({
        x: body.position.x + p.x * cos - p.y * sin,
        y: body.position.y + p.x * sin + p.y * cos
      }));

      const rx = seg.dir.x * cos - seg.dir.y * sin;
      const ry = seg.dir.x * sin + seg.dir.y * cos;

      for (const shard of shards) {
        if (shard.parts.length > 1) continue;

        // Apply conveyor force if shard's center is inside the segment polygon
        if (PolygonUtils.isPointInPolygon(shard.position, worldPoly)) {
          // Optimized force multiplier to match updated shard weights
          const forceMag = 0.0035 * shard.mass;
          Body.applyForce(shard, shard.position, {
            x: rx * forceMag,
            y: ry * forceMag
          });
        }
      }
    }
  }

  public getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const bounds = getPolygonsBounds(this.def.polygons);
    return {
      minX: this.x + bounds.minX,
      maxX: this.x + bounds.maxX,
      minY: this.y + bounds.minY,
      maxY: this.y + bounds.maxY
    };
  }
}
