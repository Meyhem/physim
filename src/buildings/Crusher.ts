import { Body, Bodies, Composite, World } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import { Materials } from '../terrain/Materials.ts';
import { MaterialType } from '../terrain/Materials.ts';

export class Crusher extends Building {
  public jawAngle: number = 0; // For visual jaw animation
  private animationTimer: number = 0;

  constructor(id: string, x: number, y: number) {
    super(id, 'crusher', x, y, 200, 200); // 2m wide, 2m tall
  }

  public initPhysics(world: World): void {
    // 1. Slanted funnel walls
    const leftSlant = Bodies.rectangle(this.x - 60, this.y - 40, 130, 16, {
      angle: Math.PI / 6, // 30 degrees slanted
      friction: 0.1,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    const rightSlant = Bodies.rectangle(this.x + 60, this.y - 40, 130, 16, {
      angle: -Math.PI / 6,
      friction: 0.1,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    // 2. Chute walls guiding the output
    const leftChute = Bodies.rectangle(this.x - 25, this.y + 40, 16, 80, {
      friction: 0.1,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    const rightChute = Bodies.rectangle(this.x + 25, this.y + 40, 16, 80, {
      friction: 0.1,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    // 3. Central sensor catching incoming shards
    this.sensorBody = Bodies.rectangle(this.x, this.y, 40, 20, {
      isSensor: true,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.SHARDS
      }
    });

    // Combine segments into a compound body
    const compound = Body.create({
      parts: [leftSlant, rightSlant, leftChute, rightChute, this.sensorBody],
      label: `building:crusher:${this.id}`,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    Body.setStatic(compound, false);
    Body.setInertia(compound, Infinity);
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
}
