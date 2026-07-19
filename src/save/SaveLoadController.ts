import { Camera } from '../core/Camera.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { SaveManager } from './SaveManager.ts';
import { Materials, MaterialType } from '../terrain/Materials.ts';
import { Crusher } from '../buildings/Crusher.ts';
import { Furnace } from '../buildings/Furnace.ts';
import { Miner } from '../buildings/Miner.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';
import { Body, Bodies, Composite } from 'matter-js';
import { CollisionCategories } from '../core/Constants.ts';

export class SaveLoadController {
  private camera: Camera;
  private terrainManager: TerrainManager;
  private buildingManager: BuildingManager;
  private physicsWorld: PhysicsWorld;
  private saveManager: SaveManager;
  private customShapeDefs: CustomShapeDef[];
  private onCustomShapesUpdated?: (defs: CustomShapeDef[]) => void;

  private autosaveTimer: number = 300;
  private isPaused: boolean = false;

  constructor(
    camera: Camera,
    terrainManager: TerrainManager,
    buildingManager: BuildingManager,
    physicsWorld: PhysicsWorld,
    saveManager: SaveManager,
    customShapeDefs: CustomShapeDef[],
    onCustomShapesUpdated?: (defs: CustomShapeDef[]) => void,
  ) {
    this.camera = camera;
    this.terrainManager = terrainManager;
    this.buildingManager = buildingManager;
    this.physicsWorld = physicsWorld;
    this.saveManager = saveManager;
    this.customShapeDefs = customShapeDefs;
    this.onCustomShapesUpdated = onCustomShapesUpdated;
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  public setOnCustomShapesUpdated(cb: (defs: CustomShapeDef[]) => void): void {
    this.onCustomShapesUpdated = cb;
  }

  public tickAutosave(dt: number): void {
    if (this.isPaused) return;
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 300;
      this.triggerAutosave();
    }
  }

  // --- Serialization ---

  public serializeState(): any {
    return {
      camera: this.serializeCamera(),
      terrain: this.terrainManager.getBlocks(),
      buildings: this.serializeBuildings(),
      customShapeDefs: this.customShapeDefs,
      customShapes: [],
      shards: this.serializeShards(),
    };
  }

  private serializeCamera(): any {
    return {
      x: this.camera.x,
      y: this.camera.y,
      zoom: this.camera.zoom,
    };
  }

  private serializeBuildings(): any[] {
    return this.buildingManager.getBuildings().map(b => {
      const body = b.getBody();
      return {
        id: b.id,
        type: b.type,
        x: body ? body.position.x : b.x,
        y: body ? body.position.y : b.y,
        angle: body ? body.angle : b.angle,
        materialType: (b as any).materialType ?? null,
      };
    });
  }

  private serializeShards(): any[] {
    return Array.from(this.physicsWorld.getShardBodies()).map(s => {
      const label = s.label;
      const isIngot = label.startsWith('ingot:');
      const radius = (s as any).circleRadius || 5;
      return {
        label,
        isIngot,
        radius,
        x: s.position.x,
        y: s.position.y,
        vx: s.velocity.x,
        vy: s.velocity.y,
        angle: s.angle,
      };
    });
  }

  // --- Deserialization ---

  public async deserializeState(state: any): Promise<void> {
    if (!state) return;

    const wasPaused = this.isPaused;
    this.isPaused = true;

    try {
      this.deserializeCamera(state.camera);
      this.physicsWorld.clearAll();
      this.buildingManager.clearAll(this.physicsWorld.world);
      this.deserializeTerrain(state.terrain);
      this.deserializeCustomShapeDefs(state.customShapeDefs);
      this.deserializeBuildings(state.buildings);
      this.deserializeLegacyCustomShapes(state.customShapes);
      this.deserializeShards(state.shards);

      console.log('PhySim state loaded successfully.');
    } catch (e) {
      console.error('Failed to load state', e);
    } finally {
      this.isPaused = wasPaused;
    }
  }

  private deserializeCamera(cameraState: any): void {
    if (!cameraState) return;
    this.camera.x = cameraState.x;
    this.camera.y = cameraState.y;
    this.camera.zoom = cameraState.zoom;
    (this.camera as any).targetX = cameraState.x;
    (this.camera as any).targetY = cameraState.y;
    (this.camera as any).targetZoom = cameraState.zoom;
  }

  private deserializeTerrain(terrainBlocks: any[]): void {
    if (!terrainBlocks) return;
    (this.terrainManager as any).blocks = terrainBlocks;
    for (const block of terrainBlocks) {
      const props = Materials[block.materialType as MaterialType] || Materials[MaterialType.DIRT];
      this.physicsWorld.createTerrainBody(block.id, block.points, props.density);
    }
  }

  private deserializeCustomShapeDefs(defs: any[]): void {
    if (!defs) return;

    this.customShapeDefs.length = 0;
    const migrated = defs.map((def: any) => {
      let result = def;
      if (!def.polygons && def.points) {
        result = this.migrateLegacyDef(def);
      }
      // Ensure solid/conveyor defs carry an editable `path` so the brush-edit
      // tool can RMB-drag their segments/vertices. Legacy saves produced one
      // CustomShape per click (no path) — infer a 2-vertex path from geometry.
      if (
        result &&
        !result.path &&
        (result.brushType === 'solid' || result.brushType === 'conveyor') &&
        result.polygons &&
        result.polygons.length > 0
      ) {
        const dirHint =
          result.brushType === 'conveyor' && result.conveyorSegments && result.conveyorSegments.length > 0
            ? result.conveyorSegments[0].dir
            : undefined;
        result.path = PolygonUtils.inferPathFromPolygons(result.polygons, result.thickness || 16, dirHint);
      }
      return result;
    });
    this.customShapeDefs.push(...migrated);

    if (this.onCustomShapesUpdated) {
      this.onCustomShapesUpdated(this.customShapeDefs);
    }
  }

  private migrateLegacyDef(def: any): any {
    const thickness = def.thickness || 16;
    const worldPolys = PolygonUtils.pathToPolygons(def.points, thickness);
    const startPt = def.points[0] || { x: 0, y: 0 };
    const relativePolys = worldPolys.map(poly =>
      poly.map((p: Point2D) => ({
        x: p.x - startPt.x,
        y: p.y - startPt.y,
      })),
    );

    let conveyorSegments;
    if (def.brushType === 'conveyor') {
      conveyorSegments = [];
      for (let i = 0; i < def.points.length - 1; i++) {
        const p1 = def.points[i];
        const p2 = def.points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.001) {
          const dir = { x: dx / len, y: dy / len };
          const segRect = PolygonUtils.getSegmentRectangle(p1, p2, thickness);
          const relPoly = segRect.map(p => ({ x: p.x - startPt.x, y: p.y - startPt.y }));
          conveyorSegments.push({ poly: relPoly, dir });
        }
      }
    }
    return {
      ...def,
      polygons: relativePolys,
      conveyorSegments,
    };
  }

  private deserializeBuildings(buildings: any[]): void {
    if (!buildings) return;

    for (const b of buildings) {
      const building = this.createBuildingFromState(b);
      if (building) {
        building.angle = b.angle;
        building.initPhysics(this.physicsWorld.world);
        this.buildingManager.getBuildings().push(building);
      }
    }
  }

  private createBuildingFromState(b: any): any {
    if (b.type === 'crusher') {
      return new Crusher(b.id, b.x, b.y);
    }
    if (b.type === 'furnace') {
      return new Furnace(b.id, b.x, b.y);
    }
    if (b.type === 'miner') {
      const mat = (b.materialType as MaterialType) || MaterialType.DIRT;
      return new Miner(b.id, b.x, b.y, this.terrainManager, mat);
    }
    const def = this.customShapeDefs.find(d => d.id === b.type);
    if (def) {
      return new CustomShape(b.id, def, b.x, b.y);
    }
    return null;
  }

  private deserializeLegacyCustomShapes(customShapes: any[]): void {
    if (!customShapes) return;

    for (const saved of customShapes) {
      if (this.buildingManager.getBuildings().some(b => b.id === saved.defId || b.id.includes(saved.defId))) {
        continue;
      }
      const def = this.customShapeDefs.find(d => d.id === saved.defId);
      if (def) {
        const buildingId = `custom_${def.brushType}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const building = new CustomShape(buildingId, def, saved.x, saved.y);
        building.angle = saved.angle;
        building.initPhysics(this.physicsWorld.world);
        this.buildingManager.getBuildings().push(building);
      }
    }
  }

  private deserializeShards(shards: any[]): void {
    if (!shards) return;

    for (const s of shards) {
      const labelParts = s.label.split(':');
      const matType = labelParts[1];
      const props = Materials[matType.replace('_crushed', '') as MaterialType] || Materials[MaterialType.DIRT];

      let body;
      if (s.isIngot) {
        body = Bodies.rectangle(s.x, s.y, 36, 14, {
          friction: 0.1,
          restitution: 0.2,
          density: props.density * 1.2,
          collisionFilter: {
            category: CollisionCategories.SHARDS,
            mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.TOOLS | CollisionCategories.BUILDINGS,
          },
        });
        body.label = s.label;
        Composite.add(this.physicsWorld.world, body);
        this.physicsWorld.getShardBodies().add(body);
      } else if (s.radius != null) {
        body = this.physicsWorld.createCircleShardBody(s.x, s.y, s.radius, matType, props.density);
      } else if (s.vertices) {
        body = this.physicsWorld.createShardBody(s.vertices, matType, props.density);
      }

      if (body) {
        Body.setPosition(body, { x: s.x, y: s.y });
        Body.setVelocity(body, { x: s.vx, y: s.vy });
        Body.setAngle(body, s.angle);
      }
    }
  }

  // --- Save / Load ---

  public async saveGame(slot: string, type: 'manual' | 'autosave', label: string): Promise<void> {
    const state = this.serializeState();
    await this.saveManager.saveState(slot, type, label, state);
    console.log(`Saved game to ${slot} (${label})`);
  }

  public async loadGame(slot: string): Promise<void> {
    const state = await this.saveManager.loadState(slot);
    if (state) {
      await this.deserializeState(state);
      console.log(`Loaded game from ${slot}`);
    } else {
      console.warn(`No save found in slot ${slot}`);
    }
  }

  public async triggerAutosave(): Promise<void> {
    const slot = await this.saveManager.getNextRollingSlot('autosave');
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await this.saveGame(slot, 'autosave', `Autosave ${timestampStr}`);
  }
}