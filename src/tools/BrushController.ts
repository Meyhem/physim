import { TerrainManager } from '../terrain/TerrainManager.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

export class BrushController {
  public activeBrush: 'solid' | 'conveyor' | null = null;
  public brushThickness: number = 40;
  public isDrawing: boolean = false;
  public firstPoint: Point2D | null = null;
  public lastPoint: Point2D | null = null;

  private terrainManager: TerrainManager;
  private buildingManager: BuildingManager;
  private physicsWorld: PhysicsWorld;
  private customShapeDefs: CustomShapeDef[];
  private onCustomShapesUpdated?: (defs: CustomShapeDef[]) => void;

  constructor(
    terrainManager: TerrainManager,
    buildingManager: BuildingManager,
    physicsWorld: PhysicsWorld,
    customShapeDefs: CustomShapeDef[],
    onCustomShapesUpdated?: (defs: CustomShapeDef[]) => void,
  ) {
    this.terrainManager = terrainManager;
    this.buildingManager = buildingManager;
    this.physicsWorld = physicsWorld;
    this.customShapeDefs = customShapeDefs;
    this.onCustomShapesUpdated = onCustomShapesUpdated;
  }

  public setOnCustomShapesUpdated(cb: (defs: CustomShapeDef[]) => void): void {
    this.onCustomShapesUpdated = cb;
  }

  /**
   * Begin a new path at the given world position.
   */
  public startPath(worldPos: Point2D): void {
    this.isDrawing = true;
    this.firstPoint = { x: worldPos.x, y: worldPos.y };
    this.lastPoint = { x: worldPos.x, y: worldPos.y };
  }

  /**
   * Place a segment from lastPoint to worldPos, creating a shape immediately.
   */
  public placeSegment(worldPos: Point2D): void {
    if (!this.lastPoint) return;

    const p1 = this.lastPoint;
    const p2 = worldPos;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return; // Too short, ignore

    // Generate segment rectangle + joint circle to fill gaps at corners
    const segRect = PolygonUtils.getSegmentRectangle(p1, p2, this.brushThickness);
    const jointCircle = PolygonUtils.getCirclePolygon(p1, this.brushThickness / 2);

    // Union the segment rect with the joint circle for a seamless connection
    const segPolys = PolygonUtils.unionList([segRect, jointCircle]);

    // Clip against terrain
    let clippedPolys = segPolys;
    const terrainBlocks = this.terrainManager.getBlocks();
    for (const block of terrainBlocks) {
      const tempClipped: Point2D[][] = [];
      for (const poly of clippedPolys) {
        const diff = PolygonUtils.difference(poly, block.points);
        tempClipped.push(...diff);
      }
      clippedPolys = tempClipped;
    }
    clippedPolys = clippedPolys.filter(poly => PolygonUtils.getArea(poly) > 10);

    if (clippedPolys.length === 0) {
      // Segment is entirely inside terrain, still advance lastPoint
      this.lastPoint = { x: worldPos.x, y: worldPos.y };
      return;
    }

    // Generate conveyor segments if applicable
    const conveyorSegments = this.generateConveyorSegmentsForRect(p1, p2, segRect);

    // Create the custom shape (each segment overlays existing ones; no merge)
    this.createCustomShape(clippedPolys, conveyorSegments);

    // Advance lastPoint
    this.lastPoint = { x: worldPos.x, y: worldPos.y };
  }

  /**
   * Finish the current path.
   */
  public finishPath(): void {
    this.isDrawing = false;
    this.firstPoint = null;
    this.lastPoint = null;
  }

  /**
   * Cancel the current path (segments already placed remain).
   */
  public cancelPath(): void {
    this.isDrawing = false;
    this.firstPoint = null;
    this.lastPoint = null;
  }

  // --- Private helpers ---

  private generateConveyorSegmentsForRect(
    p1: Point2D,
    p2: Point2D,
    segRect: Point2D[],
  ): { poly: Point2D[]; dir: Point2D }[] {
    if (this.activeBrush !== 'conveyor') return [];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return [];

    const dir = { x: dx / len, y: dy / len };

    let clippedSegs = [segRect];
    const terrainBlocks = this.terrainManager.getBlocks();
    for (const block of terrainBlocks) {
      clippedSegs = clippedSegs.flatMap(poly =>
        PolygonUtils.difference(poly, block.points),
      );
    }
    clippedSegs = clippedSegs.filter(poly => PolygonUtils.getArea(poly) > 5);

    return clippedSegs.map(poly => ({ poly, dir }));
  }

  private createCustomShape(
    finalWorldPolys: Point2D[][],
    finalWorldConveyorSegments: { poly: Point2D[]; dir: Point2D }[],
  ): void {
    const allVertices = finalWorldPolys.flat();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const v of allVertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    const finalCentroid = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };

    const relativePolys = finalWorldPolys.map(poly =>
      poly.map((p: Point2D) => ({
        x: p.x - finalCentroid.x,
        y: p.y - finalCentroid.y,
      })),
    );

    const relativeConveyorSegments = finalWorldConveyorSegments.map(seg => ({
      poly: seg.poly.map((p: Point2D) => ({
        x: p.x - finalCentroid.x,
        y: p.y - finalCentroid.y,
      })),
      dir: seg.dir,
    }));

    const brushType = this.activeBrush!;
    const defId = `custom_${brushType}_${Date.now()}`;
    const defName = `${brushType === 'solid' ? 'Solid Wall' : 'Conveyor'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const def: CustomShapeDef = {
      id: defId,
      name: defName,
      polygons: relativePolys,
      brushType,
      thickness: this.brushThickness,
      conveyorSegments: relativeConveyorSegments,
    };

    this.customShapeDefs.push(def);

    const buildingId = `${defId}_${Date.now()}`;
    const customShape = new CustomShape(buildingId, def, finalCentroid.x, finalCentroid.y);
    customShape.initPhysics(this.physicsWorld.world);
    this.buildingManager.getBuildings().push(customShape);

    if (this.onCustomShapesUpdated) {
      this.onCustomShapesUpdated(this.customShapeDefs);
    }
  }
}