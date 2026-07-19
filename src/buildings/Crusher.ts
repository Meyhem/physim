import { Body, Bodies, Composite, World } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import { Materials } from '../terrain/Materials.ts';
import { MaterialType } from '../terrain/Materials.ts';
import type { Graphics } from 'pixi.js';

export class Crusher extends Building {
  public static readonly WIDTH = 200;
  public static readonly HEIGHT = 200;

  private jawAngle: number = 0; // For visual jaw animation
  private animationTimer: number = 0;

  constructor(id: string, x: number, y: number) {
    super(id, 'crusher', x, y, Crusher.WIDTH, Crusher.HEIGHT); // 2m wide, 2m tall
  }

  public initPhysics(world: World): void {
    // 1. Slanted funnel walls — matched to the visual slab geometry:
    //    113 wide, 20 thick, at 45°, centered at the visual centroid.
    //    This leaves a ~26px physics gap (40px visual gap) for shards to
    //    fall through into the sensor.
    const leftSlant = Bodies.rectangle(this.x - 60, this.y - 30, 113, 20, {
      angle: Math.PI / 4,
      friction: 0.05,
      density: 0.015,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    const rightSlant = Bodies.rectangle(this.x + 60, this.y - 30, 113, 20, {
      angle: -Math.PI / 4,
      friction: 0.05,
      density: 0.015,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    // 2. Chute walls guiding the output
    const leftChute = Bodies.rectangle(this.x - 25, this.y + 40, 16, 80, {
      friction: 0.1,
      density: 0.015,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    const rightChute = Bodies.rectangle(this.x + 25, this.y + 40, 16, 80, {
      friction: 0.1,
      density: 0.015,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    // 3. Central sensor catching incoming shards
    this.sensorBody = Bodies.rectangle(this.x, this.y, 40, 20, {
      isSensor: true,
      density: 0.015,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.SHARDS
      }
    });

    // Create a tiny sacrificial anchor body as parts[0]
    const anchor = Bodies.circle(this.x, this.y, 0.1, {
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    // Combine segments into a compound body
    const compound = Body.create({
      parts: [anchor, leftSlant, rightSlant, leftChute, rightChute, this.sensorBody],
      label: `building:crusher:${this.id}`,
      frictionAir: 0.05,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    Body.setStatic(compound, true);
    Body.setAngle(compound, this.angle);

    this.bodies = [compound];
    Composite.add(world, compound);
  }

  protected onItemEnter(body: Body): void {
    // Queue item for processing
    this.queue.push({
      bodyId: body.id,
      label: body.label, // e.g. "shard:iron_ore"
      timer: 2.0 // 2 seconds to crush
    });

    // Destroy the input shard physically
    body.label = 'remove_queued';
  }

  public update(dt: number, physicsWorld: any): void {
    if (this.queue.length > 0) {
      // Animate jaw wobble when active
      this.animationTimer += dt * 30;
      this.jawAngle = Math.sin(this.animationTimer) * 0.15; // Jiggling effect

      // Update timer of front item
      const item = this.queue[0];
      item.timer -= dt;

      if (item.timer <= 0) {
        // Processing finished! Spawn smaller crushed pieces
        const labelParts = item.label.split(':');
        const matType = (labelParts[1] as MaterialType) || MaterialType.DIRT;
        const props = Materials[matType];

        const outputCount = 3 + Math.floor(Math.random() * 3); // 3 to 5 small pieces

        const body = this.getBody();
        const px = body ? body.position.x : this.x;
        const py = body ? body.position.y : this.y;
        const angle = body ? body.angle : this.angle;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Spawn small shards
        for (let i = 0; i < outputCount; i++) {
          // Output position: bottom chute, slightly randomized offset
          const dx = (Math.random() - 0.5) * 20;
          const dy = 70;
          const ox = px + dx * cos - dy * sin;
          const oy = py + dx * sin + dy * cos;

          // Tiny triangle coordinates
          const r = 5 + Math.random() * 5;
          const shardPts = [
            { x: ox, y: oy - r },
            { x: ox + r, y: oy + r },
            { x: ox - r, y: oy + r }
          ];

          // Spawn body as a "crushed" shard
          const shardBody = physicsWorld.createShardBody(shardPts, `${matType}_crushed`, props.density * 0.8);
          
          // Eject shards slightly downwards (rotated)
          const evx = (Math.random() - 0.5) * 2;
          const evy = 2 + Math.random() * 2;
          Body.setVelocity(shardBody, {
            x: evx * cos - evy * sin,
            y: evx * sin + evy * cos
          });
        }

        // Remove from queue
        this.queue.shift();
      }
    } else {
      this.jawAngle = 0;
    }
  }

  public getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const body = this.getBody();
    const px = body ? body.position.x : this.x;
    const py = body ? body.position.y : this.y;
    return {
      minX: px - this.width / 2,
      maxX: px + this.width / 2,
      minY: py - this.height / 2,
      maxY: py + this.height / 2
    };
  }

  public draw(g: Graphics): void {
    // 1. Slanted funnel walls
    g.moveTo(-100, -80);
    g.lineTo(-20, 0);
    g.lineTo(-20, 20);
    g.lineTo(-100, -60);
    g.closePath();

    g.moveTo(100, -80);
    g.lineTo(20, 0);
    g.lineTo(20, 20);
    g.lineTo(100, -60);
    g.closePath();

    g.fill({ color: 0x42424F });
    g.stroke({ color: 0x2A2A35, width: 3 });

    // Outer Support/Gears
    g.rect(-25, 40, 10, 60); // left chute guide
    g.rect(15, 40, 10, 60);  // right chute guide
    g.fill({ color: 0x2D2D38 });
    g.stroke({ color: 0x1A1A24, width: 2 });

    // Wobbling crusher jaws (animated by this.jawAngle)
    const jawAngle = this.jawAngle;
    const drawRotatedRect = (px: number, py: number, rWidth: number, rHeight: number, rAngle: number) => {
      const cos = Math.cos(rAngle);
      const sin = Math.sin(rAngle);
      const halfW = rWidth / 2;

      const pts = [
        { x: -halfW, y: 0 },
        { x: halfW, y: 0 },
        { x: halfW, y: rHeight },
        { x: -halfW, y: rHeight }
      ].map(p => ({
        x: px + p.x * cos - p.y * sin,
        y: py + p.x * sin + p.y * cos
      }));

      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i].x, pts[i].y);
      }
      g.closePath();
      g.fill({ color: 0x8E251E }); // Rust red jaw
      g.stroke({ color: 0x4D1410, width: 2 });
    };

    drawRotatedRect(-21, -10, 12, 45, jawAngle);
    drawRotatedRect(21, -10, 12, 45, -jawAngle);
  }

  /**
   * Draws a placement-preview outline (local space) in the given status color.
   */
  public static drawGhost(g: Graphics, color: number): void {
    const w = Crusher.WIDTH;
    const h = Crusher.HEIGHT;

    g.rect(-w / 2, -h / 2, w, h);
    g.fill({ color, alpha: 0.15 });
    g.stroke({ color, width: 2, alpha: 0.6 });

    g.moveTo(-w / 2, -h / 2 + 20);
    g.lineTo(-20, 0);
    g.lineTo(-25, h / 2 - 20);

    g.moveTo(w / 2, -h / 2 + 20);
    g.lineTo(20, 0);
    g.lineTo(25, h / 2 - 20);
    g.stroke({ color, width: 1.5, alpha: 0.4 });
  }
}
