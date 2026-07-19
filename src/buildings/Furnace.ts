import { Body, Bodies, Composite, World } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import { Materials } from '../terrain/Materials.ts';
import { MaterialType } from '../terrain/Materials.ts';
import type { Graphics } from 'pixi.js';

export class Furnace extends Building {
  public static readonly WIDTH = 160;
  public static readonly HEIGHT = 160;

  // Nozzle output position (local space, relative to body center)
  private static readonly NOZZLE_X = 78;
  private static readonly NOZZLE_Y = -30;

  // Batch-fill mechanic: furnace must accumulate this many crushed shards
  // before it smelts the batch and ejects ingots from the side nozzle.
  private static readonly MAX_FILL = 5;
  private static readonly SMELT_DURATION = 4.0; // seconds for a full batch

  private heatIntensity: number = 0;
  private animationTimer: number = 0;
  private fillLevel: number = 0;
  private smeltTimer: number = 0;
  private isSmelting: boolean = false;

  constructor(id: string, x: number, y: number) {
    super(id, 'furnace', x, y, Furnace.WIDTH, Furnace.HEIGHT);
  }

  public initPhysics(world: World): void {
    // 1. Crucible walls (open-top U-shape). The right wall is split around a
    //    nozzle opening (y = -48 to y = -12) through which ingots are ejected.
    const leftWall = Bodies.rectangle(this.x - 45, this.y, 16, 120, {
      friction: 0.2,
      density: 0.015,
      collisionFilter: { category: CollisionCategories.BUILDINGS }
    });

    const rightWallUpper = Bodies.rectangle(this.x + 45, this.y - 54, 16, 12, {
      friction: 0.2,
      density: 0.015,
      collisionFilter: { category: CollisionCategories.BUILDINGS }
    });

    const rightWallLower = Bodies.rectangle(this.x + 45, this.y + 24, 16, 72, {
      friction: 0.2,
      density: 0.015,
      collisionFilter: { category: CollisionCategories.BUILDINGS }
    });

    // Nozzle spout walls extending right from the opening
    const nozzleTop = Bodies.rectangle(this.x + 60, this.y - 54, 30, 12, {
      friction: 0.2,
      density: 0.015,
      collisionFilter: { category: CollisionCategories.BUILDINGS }
    });

    const nozzleBottom = Bodies.rectangle(this.x + 60, this.y - 6, 30, 12, {
      friction: 0.2,
      density: 0.015,
      collisionFilter: { category: CollisionCategories.BUILDINGS }
    });

    const bottomWall = Bodies.rectangle(this.x, this.y + 55, 106, 16, {
      friction: 0.2,
      density: 0.015,
      collisionFilter: { category: CollisionCategories.BUILDINGS }
    });

    // 2. Sensor inside the crucible — catches falling crushed shards
    this.sensorBody = Bodies.rectangle(this.x, this.y + 10, 70, 70, {
      isSensor: true,
      density: 0.015,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.SHARDS
      }
    });

    // Combine into a compound body
    const anchor = Bodies.circle(this.x, this.y, 0.1, {
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });

    const compound = Body.create({
      parts: [anchor, leftWall, rightWallUpper, rightWallLower, nozzleTop, nozzleBottom, bottomWall, this.sensorBody],
      label: `building:furnace:${this.id}`,
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
    // Reject while a batch is smelting or the crucible is full
    if (this.isSmelting || this.fillLevel >= Furnace.MAX_FILL) return;

    if (body.label.endsWith('_crushed')) {
      this.queue.push({
        bodyId: body.id,
        label: body.label,
        timer: 0
      });
      this.fillLevel = Math.min(Furnace.MAX_FILL, this.fillLevel + 1);
      body.label = 'remove_queued';

      // Start smelting once the crucible is full
      if (this.fillLevel >= Furnace.MAX_FILL) {
        this.isSmelting = true;
        this.smeltTimer = Furnace.SMELT_DURATION;
      }
    }
  }

  public update(dt: number, physicsWorld: any): void {
    if (this.isSmelting) {
      // Vigorous glow pulse while smelting
      this.animationTimer += dt * 5;
      this.heatIntensity = 0.6 + Math.sin(this.animationTimer) * 0.3;

      this.smeltTimer -= dt;
      if (this.smeltTimer <= 0) {
        this.produceIngots(physicsWorld);
        this.isSmelting = false;
        this.fillLevel = 0;
        this.heatIntensity = 0;
      }
    } else if (this.fillLevel > 0) {
      // Heating up — gentle glow proportional to fill level
      this.animationTimer += dt * 3;
      this.heatIntensity = 0.15 + (this.fillLevel / Furnace.MAX_FILL) * 0.25
        + Math.sin(this.animationTimer) * 0.05;
    } else {
      this.heatIntensity = 0;
    }
  }

  /**
   * Smelt the entire deposited batch: one ingot per crushed shard, ejected
   * from the side nozzle.
   */
  private produceIngots(physicsWorld: any): void {
    const body = this.getBody();
    if (!body) return;

    const px = body.position.x;
    const py = body.position.y;
    const angle = body.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const labelParts = item.label.split(':'); // shard:iron_ore_crushed
      const matType = labelParts[1].replace('_crushed', '') as MaterialType;
      const props = Materials[matType] || Materials[MaterialType.DIRT];

      // Nozzle output position with slight vertical spread per ingot
      const dx = Furnace.NOZZLE_X;
      const dy = Furnace.NOZZLE_Y + (i - this.queue.length / 2) * 4;
      const ox = px + dx * cos - dy * sin;
      const oy = py + dx * sin + dy * cos;

      const ingotBody = physicsWorld.createIngotBody(ox, oy, matType, props.density);

      // Eject outward along the nozzle direction with slight upward arc
      const evx = 3 + Math.random() * 2;
      const evy = -0.5 - Math.random() * 1;
      Body.setVelocity(ingotBody, {
        x: evx * cos - evy * sin,
        y: evx * sin + evy * cos
      });
    }

    this.queue = [];
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
    // 1. Crucible body — U-shape with a right-side nozzle spout
    g.moveTo(-45, -60);
    g.lineTo(-45, 60);
    g.lineTo(45, 60);
    g.lineTo(45, -12);       // right wall up to nozzle bottom
    g.lineTo(75, -12);       // nozzle bottom (extends outward)
    g.lineTo(75, -48);       // nozzle tip
    g.lineTo(45, -48);       // nozzle top back to wall
    g.lineTo(45, -60);       // right wall upper
    g.closePath();
    g.fill({ color: 0x3E302A }); // Terracotta slate
    g.stroke({ color: 0x241A16, width: 3 });

    // 2. Molten liquid level (rises with fill)
    if (this.fillLevel > 0 || this.isSmelting) {
      const fillRatio = this.isSmelting ? 1.0 : this.fillLevel / Furnace.MAX_FILL;
      const liquidBottom = 47;  // interior floor (top of bottom wall)
      const liquidTop = liquidBottom - fillRatio * (liquidBottom - (-48));

      // Liquid body
      g.rect(-37, liquidTop, 74, liquidBottom - liquidTop);
      g.fill({ color: 0xFF6600, alpha: 0.85 });

      // Glowing surface line
      g.rect(-37, liquidTop, 74, 3);
      g.fill({ color: 0xFFD700, alpha: this.heatIntensity });

      // Molten metal filling the nozzle channel during smelting
      if (this.isSmelting) {
        g.rect(45, -36, 30, 24);
        g.fill({ color: 0xFF6600, alpha: 0.85 });
      }
    }

    // 3. Ambient heat glow
    if (this.heatIntensity > 0) {
      g.circle(0, 10, 30);
      g.fill({ color: 0xFF4500, alpha: this.heatIntensity * 0.15 });
    }
  }

  /**
   * Placement-preview outline (local space).
   */
  public static drawGhost(g: Graphics, color: number): void {
    const w = Furnace.WIDTH;
    const h = Furnace.HEIGHT;

    g.rect(-w / 2, -h / 2, w, h);
    g.fill({ color, alpha: 0.15 });
    g.stroke({ color, width: 2, alpha: 0.6 });

    // Inner crucible sketch
    g.moveTo(-w / 2 + 35, -h / 2 + 20);
    g.lineTo(-w / 2 + 35, h / 2 - 25);
    g.lineTo(w / 2 - 35, h / 2 - 25);
    g.lineTo(w / 2 - 35, -h / 2 + 20);
    g.stroke({ color, width: 1.5, alpha: 0.4 });

    // Nozzle indication on the right side
    g.moveTo(w / 2 - 5, -48);
    g.lineTo(w / 2 + 15, -48);
    g.moveTo(w / 2 - 5, -12);
    g.lineTo(w / 2 + 15, -12);
    g.stroke({ color, width: 1.5, alpha: 0.3 });
  }
}
