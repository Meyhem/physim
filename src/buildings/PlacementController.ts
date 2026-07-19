import { Camera } from '../core/Camera.ts';
import { InputManager } from '../input/InputManager.ts';
import { BuildingManager } from './BuildingManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';
import type { CustomShapeDef } from './CustomShape.ts';

export class PlacementController {
  public activePlacement: { type: 'building' | 'custom_shape'; targetId: string } | null = null;
  private placementAngle: number = 0;

  private camera: Camera;
  private inputManager: InputManager;
  private buildingManager: BuildingManager;
  private customShapeDefs: CustomShapeDef[];
  private terrainManager: TerrainManager | null = null;

  constructor(
    camera: Camera,
    inputManager: InputManager,
    buildingManager: BuildingManager,
    customShapeDefs: CustomShapeDef[],
  ) {
    this.camera = camera;
    this.inputManager = inputManager;
    this.buildingManager = buildingManager;
    this.customShapeDefs = customShapeDefs;
  }

  public startPlacement(type: 'building' | 'custom_shape', targetId: string): void {
    this.inputManager.isLeftDown = true;
    this.activePlacement = { type, targetId };
    this.placementAngle = 0;
    this.buildingManager.startPlacement(targetId);
  }

  public confirmPlacement(physicsWorld: PhysicsWorld, terrainManager: TerrainManager): void {
    if (!this.activePlacement) return;
    this.buildingManager.confirmPlacement(physicsWorld, this.customShapeDefs, terrainManager);
    this.activePlacement = null;
  }

  public cancelPlacement(): void {
    if (!this.activePlacement) return;
    this.buildingManager.cancelPlacement();
    this.activePlacement = null;
  }

  public isActive(): boolean {
    return this.activePlacement !== null;
  }

  /**
   * Called each frame when placement is active.
   * Returns true if placement was confirmed (on mouse release).
   */
  public update(dt: number, terrainManager: TerrainManager, physicsWorld: PhysicsWorld): boolean {
    if (!this.activePlacement) return false;

    this.terrainManager = terrainManager;
    // Rotate with Q/E
    if (this.inputManager.isKeyPressed('q')) {
      this.placementAngle -= dt * 2.5;
    }
    if (this.inputManager.isKeyPressed('e')) {
      this.placementAngle += dt * 2.5;
    }

    const worldPos = this.camera.screenToWorld(
      this.inputManager.mouseX,
      this.inputManager.mouseY,
    );
    this.buildingManager.updateGhost(
      worldPos.x,
      worldPos.y,
      this.placementAngle,
      terrainManager,
      this.customShapeDefs,
    );

    // Confirm placement on mouse release
    if (!this.inputManager.isLeftDown) {
      this.confirmPlacement(physicsWorld, this.terrainManager as TerrainManager);
      return true;
    }

    return false;
  }
}