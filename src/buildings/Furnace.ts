import { Body, Bodies, Composite, World } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import { Materials } from '../terrain/Materials.ts';
import { MaterialType } from '../terrain/Materials.ts';

export class Furnace extends Building {
  public heatIntensity: number = 0; // For glowing animation
  private animationTimer: number = 0;

  constructor(id: string, x: number, y: number) {
    super(id, 'furnace', x, y, 160, 160); // 1.6m wide, 1.6m tall
  }

  public initPhysics(world: World): void {
    // 1. Crucible walls (open top U-shape)
    const leftWall = Bodies.rectangle(this.x - 45, this.y, 16, 120, {
      isStatic: true,
      friction: 0.2,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    const rightWall = Bodies.rectangle(this.x + 45, this.y, 16, 120, {
      isStatic: true,
      friction: 0.2,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    const bottomWall = Bodies.rectangle(this.x, this.y + 55, 106, 16, {
      isStatic: true,
      friction: 0.2,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS
      }
    });

    // 2. Sensor inside the crucible
    this.sensorBody = Bodies.rectangle(this.x, this.y + 10, 70, 70, {
      isStatic: true,
      isSensor: true,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.SHARDS
      }
    });

    this.bodies = [leftWall, rightWall, bottomWall, this.sensorBody];
    Composite.add(world, this.bodies);
  }

  protected onItemEnter(body: Body): void {
    // ONLY accept CRUSHED shards in the furnace
    if (body.label.endsWith('_crushed')) {
      this.queue.push({
        bodyId: body.id,
        label: body.label, // e.g. "shard:iron_ore_crushed"
        timer: 3.5 // 3.5 seconds to smelt
      });

      body.label = 'remove_queued';
    }
  }

  public update(dt: number, physicsWorld: any): void {
    if (this.queue.length > 0) {
      // Glow pulse when active
      this.animationTimer += dt * 5;
      this.heatIntensity = 0.5 + Math.sin(this.animationTimer) * 0.3;

      const item = this.queue[0];
      item.timer -= dt;

      if (item.timer <= 0) {
        // Smelting finished! Spawn product (Ingot / Brick / Block)
        const labelParts = item.label.split(':'); // shard:iron_ore_crushed
        const matType = labelParts[1].replace('_crushed', '') as MaterialType;
        const props = Materials[matType] || Materials[MaterialType.DIRT];

        // Output position: eject from the top right edge of the furnace
        const ox = this.x + 55;
        const oy = this.y - 40;

        // Ingot dimensions (36px wide, 14px high)
        const ingotBody = Bodies.rectangle(ox, oy, 36, 14, {
          friction: 0.1,
          restitution: 0.2,
          density: props.density * 1.2,
          collisionFilter: {
            // Category tools or shards so it behaves like a dynamic movable entity
            category: CollisionCategories.SHARDS,
            mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.TOOLS | CollisionCategories.BUILDINGS
          }
        });

        // Label: "ingot:material_type"
        ingotBody.label = `ingot:${matType}`;

        Composite.add(physicsWorld.world, ingotBody);
        physicsWorld.getShardBodies().add(ingotBody); // Register ingot in active bodies list

        // Give it a tiny upward and outward push
        Body.setVelocity(ingotBody, {
          x: 2 + Math.random() * 2,
          y: -3 - Math.random() * 2
        });

        // Remove from queue
        this.queue.shift();
      }
    } else {
      this.heatIntensity = 0;
    }
  }
}
