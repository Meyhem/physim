import { Container, Graphics } from 'pixi.js';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { Building } from '../buildings/Building.ts';
import { Crusher } from '../buildings/Crusher.ts';
import { Furnace } from '../buildings/Furnace.ts';

export class BuildingRenderer {
  private container: Container;
  private buildingGraphics: Map<string, Graphics> = new Map();
  private ghostGraphics: Graphics;

  constructor(container: Container) {
    this.container = container;
    this.ghostGraphics = new Graphics();
    this.container.addChild(this.ghostGraphics);
  }

  /**
   * Syncs the rendering of placed buildings and ghost preview.
   */
  public update(buildingManager: BuildingManager): void {
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

    // Update ghost preview
    this.updateGhost(buildingManager);
  }

  private drawBuilding(building: Building, graphics: Graphics): void {
    graphics.clear();
    
    // Position/rotate graphics container
    graphics.x = building.x;
    graphics.y = building.y;
    graphics.rotation = building.angle;

    if (building instanceof Crusher) {
      // 1. Slanted funnels
      graphics.fill({ color: 0x42424F });
      graphics.stroke({ color: 0x2A2A35, width: 3 });
      
      // Left funnel slab
      graphics.moveTo(-100, -80);
      graphics.lineTo(-20, 0);
      graphics.lineTo(-20, 20);
      graphics.lineTo(-100, -60);
      graphics.closePath();

      // Right funnel slab
      graphics.moveTo(100, -80);
      graphics.lineTo(20, 0);
      graphics.lineTo(20, 20);
      graphics.lineTo(100, -60);
      graphics.closePath();

      // Outer Support/Gears
      graphics.fill({ color: 0x2D2D38 });
      graphics.stroke({ color: 0x1A1A24, width: 2 });
      
      graphics.drawRect(-25, 40, 10, 60); // left chute guide
      graphics.drawRect(15, 40, 10, 60);  // right chute guide

      // Draw wobbling crusher jaws
      graphics.fill({ color: 0x8E251E }); // Rust red jaw
      graphics.stroke({ color: 0x4D1410, width: 2 });
      
      const jawAngle = building.jawAngle;
      
      // Helper function to draw a rotated rectangle
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

        graphics.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          graphics.lineTo(pts[i].x, pts[i].y);
        }
        graphics.closePath();
      };

      // Draw left wobbling jaw
      drawRotatedRect(-21, -10, 12, 45, jawAngle);
      
      // Draw right wobbling jaw
      drawRotatedRect(21, -10, 12, 45, -jawAngle);

    } else if (building instanceof Furnace) {
      // 1. Furnace outer chamber
      graphics.fill({ color: 0x3E302A }); // Terracotta slate
      graphics.stroke({ color: 0x241A16, width: 3 });
      
      // Draw U-shape box
      graphics.moveTo(-45, -60);
      graphics.lineTo(-45, 60);
      graphics.lineTo(45, 60);
      graphics.lineTo(45, -60);
      graphics.lineTo(30, -60);
      graphics.lineTo(30, 45);
      graphics.lineTo(-30, 45);
      graphics.lineTo(-30, -60);
      graphics.closePath();

      // 2. Glow effect if active
      if (building.heatIntensity > 0) {
        graphics.fill({ color: 0xFF4500, alpha: building.heatIntensity * 0.4 });
        graphics.drawCircle(0, 10, 25);
        
        // Heat core core
        graphics.fill({ color: 0xFFD700, alpha: building.heatIntensity * 0.7 });
        graphics.drawCircle(0, 10, 12);
      } else {
        // Cold dark interior
        graphics.fill({ color: 0x1A120F });
        graphics.drawCircle(0, 10, 20);
      }
    }
  }

  private updateGhost(buildingManager: BuildingManager): void {
    const ghost = buildingManager.getGhost();
    this.ghostGraphics.clear();

    if (!ghost) return;

    this.ghostGraphics.x = ghost.x;
    this.ghostGraphics.y = ghost.y;
    this.ghostGraphics.rotation = ghost.angle;

    const isValid = buildingManager.getGhostValidity();
    
    // Choose color: translucent green for valid, translucent red for invalid
    const color = isValid ? 0x2ecc71 : 0xe74c3c;
    
    const w = ghost.type === 'crusher' ? 200 : 160;
    const h = ghost.type === 'crusher' ? 200 : 160;

    // Draw dashed layout box for ghost building preview
    this.ghostGraphics.fill({ color, alpha: 0.15 });
    this.ghostGraphics.stroke({ color, width: 2, alpha: 0.6 });
    
    this.ghostGraphics.drawRect(-w / 2, -h / 2, w, h);
    
    // Draw internal details of what building we are placing
    if (ghost.type === 'crusher') {
      // Funnel preview
      this.ghostGraphics.moveTo(-w / 2, -h / 2 + 20);
      this.ghostGraphics.lineTo(-20, 0);
      this.ghostGraphics.lineTo(-25, h / 2 - 20);
      
      this.ghostGraphics.moveTo(w / 2, -h / 2 + 20);
      this.ghostGraphics.lineTo(20, 0);
      this.ghostGraphics.lineTo(25, h / 2 - 20);
    } else {
      // U-shape oven preview
      this.ghostGraphics.moveTo(-w / 2 + 35, -h / 2 + 20);
      this.ghostGraphics.lineTo(-w / 2 + 35, h / 2 - 25);
      this.ghostGraphics.lineTo(w / 2 - 35, h / 2 - 25);
      this.ghostGraphics.lineTo(w / 2 - 35, -h / 2 + 20);
    }
  }

  public clear(): void {
    for (const graphics of this.buildingGraphics.values()) {
      graphics.destroy();
    }
    this.buildingGraphics.clear();
    this.ghostGraphics.clear();
  }
}
