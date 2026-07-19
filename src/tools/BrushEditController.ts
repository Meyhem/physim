import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';

export type BrushEditHoverKind = 'segment' | 'vertex';

export interface BrushEditHover {
  shape: CustomShape;
  kind: BrushEditHoverKind;
  index: number;
}

type DragMode = 'segment' | 'vertex' | 'all';

interface DragState {
  shape: CustomShape;
  mode: DragMode;
  index: number;
  startWorld: Point2D;
  startVertices: Point2D[];
}

const VERTEX_HIT_RADIUS = 10;
const SEGMENT_HIT_PADDING = 6;

export class BrushEditController {
  constructor(
    private physicsWorld: PhysicsWorld,
    private buildingManager: BuildingManager,
  ) {}

  private hover: BrushEditHover | null = null;
  private drag: DragState | null = null;

  public getHover(): BrushEditHover | null {
    return this.hover;
  }

  public isDragging(): boolean {
    return this.drag !== null;
  }

  /**
   * Recompute the hover state for the current mouse position. Called every
   * frame from the engine when the brush tool is active and the user is not
   * mid-stroke.
   */
  public updateHover(worldPos: Point2D): void {
    if (this.drag) return;
    this.hover = this.pickHover(worldPos);
  }

  /**
   * Handle the start of a RMB press. Returns true if this controller grabbed
   * the event (i.e. an editable shape was under the cursor) so the caller can
   * skip the generic DragController.
   */
  public onRightDown(worldPos: Point2D, ctrl: boolean): boolean {
    const hit = this.pickHover(worldPos);
    if (!hit) return false;

    const path = hit.shape.def.path;
    if (!path) return false;

    let mode: DragMode;
    let index: number;
    if (ctrl) {
      mode = 'all';
      index = -1;
    } else if (hit.kind === 'vertex') {
      mode = 'vertex';
      index = hit.index;
    } else {
      mode = 'segment';
      index = hit.index;
    }

    this.drag = {
      shape: hit.shape,
      mode,
      index,
      startWorld: { x: worldPos.x, y: worldPos.y },
      startVertices: path.map(p => ({ x: p.x, y: p.y })),
    };
    this.hover = hit;
    return true;
  }

  /**
   * Handle RMB drag. Applies the world delta (in local/path space) to the
   * appropriate vertices of the path and rebuilds the shape.
   */
  public onRightDrag(worldPos: Point2D): void {
    if (!this.drag) return;

    const body = this.drag.shape.getBody();
    const angle = body ? body.angle : 0;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    const worldDx = worldPos.x - this.drag.startWorld.x;
    const worldDy = worldPos.y - this.drag.startWorld.y;

    // Rotate the world delta into the shape's local (path) space.
    const localDx = worldDx * cos - worldDy * sin;
    const localDy = worldDx * sin + worldDy * cos;

    const path = this.drag.shape.def.path!;
    const start = this.drag.startVertices;

    if (this.drag.mode === 'all') {
      for (let i = 0; i < path.length; i++) {
        path[i].x = start[i].x + localDx;
        path[i].y = start[i].y + localDy;
      }
    } else if (this.drag.mode === 'vertex') {
      const i = this.drag.index;
      path[i].x = start[i].x + localDx;
      path[i].y = start[i].y + localDy;
    } else {
      // segment: translate both of its endpoints together
      const i = this.drag.index;
      path[i].x = start[i].x + localDx;
      path[i].y = start[i].y + localDy;
      path[i + 1].x = start[i + 1].x + localDx;
      path[i + 1].y = start[i + 1].y + localDy;
    }

    this.drag.shape.rebuildFromPath(this.physicsWorld.world);
  }

  public onRightUp(): void {
    this.drag = null;
  }

  // --- internals ---

  private pickHover(worldPos: Point2D): BrushEditHover | null {
    // Iterate topmost-first so overlapping shapes pick the visually-last drawn.
    // We can't rely on matter's Query.point for pipes: a pipe's body is only
    // the two thin walls, so hovering the hollow interior hits nothing. Test
    // the shape's full grabbable footprint (walls + interior channel) with a
    // point-in-polygon check instead.
    const buildings = this.buildingManager.getBuildings();
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (!(b instanceof CustomShape)) continue;
      if (!b.def.path || b.def.path.length < 2) continue;
      const hover = this.hoverForShape(b, worldPos);
      if (hover) return hover;
    }
    return null;
  }

  private hoverForShape(shape: CustomShape, worldPos: Point2D): BrushEditHover | null {
    const path = shape.def.path;
    if (!path || path.length < 2) return null;

    const body = shape.getBody();
    const bx = body ? body.position.x : shape.x;
    const by = body ? body.position.y : shape.y;
    const angle = body ? body.angle : 0;

    // Transform the cursor into the shape's local (path) frame.
    const dx = worldPos.x - bx;
    const dy = worldPos.y - by;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const local: Point2D = { x: dx * cos - dy * sin, y: dx * sin + dy * cos };

    // The cursor must be somewhere on the shape's footprint before we consider
    // grabbing a segment/vertex. For pipes this includes the hollow channel
    // (so the user can grab by the middle, not just the walls).
    if (!this.isInsideFootprint(shape, local)) return null;

    const thickness = shape.def.thickness;

    // Vertex hit radius: for pipes, the joint sits in the middle of a hollow
    // cap — use the full half-thickness so any click near the joint inside
    // the pipe grabs it. For solid/conveyor keep a small precise radius.
    const vertexRadius = shape.def.brushType === 'pipe'
      ? Math.max(VERTEX_HIT_RADIUS, thickness / 2)
      : VERTEX_HIT_RADIUS;

    // 1. Vertices win over segments when both qualify.
    let bestVertex = -1;
    let bestVertexDist = vertexRadius;
    for (let i = 0; i < path.length; i++) {
      const d = Math.hypot(path[i].x - local.x, path[i].y - local.y);
      if (d < bestVertexDist) {
        bestVertexDist = d;
        bestVertex = i;
      }
    }
    if (bestVertex >= 0) {
      return { shape, kind: 'vertex', index: bestVertex };
    }

    // 2. Otherwise find the closest segment (within the brush radius).
    let bestSeg = -1;
    let bestSegDist = thickness / 2 + SEGMENT_HIT_PADDING;
    for (let i = 0; i < path.length - 1; i++) {
      const d = PolygonUtils.distToSegment(local, path[i], path[i + 1]);
      if (d < bestSegDist) {
        bestSegDist = d;
        bestSeg = i;
      }
    }
    if (bestSeg >= 0) {
      return { shape, kind: 'segment', index: bestSeg };
    }

    return null;
  }

  /**
   * Returns true if `local` (a point in the shape's local frame, relative to
   * the body's position) lies anywhere on the shape's grabbable footprint:
   * filled polygons for solid/conveyor, or walls + interior channel for pipe.
   */
  private isInsideFootprint(shape: CustomShape, local: Point2D): boolean {
    for (const poly of shape.def.polygons) {
      if (poly.length >= 3 && PolygonUtils.isPointInPolygon(local, poly)) return true;
    }
    if (shape.def.brushType === 'pipe' && shape.def.flowSegments) {
      for (const seg of shape.def.flowSegments) {
        if (seg.poly.length >= 3 && PolygonUtils.isPointInPolygon(local, seg.poly)) return true;
      }
    }
    return false;
  }
}
