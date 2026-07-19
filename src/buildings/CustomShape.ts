import { Body, Bodies, Composite, World } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

export interface FlowSegment {
  poly: Point2D[]; // Relative to origin
  dir: Point2D;
  isIntake?: boolean; // True for the segment at the pipe's suction mouth
  mouth?: Point2D; // Relative-to-origin position of the intake mouth (pipe only)
}

export interface CustomShapeDef {
  id: string;
  name: string;
  polygons: Point2D[][]; // Relative to origin (body position)
  brushType: 'solid' | 'conveyor' | 'pipe';
  thickness: number;
  conveyorSegments?: { poly: Point2D[]; dir: Point2D }[]; // Relative to origin
  flowSegments?: FlowSegment[]; // Relative to origin (pipe)
  points?: Point2D[]; // Optional legacy property
  // User-editable polyline for solid/conveyor brushes. Vertices are relative
  // to the body's position. Editing the path triggers rebuildFromPath, which
  // regenerates `polygons` (and `conveyorSegments` for conveyors) from it.
  path?: Point2D[];
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
  private relativeSegments: FlowSegment[] = [];

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

    // Re-center the def around the compound's actual position so that the
    // polygons / path / segments are always expressed relative to the body's
    // position. This keeps rendering (which uses body.position) and physics
    // perfectly aligned, even after a path edit rebuilds the body.
    const shiftX = compound.position.x - this.x;
    const shiftY = compound.position.y - this.y;
    if (Math.abs(shiftX) > 0.001 || Math.abs(shiftY) > 0.001) {
      this.x = compound.position.x;
      this.y = compound.position.y;
      this.def.polygons = this.def.polygons.map(poly =>
        poly.map(p => ({ x: p.x - shiftX, y: p.y - shiftY })),
      );
      if (this.def.conveyorSegments) {
        this.def.conveyorSegments = this.def.conveyorSegments.map(s => ({
          ...s,
          poly: s.poly.map(p => ({ x: p.x - shiftX, y: p.y - shiftY })),
        }));
      }
      if (this.def.flowSegments) {
        this.def.flowSegments = this.def.flowSegments.map(s => ({
          ...s,
          poly: s.poly.map(p => ({ x: p.x - shiftX, y: p.y - shiftY })),
          mouth: s.mouth ? { x: s.mouth.x - shiftX, y: s.mouth.y - shiftY } : undefined,
        }));
      }
      if (this.def.path) {
        this.def.path = this.def.path.map(p => ({ x: p.x - shiftX, y: p.y - shiftY }));
      }
    }

    // Compute active relative segments. Because the def has just been re-centered
    // to be relative to the compound's position, the conveyor/flow segments can
    // be used directly.
    const segments = (this.def.conveyorSegments || this.def.flowSegments || []) as FlowSegment[];
    this.relativeSegments = segments.map(seg => ({
      poly: seg.poly.map(p => ({ x: p.x, y: p.y })),
      dir: { x: seg.dir.x, y: seg.dir.y },
      isIntake: seg.isIntake,
      mouth: seg.mouth ? { x: seg.mouth.x, y: seg.mouth.y } : undefined,
    }));
  }

  /**
   * Rebuild this shape's polygons (and conveyor segments, if applicable) from
   * its `def.path`, then recreate the physics body. Used by the brush-edit
   * tool when the user drags a path segment or vertex.
   */
  public rebuildFromPath(world: World): void {
    if (!this.def.path || this.def.path.length < 2) return;
    const thickness = this.def.thickness;

    const newPolys = PolygonUtils.pathToPolygons(this.def.path, thickness);
    if (newPolys.length === 0) return;

    this.def.polygons = newPolys;

    if (this.def.brushType === 'conveyor') {
      this.def.conveyorSegments = PolygonUtils.buildConveyorSegmentsFromPath(this.def.path, thickness);
    }

    // Recompute bounds (width/height) for the new geometry.
    const bounds = getPolygonsBounds(this.def.polygons);
    this.width = bounds.width;
    this.height = bounds.height;

    // Dispose of the old body and build a fresh one. initPhysics will re-center
    // the def around the new compound position.
    this.destroyPhysics(world);
    this.initPhysics(world);
  }

  protected onItemEnter(_body: Body): void {
    // Custom shapes do not process items in a queue
  }

  public update(_dt: number, physicsWorld: any): void {
    const shards = physicsWorld.getShardBodies();
    if (this.def.brushType === 'conveyor') {
      this.applyConveyorForces(shards);
    } else if (this.def.brushType === 'pipe') {
      this.applyPipeForces(shards);
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

        // Apply conveyor force if shard overlaps the segment polygon (center inside OR edge touching)
        const shardRadius = (shard as any).circleRadius || 5;
        if (PolygonUtils.isCircleOverlappingPolygon(shard.position, shardRadius, worldPoly)) {
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

  /**
   * Pipe behaviour: suck nearby shards in through the intake mouth, then propel
   * everything inside the tube along the direction toward the outlet.
   */
  public applyPipeForces(shards: Set<Body>): void {
    if (this.def.brushType !== 'pipe') return;
    const body = this.getBody();
    if (!body) return;

    const angle = body.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const segments = this.relativeSegments || [];
    const targetSpeed = 7;
    const suctionRadius = this.def.thickness * 1.2;

    for (const seg of segments) {
      const worldPoly = seg.poly.map(p => ({
        x: body.position.x + p.x * cos - p.y * sin,
        y: body.position.y + p.x * sin + p.y * cos
      }));

      const rx = seg.dir.x * cos - seg.dir.y * sin;
      const ry = seg.dir.x * sin + seg.dir.y * cos;

      for (const shard of shards) {
        if (shard.parts.length > 1) continue;

        const shardRadius = (shard as any).circleRadius || 5;
        const inChannel = PolygonUtils.isCircleOverlappingPolygon(shard.position, shardRadius, worldPoly);
        if (!inChannel) continue;

        // Velocity-targeted propulsion along the pipe direction
        const vAlong = shard.velocity.x * rx + shard.velocity.y * ry;
        const speedGap = Math.max(0, targetSpeed - vAlong);
        const base = Math.max(0.4, speedGap);
        const forceMag = 0.004 * shard.mass * base;
        Body.applyForce(shard, shard.position, {
          x: rx * forceMag,
          y: ry * forceMag
        });
      }

      // Suction at the intake mouth pulls shards into the pipe
      if (seg.isIntake && seg.mouth) {
        const mx = body.position.x + seg.mouth.x * cos - seg.mouth.y * sin;
        const my = body.position.y + seg.mouth.x * sin + seg.mouth.y * cos;

        for (const shard of shards) {
          if (shard.parts.length > 1) continue;

          const dx = mx - shard.position.x;
          const dy = my - shard.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= suctionRadius) continue;

          const falloff = 1 - dist / suctionRadius;
          const forceMag = 0.006 * shard.mass * falloff;
          const tx = dist > 0.001 ? dx / dist : rx;
          const ty = dist > 0.001 ? dy / dist : ry;
          // Pull toward the mouth, with a bias along the pipe direction so
          // shards keep moving inward once they reach the opening.
          Body.applyForce(shard, shard.position, {
            x: (tx + rx * 0.4) * forceMag,
            y: (ty + ry * 0.4) * forceMag
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
