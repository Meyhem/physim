import { Container, Graphics } from 'pixi.js';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { Building } from '../buildings/Building.ts';
import { BuildingRegistry } from '../buildings/BuildingRegistry.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';

/**
 * Syncs Pixi Graphics for placed buildings. Each building draws itself via its
 * own `draw()` method; this class only manages the Graphics lifecycle and the
 * transform sync. Placement-ghost artwork is delegated to the building
 * registry's per-type `drawGhost`.
 */
export class BuildingRenderer {
  private container: Container;
  private buildingGraphics: Map<string, Graphics> = new Map();
  private ghostGraphics: Graphics;
  private registry: BuildingRegistry = new BuildingRegistry();

  constructor(container: Container) {
    this.container = container;
    this.ghostGraphics = new Graphics();
    this.container.addChild(this.ghostGraphics);
  }

  /**
   * Syncs the rendering of placed buildings and the placement ghost.
   */
  public update(buildingManager: BuildingManager, customShapeDefs: CustomShapeDef[]): void {
    const buildings = buildingManager.getBuildings();
    const activeIds = new Set<string>();

    for (const building of buildings) {
      activeIds.add(building.id);

      let graphics = this.buildingGraphics.get(building.id);
      if (!graphics) {
        graphics = new Graphics();
        this.container.addChild(graphics);
        this.buildingGraphics.set(building.id, graphics);
      }

      this.drawBuilding(building, graphics);
    }

    // Clean up removed buildings
    for (const [id, graphics] of this.buildingGraphics.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(graphics);
        graphics.destroy();
        this.buildingGraphics.delete(id);
      }
    }

    this.updateGhost(buildingManager, customShapeDefs);
  }

  private drawBuilding(building: Building, graphics: Graphics): void {
    graphics.clear();

    // Position/rotate graphics container based on current physics body position/angle
    const { x, y, angle } = building.getWorldTransform();
    graphics.x = x;
    graphics.y = y;
    graphics.rotation = angle;

    building.draw(graphics);
  }

  private updateGhost(buildingManager: BuildingManager, customShapeDefs: CustomShapeDef[]): void {
    this.ghostGraphics.clear();

    const ghost = buildingManager.getGhost();
    if (!ghost) return;

    this.ghostGraphics.x = ghost.x;
    this.ghostGraphics.y = ghost.y;
    this.ghostGraphics.rotation = ghost.angle;

    const isValid = buildingManager.getGhostValidity();
    const color = isValid ? 0x2ecc71 : 0xe74c3c;

    const def = this.registry.resolve(ghost.type, customShapeDefs);
    if (def) {
      def.drawGhost(this.ghostGraphics, color);
    }
  }

  public clearGhost(): void {
    this.ghostGraphics.clear();
  }

  public clear(): void {
    for (const graphics of this.buildingGraphics.values()) {
      graphics.destroy();
    }
    this.buildingGraphics.clear();
    this.ghostGraphics.clear();
  }
}
