import { Container, Graphics } from 'pixi.js';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { Building } from '../buildings/Building.ts';
import { Crusher } from '../buildings/Crusher.ts';
import { Furnace } from '../buildings/Furnace.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';

export class BuildingRenderer {
  private container: Container;
  private buildingGraphics: Map<string, Graphics> = new Map();
  private ghostGraphics: Graphics;
  private engine: any;

  constructor(container: Container, engine: any) {
    this.container = container;
    this.engine = engine;
    this.ghostGraphics = new Graphics();
    this.container.addChild(this.ghostGraphics);
  }

  /**
   * Syncs the rendering of placed buildings and ghost preview.
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

    // Update ghost preview
    this.updateGhost(buildingManager, customShapeDefs);
  }

  private drawBuilding(building: Building, graphics: Graphics): void {
    graphics.clear();

    // Position/rotate graphics container based on current physics body position/angle
    const body = building.getBody();
    if (body) {
      graphics.x = body.position.x;
      graphics.y = body.position.y;
      graphics.rotation = (building instanceof CustomShape) ? 0 : body.angle;
    } else {
      graphics.x = building.x;
      graphics.y = building.y;
      graphics.rotation = building.angle;
    }

    if (building instanceof Crusher) {
      // 1. Slanted funnels
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

      graphics.fill({ color: 0x42424F });
      graphics.stroke({ color: 0x2A2A35, width: 3 });

      // Outer Support/Gears
      graphics.rect(-25, 40, 10, 60); // left chute guide
      graphics.rect(15, 40, 10, 60);  // right chute guide
      graphics.fill({ color: 0x2D2D38 });
      graphics.stroke({ color: 0x1A1A24, width: 2 });

      // Draw wobbling crusher jaws
      const jawAngle = building.jawAngle;

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
        graphics.fill({ color: 0x8E251E }); // Rust red jaw
        graphics.stroke({ color: 0x4D1410, width: 2 });
      };

      // Draw left wobbling jaw
      drawRotatedRect(-21, -10, 12, 45, jawAngle);

      // Draw right wobbling jaw
      drawRotatedRect(21, -10, 12, 45, -jawAngle);

    } else if (building instanceof Furnace) {
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
      graphics.fill({ color: 0x3E302A }); // Terracotta slate
      graphics.stroke({ color: 0x241A16, width: 3 });

      // 2. Glow effect if active
      if (building.heatIntensity > 0) {
        graphics.circle(0, 10, 25);
        graphics.fill({ color: 0xFF4500, alpha: building.heatIntensity * 0.4 });

        // Heat core
        graphics.circle(0, 10, 12);
        graphics.fill({ color: 0xFFD700, alpha: building.heatIntensity * 0.7 });
      } else {
        // Cold dark interior
        graphics.circle(0, 10, 20);
        graphics.fill({ color: 0x1A120F });
      }
    } else if (building instanceof CustomShape) {
      const body = building.getBody();
      if (body) {
        const parts = body.parts.slice(1); // Skip parts[0] (compound convex hull)
        const strokeColor = building.def.brushType === 'solid' ? 0x7f8c8d : 0xf39c12;

        for (const part of parts) {
          const vertices = part.vertices;
          if (vertices.length > 0) {
            graphics.moveTo(vertices[0].x - body.position.x, vertices[0].y - body.position.y);
            for (let i = 1; i < vertices.length; i++) {
              graphics.lineTo(vertices[i].x - body.position.x, vertices[i].y - body.position.y);
            }
            graphics.closePath();
          }
        }
        graphics.fill({ color: strokeColor });
        graphics.stroke({ color: 0x111116, width: 1.5 });
      }
    }
  }

  private updateGhost(buildingManager: BuildingManager, customShapeDefs: CustomShapeDef[]): void {
    this.ghostGraphics.clear();

    // 1. If in brush tool and actively drawing, draw a preview line from lastPoint to mouse
    if (this.engine.activeTool === 'brush' && this.engine.brushIsDrawing) {
      const lastPoint = this.engine.brushLastPoint;
      const previewEnd = this.engine.brushPreviewEnd;
      if (lastPoint && previewEnd) {
        const brushType = this.engine.activeBrush;
        const thickness = this.engine.brushThickness;

        this.ghostGraphics.x = 0;
        this.ghostGraphics.y = 0;
        this.ghostGraphics.rotation = 0;

        const strokeColor = brushType === 'solid' ? 0x7f8c8d : 0xf39c12;

        // Translucent outline
        this.ghostGraphics.moveTo(lastPoint.x, lastPoint.y);
        this.ghostGraphics.lineTo(previewEnd.x, previewEnd.y);
        this.ghostGraphics.stroke({ color: strokeColor, width: thickness, alpha: 0.4, cap: 'round' });

        // Core line
        this.ghostGraphics.moveTo(lastPoint.x, lastPoint.y);
        this.ghostGraphics.lineTo(previewEnd.x, previewEnd.y);
        this.ghostGraphics.stroke({ color: strokeColor, width: 2, alpha: 0.8, cap: 'round' });

        // Conveyor direction arrow
        if (brushType === 'conveyor') {
          const dx = previewEnd.x - lastPoint.x;
          const dy = previewEnd.y - lastPoint.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 10) {
            const midX = (lastPoint.x + previewEnd.x) / 2;
            const midY = (lastPoint.y + previewEnd.y) / 2;
            const segmentAngle = Math.atan2(dy, dx);
            const cosA = Math.cos(segmentAngle);
            const sinA = Math.sin(segmentAngle);
            const pA = { x: midX, y: midY };
            const pB = { x: midX - 10 * cosA - 5 * sinA, y: midY - 10 * sinA + 5 * cosA };
            const pC = { x: midX - 10 * cosA + 5 * sinA, y: midY - 10 * sinA - 5 * cosA };
            this.ghostGraphics.moveTo(pA.x, pA.y);
            this.ghostGraphics.lineTo(pB.x, pB.y);
            this.ghostGraphics.lineTo(pC.x, pC.y);
            this.ghostGraphics.closePath();
            this.ghostGraphics.fill({ color: strokeColor, alpha: 0.8 });
          }
        }
      }
      return;
    }

    // 2. Otherwise, draw standard building ghost
    const ghost = buildingManager.getGhost();
    if (!ghost) return;

    this.ghostGraphics.x = ghost.x;
    this.ghostGraphics.y = ghost.y;
    this.ghostGraphics.rotation = ghost.angle;

    const isValid = buildingManager.getGhostValidity();
    const color = isValid ? 0x2ecc71 : 0xe74c3c;

    if (ghost.type === 'crusher' || ghost.type === 'furnace') {
      const w = ghost.type === 'crusher' ? 200 : 160;
      const h = ghost.type === 'crusher' ? 200 : 160;

      this.ghostGraphics.rect(-w / 2, -h / 2, w, h);
      this.ghostGraphics.fill({ color, alpha: 0.15 });
      this.ghostGraphics.stroke({ color, width: 2, alpha: 0.6 });

      if (ghost.type === 'crusher') {
        this.ghostGraphics.moveTo(-w / 2, -h / 2 + 20);
        this.ghostGraphics.lineTo(-20, 0);
        this.ghostGraphics.lineTo(-25, h / 2 - 20);

        this.ghostGraphics.moveTo(w / 2, -h / 2 + 20);
        this.ghostGraphics.lineTo(20, 0);
        this.ghostGraphics.lineTo(25, h / 2 - 20);
        this.ghostGraphics.stroke({ color, width: 1.5, alpha: 0.4 });
      } else {
        this.ghostGraphics.moveTo(-w / 2 + 35, -h / 2 + 20);
        this.ghostGraphics.lineTo(-w / 2 + 35, h / 2 - 25);
        this.ghostGraphics.lineTo(w / 2 - 35, h / 2 - 25);
        this.ghostGraphics.lineTo(w / 2 - 35, -h / 2 + 20);
        this.ghostGraphics.stroke({ color, width: 1.5, alpha: 0.4 });
      }
    } else {
      const def = customShapeDefs.find(d => d.id === ghost.type);
      if (def) {
        const pts = def.polygons[0] || [];
        if (pts.length < 2) return;
        this.ghostGraphics.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          this.ghostGraphics.lineTo(pts[i].x, pts[i].y);
        }
        this.ghostGraphics.stroke({ color, width: def.thickness, alpha: 0.6 });
      }
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
