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
    const hits = this.physicsWorld.queryPoint(worldPos.x, worldPos.y, 'custom:');
    if (hits.length === 0) return null;

    // Find the CustomShape that owns any of the hit bodies and is editable
    // (has a `path`). Pipe shapes are not editable in this model.
    const buildings = this.buildingManager.getBuildings();
    let target: CustomShape | null = null;
    for (const hit of hits) {
      const shape = buildings.find(b => {
        if (!(b instanceof CustomShape)) return false;
        const bodies = b.getBodies();
        return bodies.some(bod => bod === hit || bod.parts.includes(hit));
      }) as CustomShape | undefined;
      if (shape && shape.def.path && shape.def.brushType !== 'pipe') {
        target = shape;
        break;
      }
    }
    if (!target) return null;

    return this.hoverForShape(target, worldPos);
  }

  private hoverForShape(shape: CustomShape, worldPos: Point2D): BrushEditHover | null {
    const path = shape.def.path;
    if (!path || path.length < 2) return null;

    const body = shape.getBody();
    const bx = body ? body.position.x : shape.x;
    const by = body ? body.position.y : shape.y;
    const angle = body ? body.angle : 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const toWorld = (p: Point2D): Point2D => ({
      x: bx + p.x * cos - p.y * sin,
      y: by + p.x * sin + p.y * cos,
    });

    // 1. Check vertex hits first (vertices win over segments when both qualify).
    let bestVertex = -1;
    let bestVertexDist = VERTEX_HIT_RADIUS;
    for (let i = 0; i < path.length; i++) {
      const w = toWorld(path[i]);
      const d = Math.hypot(w.x - worldPos.x, w.y - worldPos.y);
      if (d < bestVertexDist) {
        bestVertexDist = d;
        bestVertex = i;
      }
    }
    if (bestVertex >= 0) {
      return { shape, kind: 'vertex', index: bestVertex };
    }

    // 2. Otherwise check segment hits.
    const thickness = shape.def.thickness;
    let bestSeg = -1;
    let bestSegDist = thickness / 2 + SEGMENT_HIT_PADDING;
    for (let i = 0; i < path.length - 1; i++) {
      const a = toWorld(path[i]);
      const b = toWorld(path[i + 1]);
      const d = PolygonUtils.distToSegment(worldPos, a, b);
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
}
