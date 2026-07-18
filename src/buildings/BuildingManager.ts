import { World, Bounds } from 'matter-js';
import { Building } from './Building.ts';
import { Crusher } from './Crusher.ts';
import { Furnace } from './Furnace.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';

export class BuildingManager {
  private buildings: Building[] = [];
  private ghostBuilding: { type: string; x: number; y: number; angle: number } | null = null;
  private isValidPlacement: boolean = false;

  constructor() {}

  public getBuildings(): Building[] {
    return this.buildings;
  }

  public getGhost(): typeof this.ghostBuilding {
    return this.ghostBuilding;
  }

  public getGhostValidity(): boolean {
    return this.isValidPlacement;
  }

  public startPlacement(type: string): void {
    this.ghostBuilding = { type, x: 0, y: 0, angle: 0 };
    this.isValidPlacement = false;
  }

  public updateGhost(x: number, y: number, angle: number, terrainManager: TerrainManager): void {
    if (!this.ghostBuilding) return;

    this.ghostBuilding.x = x;
    this.ghostBuilding.y = y;
    this.ghostBuilding.angle = angle;

    // Validate placement: check collisions with terrain and other buildings
    this.isValidPlacement = this.validatePlacement(x, y, this.ghostBuilding.type, terrainManager);
  }

  public cancelPlacement(): void {
    this.ghostBuilding = null;
  }

  /**
   * Confirms placement and creates the building.
   */
  public confirmPlacement(physicsWorld: PhysicsWorld): Building | null {
    if (!this.ghostBuilding || !this.isValidPlacement) {
      this.ghostBuilding = null;
      return null;
    }

    const { type, x, y } = this.ghostBuilding;
    const id = `${type}_${Date.now()}`;
    
    let building: Building;
    if (type === 'crusher') {
      building = new Crusher(id, x, y);
    } else {
      building = new Furnace(id, x, y);
    }

    building.initPhysics(physicsWorld.world);
    this.buildings.push(building);

    this.ghostBuilding = null;
    return building;
  }

  public removeBuilding(id: string, world: World): void {
    const building = this.buildings.find(b => b.id === id);
    if (building) {
      building.destroyPhysics(world);
      this.buildings = this.buildings.filter(b => b.id !== id);
    }
  }

  public update(dt: number, physicsWorld: PhysicsWorld): void {
    // 1. Update all buildings (timers, queue)
    for (const building of this.buildings) {
      building.update(dt, physicsWorld);
    }

    // 2. Perform sensor collision checks with shards
    const shards = physicsWorld.getShardBodies();
    const removedBodies: any[] = [];

    for (const building of this.buildings) {
      const sensor = building.getSensorBody();
      if (!sensor) continue;

      for (const shard of shards) {
        if (shard.label === 'remove_queued') continue;

        // Check AABB bounds intersection first (fast filter)
        if (Bounds.overlaps(sensor.bounds, shard.bounds)) {
          // Trigger collision detection
          building.checkSensorCollision(shard);
          
          if (shard.label === 'remove_queued') {
            removedBodies.push(shard);
          }
        }
      }
    }

    // Physically delete shards that entered sensors
    for (const shard of removedBodies) {
      physicsWorld.removeBody(shard);
    }
  }

  private validatePlacement(x: number, y: number, type: string, terrainManager: TerrainManager): boolean {
    const w = type === 'crusher' ? 200 : 160;
    const h = type === 'crusher' ? 200 : 160;

    const ghostBounds = {
      min: { x: x - w / 2, y: y - h / 2 },
      max: { x: x + w / 2, y: y + h / 2 }
    };

    // 1. Check intersection with existing buildings
    for (const b of this.buildings) {
      const bBounds = {
        min: { x: b.x - b.width / 2, y: b.y - b.height / 2 },
        max: { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      };

      if (Bounds.overlaps(ghostBounds, bBounds)) {
        return false; // Collides with building
      }
    }

    // 2. Check overlap with terrain static blocks
    // Since terrain blocks are solid polygons, we check if the ghost rect overlaps with any terrain block bounding box
    const terrainBlocks = terrainManager.getBlocks();
    for (const block of terrainBlocks) {
      let bMinX = Infinity, bMaxX = -Infinity;
      let bMinY = Infinity, bMaxY = -Infinity;

      for (const p of block.points) {
        if (p.x < bMinX) bMinX = p.x;
        if (p.x > bMaxX) bMaxX = p.x;
        if (p.y < bMinY) bMinY = p.y;
        if (p.y > bMaxY) bMaxY = p.y;
      }

      const blockBounds = {
        min: { x: bMinX, y: bMinY },
        max: { x: bMaxX, y: bMaxY }
      };

      if (Bounds.overlaps(ghostBounds, blockBounds)) {
        // Double check: if it intersects terrain, we don't allow placing buildings inside/overlapping terrain solid blocks
        return false;
      }
    }

    return true; // No collision found
  }

  public clearAll(world: World): void {
    for (const b of this.buildings) {
      b.destroyPhysics(world);
    }
    this.buildings = [];
    this.ghostBuilding = null;
  }
}
