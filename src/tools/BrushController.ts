import { TerrainManager } from '../terrain/TerrainManager.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';
import type { BrushGhostProvider } from '../input/DragController.ts';

export class BrushController implements BrushGhostProvider {
  public activeBrush: 'solid' | 'conveyor' | null = null;
  public ghostPaths: Point2D[][] = [];
  public ghostPosition: Point2D = { x: 0, y: 0 };
  public ghostAngle: number = 0;
  public ghostThickness: number = 40;
  public isDrawingGhost: boolean = false;
  public draggingGhost: boolean = false;
  public ghostDragOffset: Point2D = { x: 0, y: 0 };
  public currentStroke: Point2D[] = [];
  public strokeCount: number = 0;

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

  public hasStrokeData(): boolean {
    return this.ghostPaths.length > 0 || this.currentStroke.length >= 2;
  }

  public getWorldStrokes(): Point2D[][] {
    const ox = this.ghostPosition.x;
    const oy = this.ghostPosition.y;
    return this.ghostPaths.map(stroke =>
      stroke.map(p => ({ x: p.x + ox, y: p.y + oy })),
    );
  }

  public hitTestGhost(worldPos: Point2D): boolean {
    const allPoints = this.getAllStrokePoints();
    if (allPoints.length < 2) return false;

    let minDist = Infinity;
    for (let i = 0; i < allPoints.length - 1; i++) {
      const d = PolygonUtils.distToSegment(worldPos, allPoints[i], allPoints[i + 1]);
      if (d < minDist) minDist = d;
    }

    return minDist < (this.ghostThickness / 2 + 15);
  }

  public clearBrush(): void {
    this.ghostPaths = [];
    this.currentStroke = [];
    this.isDrawingGhost = false;
    this.draggingGhost = false;
    this.strokeCount = 0;
    this.ghostPosition = { x: 0, y: 0 };
    this.ghostAngle = 0;
  }

  public confirmBrush(): void {
    const worldStrokes = this.collectWorldStrokes();
    if (worldStrokes.length === 0) {
      alert('Please draw a line of at least 2 points first!');
      return;
    }

    const worldPoints = this.flattenStrokes(worldStrokes);
    if (worldPoints.length < 2) {
      alert('Please draw a line of at least 2 points first!');
      return;
    }

    const worldPolys = this.generatePolygons(worldPoints);
    if (worldPolys.length === 0) {
      alert('Could not generate shapes from path.');
      return;
    }

    let clippedPolys = this.clipAgainstTerrain(worldPolys);
    clippedPolys = clippedPolys.filter(poly => PolygonUtils.getArea(poly) > 10);

    if (clippedPolys.length === 0) {
      alert('Placement cancelled: The drawn shape is completely inside or clipped by the terrain.');
      return;
    }

    const conveyorSegments = this.generateConveyorSegments(worldStrokes);

    const { finalWorldPolys, finalWorldConveyorSegments } =
      this.mergeWithExisting(clippedPolys, conveyorSegments);

    this.createCustomShape(finalWorldPolys, finalWorldConveyorSegments);
    this.clearBrush();
  }

  // --- Private helpers ---

  private getAllStrokePoints(): Point2D[] {
    const all: Point2D[] = [];
    for (const stroke of this.getWorldStrokes()) {
      all.push(...stroke);
    }
    if (this.currentStroke.length >= 2) {
      all.push(...this.currentStroke);
    }
    return all;
  }

  private collectWorldStrokes(): Point2D[][] {
    const worldStrokes: Point2D[][] = this.getWorldStrokes();
    if (this.currentStroke.length >= 2) {
      worldStrokes.push(this.currentStroke);
    }
    return worldStrokes;
  }

  private flattenStrokes(strokes: Point2D[][]): Point2D[] {
    const points: Point2D[] = [];
    for (const stroke of strokes) {
      points.push(...stroke);
    }
    return points;
  }

  private generatePolygons(worldPoints: Point2D[]): Point2D[][] {
    return PolygonUtils.pathToPolygons(worldPoints, this.ghostThickness);
  }

  private clipAgainstTerrain(polys: Point2D[][]): Point2D[][] {
    let clipped = polys;
    const terrainBlocks = this.terrainManager.getBlocks();
    for (const block of terrainBlocks) {
      const tempClipped: Point2D[][] = [];
      for (const poly of clipped) {
        const diff = PolygonUtils.difference(poly, block.points);
        tempClipped.push(...diff);
      }
      clipped = tempClipped;
    }
    return clipped;
  }

  private generateConveyorSegments(
    worldStrokes: Point2D[][],
  ): { poly: Point2D[]; dir: Point2D }[] {
    if (this.activeBrush !== 'conveyor') return [];

    const segments: { poly: Point2D[]; dir: Point2D }[] = [];
    const terrainBlocks = this.terrainManager.getBlocks();

    for (const stroke of worldStrokes) {
      for (let j = 0; j < stroke.length - 1; j++) {
        const p1 = stroke[j];
        const p2 = stroke[j + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;

        const dir = { x: dx / len, y: dy / len };
        const segRect = PolygonUtils.getSegmentRectangle(p1, p2, this.ghostThickness);

        let clippedSegs = [segRect];
        for (const block of terrainBlocks) {
          clippedSegs = clippedSegs.flatMap(poly =>
            PolygonUtils.difference(poly, block.points),
          );
        }
        clippedSegs = clippedSegs.filter(poly => PolygonUtils.getArea(poly) > 5);

        for (const poly of clippedSegs) {
          segments.push({ poly, dir });
        }
      }
    }
    return segments;
  }

  private mergeWithExisting(
    clippedPolys: Point2D[][],
    conveyorSegments: { poly: Point2D[]; dir: Point2D }[],
  ): {
    finalWorldPolys: Point2D[][];
    finalWorldConveyorSegments: { poly: Point2D[]; dir: Point2D }[];
  } {
    let finalWorldPolys = [...clippedPolys];
    let finalWorldConveyorSegments = [...conveyorSegments];
    const brushType = this.activeBrush!;
    const buildingsToMerge: CustomShape[] = [];

    for (const b of this.buildingManager.getBuildings()) {
      if (!(b instanceof CustomShape) || b.def.brushType !== brushType) continue;

      const body = b.getBody();
      if (!body) continue;

      const existingWorldPolys = this.transformPolysToWorld(b.def.polygons, body);
      if (!this.polysIntersect(finalWorldPolys, existingWorldPolys)) continue;

      buildingsToMerge.push(b);
      finalWorldPolys.push(...existingWorldPolys);

      if (brushType === 'conveyor' && b.def.conveyorSegments) {
        const existingWorldSegments = this.transformConveyorSegmentsToWorld(
          b.def.conveyorSegments,
          body,
        );
        finalWorldConveyorSegments.push(...existingWorldSegments);
      }
    }

    finalWorldPolys = PolygonUtils.unionList(finalWorldPolys);

    for (const oldBuilding of buildingsToMerge) {
      this.buildingManager.removeBuilding(oldBuilding.id, this.physicsWorld.world);
    }

    return { finalWorldPolys, finalWorldConveyorSegments };
  }

  private transformPolysToWorld(
    polys: Point2D[][],
    body: Matter.Body,
  ): Point2D[][] {
    const eCos = Math.cos(body.angle);
    const eSin = Math.sin(body.angle);
    return polys.map(poly =>
      poly.map((p: Point2D) => ({
        x: body.position.x + p.x * eCos - p.y * eSin,
        y: body.position.y + p.x * eSin + p.y * eCos,
      })),
    );
  }

  private transformConveyorSegmentsToWorld(
    segments: { poly: Point2D[]; dir: Point2D }[],
    body: Matter.Body,
  ): { poly: Point2D[]; dir: Point2D }[] {
    const eCos = Math.cos(body.angle);
    const eSin = Math.sin(body.angle);
    return segments.map(seg => ({
      poly: seg.poly.map((p: Point2D) => ({
        x: body.position.x + p.x * eCos - p.y * eSin,
        y: body.position.y + p.x * eSin + p.y * eCos,
      })),
      dir: {
        x: seg.dir.x * eCos - seg.dir.y * eSin,
        y: seg.dir.x * eSin + seg.dir.y * eCos,
      },
    }));
  }

  private polysIntersect(polysA: Point2D[][], polysB: Point2D[][]): boolean {
    for (const pA of polysA) {
      for (const pB of polysB) {
        const overlap = PolygonUtils.intersection(pA, pB);
        if (overlap.length > 0 && overlap.some(o => PolygonUtils.getArea(o) > 5)) {
          return true;
        }
      }
    }
    return false;
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
      thickness: this.ghostThickness,
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