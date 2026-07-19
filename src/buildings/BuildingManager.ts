import { World, Bounds } from 'matter-js';
import { Building } from './Building.ts';
import type { CustomShapeDef } from './CustomShape.ts';
import { BuildingRegistry } from './BuildingRegistry.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';

export class BuildingManager {
  private buildings: Building[] = [];
  private ghostBuilding: { type: string; x: number; y: number; angle: number } | null = null;
  private isValidPlacement: boolean = false;
  private registry: BuildingRegistry = new BuildingRegistry();

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

  public updateGhost(x: number, y: number, angle: number, terrainManager: TerrainManager, customShapeDefs: CustomShapeDef[]): void {
    if (!this.ghostBuilding) return;

    this.ghostBuilding.x = x;
    this.ghostBuilding.y = y;
    this.ghostBuilding.angle = angle;

    // Validate placement: check collisions with terrain and other buildings
    this.isValidPlacement = this.validatePlacement(x, y, this.ghostBuilding.type, terrainManager, customShapeDefs);
  }

  public cancelPlacement(): void {
    this.ghostBuilding = null;
  }

  /**
   * Confirms placement and creates the building.
   */
  public confirmPlacement(physicsWorld: PhysicsWorld, customShapeDefs: CustomShapeDef[], terrainManager: TerrainManager): Building | null {
    if (!this.ghostBuilding || !this.isValidPlacement) {
      this.ghostBuilding = null;
      return null;
    }

    const { type, x, y, angle } = this.ghostBuilding;
    const id = `${type}_${Date.now()}`;

    const def = this.registry.resolve(type, customShapeDefs);
    if (!def) {
      this.ghostBuilding = null;
      return null;
    }

    const building = def.create(id, x, y, { terrainManager, customShapeDefs });
    building.angle = angle;
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
    // 1. Update all buildings (timers, queue, conveyor forces)
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

  private getGhostBounds(ghost: { type: string; x: number; y: number }, customShapeDefs: CustomShapeDef[]) {
    const def = this.registry.resolve(ghost.type, customShapeDefs);
    if (def) {
      return def.ghostBounds(ghost.x, ghost.y);
    }
    return { minX: ghost.x - 40, maxX: ghost.x + 40, minY: ghost.y - 40, maxY: ghost.y + 40 };
  }

  private validatePlacement(x: number, y: number, type: string, terrainManager: TerrainManager, customShapeDefs: CustomShapeDef[]): boolean {
    const ghost = { type, x, y };
    const gBounds = this.getGhostBounds(ghost, customShapeDefs);

    const ghostBounds = {
      min: { x: gBounds.minX, y: gBounds.minY },
      max: { x: gBounds.maxX, y: gBounds.maxY }
    };

    // 1. Check intersection with existing buildings
    for (const b of this.buildings) {
      const bBounds = b.getBounds();
      const buildingBounds = {
        min: { x: bBounds.minX, y: bBounds.minY },
        max: { x: bBounds.maxX, y: bBounds.maxY }
      };

      if (Bounds.overlaps(ghostBounds, buildingBounds)) {
        return false; // Collides with building
      }
    }

    // 2. Check overlap with terrain static blocks
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
