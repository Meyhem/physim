import { TerrainManager } from '../terrain/TerrainManager.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { CustomShapeDef, FlowSegment } from '../buildings/CustomShape.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

export class BrushController {
  public activeBrush: 'solid' | 'conveyor' | 'pipe' | null = null;
  public brushThickness: number = 40;
  public isDrawing: boolean = false;
  public lastPoint: Point2D | null = null;
  private pathPoints: Point2D[] = [];

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
    this.lastPoint = { x: worldPos.x, y: worldPos.y };
    this.pathPoints = [{ x: worldPos.x, y: worldPos.y }];
  }

  /**
   * Append a vertex to the current path. For solid/conveyor, the path is
   * accumulated and built into a single CustomShape on finishPath; for pipe,
   * the legacy whole-tube build is used.
   */
  public placeSegment(worldPos: Point2D): void {
    if (!this.lastPoint) return;

    const last = this.pathPoints[this.pathPoints.length - 1];
    const d = Math.hypot(worldPos.x - last.x, worldPos.y - last.y);
    if (d >= 2) {
      this.pathPoints.push({ x: worldPos.x, y: worldPos.y });
    }
    this.lastPoint = { x: worldPos.x, y: worldPos.y };
  }

  /**
   * Finish the current path: build one CustomShape from the accumulated
   * path (solid/conveyor) or one continuous pipe tube.
   */
  public finishPath(): void {
    if (this.activeBrush === 'pipe') {
      this.buildPipePath();
    } else if (this.activeBrush === 'solid' || this.activeBrush === 'conveyor') {
      this.buildSolidConveyorPath();
    }
    this.isDrawing = false;
    this.lastPoint = null;
    this.pathPoints = [];
  }

  /**
   * Cancel the current path (any segments already placed remain).
   */
  public cancelPath(): void {
    this.isDrawing = false;
    this.lastPoint = null;
    this.pathPoints = [];
  }

  public getPathPoints(): Point2D[] {
    return this.pathPoints;
  }

  // --- Private helpers ---

  /**
   * Builds one CustomShape from the accumulated solid/conveyor path: unions
   * the per-segment rectangles + joint circles into a single polygon (or a
   * small set of polygons when terrain cuts it), then stores the user path
   * alongside so it can be edited later.
   */
  private buildSolidConveyorPath(): void {
    const pts = this.pathPoints;
    if (pts.length < 2) return;

    const thickness = this.brushThickness;
    const terrainBlocks = this.terrainManager.getBlocks();

    // 1. Build the world-space tube polygon (rect + joint circles, unioned).
    let polys = PolygonUtils.pathToPolygons(pts, thickness);
    polys = this.clipAgainstTerrain(polys, terrainBlocks);
    polys = polys.filter(poly => PolygonUtils.getArea(poly) > 5);
    if (polys.length === 0) return;

    // 2. Build per-segment conveyor flow regions (world coords).
    let flowSegments: FlowSegment[] = [];
    if (this.activeBrush === 'conveyor') {
      const segs = PolygonUtils.buildConveyorSegmentsFromPath(pts, thickness);
      for (const seg of segs) {
        let clipped = [seg.poly];
        for (const block of terrainBlocks) {
          clipped = clipped.flatMap(p => PolygonUtils.difference(p, block.points));
        }
        for (const poly of clipped) {
          if (PolygonUtils.getArea(poly) > 5) {
            flowSegments.push({ poly, dir: seg.dir });
          }
        }
      }
      if (flowSegments.length === 0) return;
    }

    this.createCustomShape(polys, flowSegments, pts);
  }

  /**
   * Builds one continuous pipe from the accumulated path: two wall bands
   * (offset centerlines stroked with a small thickness) plus interior-channel
   * flow segments for the suction/propulsion forces.
   */
  private buildPipePath(): void {
    const pts = this.pathPoints;
    if (pts.length < 2) return;

    const thickness = this.brushThickness;
    const half = thickness / 2;
    const wallThickness = Math.max(4, thickness * 0.2);
    const innerHalf = half - wallThickness;
    const terrainBlocks = this.terrainManager.getBlocks();

    // Build the whole pipe as ONE shape from two continuous wall ribbons:
    // offset the centerline to the inner/outer edges on each side. The inner
    // edge is clamped so bends never spike into the channel (obstruction-free),
    // while the outer edge stays smooth so the tube is sealed and connected.
    const outerLeft = PolygonUtils.offsetPolyline(pts, half, false);
    const innerLeft = PolygonUtils.offsetPolyline(pts, innerHalf, true);
    const outerRight = PolygonUtils.offsetPolyline(pts, -half, false);
    const innerRight = PolygonUtils.offsetPolyline(pts, -innerHalf, true);

    const leftWall = [...outerLeft, ...innerLeft.slice().reverse()];
    const rightWall = [...outerRight, ...innerRight.slice().reverse()];

    let wallPolys = this.clipAgainstTerrain([leftWall, rightWall], terrainBlocks);
    wallPolys = wallPolys.filter(poly => PolygonUtils.getArea(poly) > 5);
    if (wallPolys.length === 0) return;

    // Interior channel (force region), one segment per original path segment.
    const flowSegments: FlowSegment[] = [];
    const mouth = { x: pts[0].x, y: pts[0].y };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const tube = PolygonUtils.getSegmentTube(a, b, thickness, wallThickness, half);

      let channels = [tube.channel];
      channels = this.clipAgainstTerrain(channels, terrainBlocks);
      channels = channels.filter(poly => PolygonUtils.getArea(poly) > 5);

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const dir = len > 0.001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
      const isIntake = i === 0;

      for (const ch of channels) {
        flowSegments.push({ poly: ch, dir, isIntake, mouth });
      }
    }

    if (flowSegments.length === 0) return;

    this.createCustomShape(wallPolys, flowSegments, pts);
  }

  private clipAgainstTerrain(polys: Point2D[][], terrainBlocks: { points: Point2D[] }[]): Point2D[][] {
    let result: Point2D[][] = [];
    for (const poly of polys) {
      let clipped = [poly];
      for (const block of terrainBlocks) {
        clipped = clipped.flatMap(p => PolygonUtils.difference(p, block.points));
      }
      result.push(...clipped);
    }
    return result;
  }

  private createCustomShape(
    finalWorldPolys: Point2D[][],
    finalWorldFlowSegments: FlowSegment[],
    finalWorldPath: Point2D[],
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

    const relativeFlowSegments = finalWorldFlowSegments.map(seg => ({
      poly: seg.poly.map((p: Point2D) => ({
        x: p.x - finalCentroid.x,
        y: p.y - finalCentroid.y,
      })),
      dir: seg.dir,
      isIntake: seg.isIntake,
      mouth: seg.mouth
        ? { x: seg.mouth.x - finalCentroid.x, y: seg.mouth.y - finalCentroid.y }
        : undefined,
    }));

    const relativePath = finalWorldPath.map(p => ({
      x: p.x - finalCentroid.x,
      y: p.y - finalCentroid.y,
    }));

    const brushType = this.activeBrush!;
    const defId = `custom_${brushType}_${Date.now()}`;
    const defName = `${brushType === 'solid' ? 'Solid Wall' : brushType === 'conveyor' ? 'Conveyor' : 'Pipe'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const def: CustomShapeDef = {
      id: defId,
      name: defName,
      polygons: relativePolys,
      brushType,
      thickness: this.brushThickness,
      conveyorSegments: brushType === 'conveyor' ? relativeFlowSegments : undefined,
      flowSegments: brushType === 'pipe' ? relativeFlowSegments : undefined,
      path: relativePath,
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