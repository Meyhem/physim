import { Body, Bodies, Composite, World } from 'matter-js';
import { Building } from './Building.ts';
import { CollisionCategories } from '../core/Constants.ts';
import { Materials } from '../terrain/Materials.ts';
import { MaterialType } from '../terrain/Materials.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';

export class Miner extends Building {
  public drillAngle: number = 0; // For spinning drill animation
  private materialType: MaterialType;
  private terrainManager: TerrainManager;
  private timer: number = 0;
  private readonly productionInterval: number = 1.5;
  private readonly shaftLength: number = 120;

  constructor(id: string, x: number, y: number, terrainManager: TerrainManager, materialType?: MaterialType) {
    super(id, 'miner', x, y, 160, 160); // 1.6m wide, 1.6m tall
    this.terrainManager = terrainManager;
    this.materialType = materialType || MaterialType.DIRT;
  }

  public getMaterialType(): MaterialType {
    return this.materialType;
  }

  public initPhysics(world: World): void {
    // Solid box body the miner rests on terrain with
    const main = Bodies.rectangle(this.x, this.y, this.width, this.height, {
      friction: 0.4,
      density: 0.05,
      collisionFilter: {
        category: CollisionCategories.BUILDINGS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.BUILDINGS | CollisionCategories.TOOLS
      }
    });
    main.label = `building:miner:${this.id}`;

    Body.setStatic(main, false);
    Body.setAngle(main, this.angle);

    this.bodies = [main];
    Composite.add(world, main);
  }

  protected onItemEnter(_body: Body): void {
    // Miner is a producer only; it has no intake sensor.
  }

  /**
   * World-space position of the shaft tip (bottom of the miner, extended down).
   */
  private getShaftTip(): { x: number; y: number } {
    const body = this.getBody();
    const px = body ? body.position.x : this.x;
    const py = body ? body.position.y : this.y;
    const angle = body ? body.angle : this.angle;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Shaft extends straight down from the bottom of the chassis in local space
    const localY = this.height / 2 + this.shaftLength;
    return {
      x: px - localY * sin,
      y: py + localY * cos
    };
  }

  public update(dt: number, physicsWorld: any): void {
    this.drillAngle += dt * 6;

    // Determine the material from whatever terrain the shaft touches
    const tip = this.getShaftTip();
    const block = this.terrainManager.getMaterialAtPoint(tip.x, tip.y)
      || this.terrainManager.getMaterialBelow(this.x, this.y);
    if (block) {
      this.materialType = block.materialType;
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.productionInterval;

    // Eject a fresh shard of the mounted terrain material from the top
    const body = this.getBody();
    const px = body ? body.position.x : this.x;
    const py = body ? body.position.y : this.y;
    const angle = body ? body.angle : this.angle;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Spawn just above the top face of the miner
    const dx = (Math.random() - 0.5) * 10;
    const dy = this.height / 2 + 12;
    const ox = px + dx * cos - dy * sin;
    const oy = py + dx * sin + dy * cos;

    const props = Materials[this.materialType] || Materials[MaterialType.DIRT];
    const shardBody = physicsWorld.createCircleShardBody(ox, oy, 6, this.materialType, props.density);

    // Gentle upward + slight sideways ejection (rotated by building angle)
    const evx = (Math.random() - 0.5) * 1.0;
    const evy = -1.5 - Math.random() * 1.0;
    Body.setVelocity(shardBody, {
      x: evx * cos - evy * sin,
      y: evx * sin + evy * cos
    });
  }

  public getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const body = this.getBody();
    const px = body ? body.position.x : this.x;
    const py = body ? body.position.y : this.y;
    return {
      minX: px - this.width / 2,
      maxX: px + this.width / 2,
      minY: py - this.height / 2,
      maxY: py + this.height / 2 + this.shaftLength
    };
  }
}
