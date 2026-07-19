import { Container, Graphics } from 'pixi.js';
import { BRUSH_COLORS } from '../buildings/CustomShape.ts';
import type { BrushEditHover } from '../tools/BrushEditController.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';

/**
 * Explicit snapshot of brush-tool state needed to render previews. The engine
 * builds this each frame from its brush/edit controllers; the renderer never
 * reaches back into the engine.
 */
export interface BrushPreviewState {
  /** True while the user is mid-stroke (LMB down between clicks). */
  isDrawing: boolean;
  /** First point of the in-progress stroke (for the single-segment fallback). */
  lastPoint: Point2D | null;
  /** Current cursor position in world space, while drawing. */
  previewEnd: Point2D | null;
  /** All vertices placed so far for the in-progress stroke. */
  fullPath: Point2D[];
  /** Active brush kind, or null when no brush is selected. */
  activeBrush: 'solid' | 'conveyor' | 'pipe' | null;
  /** Stroke thickness of the active brush (px). */
  brushThickness: number;
  /** Hovered editable path element under the cursor, or null. */
  editHover: BrushEditHover | null;
}

/**
 * Renders brush-tool previews: the in-progress stroke polyline + direction
 * arrow, and the editable-path hover highlights. Lives on its own overlay
 * container so it stays decoupled from building artwork.
 */
export class BrushPreviewRenderer {
  private graphics: Graphics;

  constructor(container: Container) {
    this.graphics = new Graphics();
    container.addChild(this.graphics);
  }

  public update(state: BrushPreviewState): void {
    this.graphics.clear();
    if (!state.activeBrush) return;

    if (state.isDrawing) {
      this.drawStrokePreview(state);
    } else if (state.editHover) {
      this.drawEditHover(state.editHover);
    }
  }

  private drawStrokePreview(state: BrushPreviewState): void {
    if (!state.activeBrush || !state.lastPoint || !state.previewEnd) return;

    const color = BRUSH_COLORS[state.activeBrush];
    const thickness = state.brushThickness;

    // Preview the whole in-progress path (all placed clicks + cursor) so the
    // user sees the full polyline they are building, not just the next segment.
    const pathPoints: Point2D[] =
      state.fullPath.length > 0 ? [...state.fullPath, state.previewEnd] : [state.lastPoint, state.previewEnd];

    this.graphics.x = 0;
    this.graphics.y = 0;
    this.graphics.rotation = 0;

    const drawPath = (width: number, alpha: number) => {
      this.graphics.moveTo(pathPoints[0].x, pathPoints[0].y);
      for (let i = 1; i < pathPoints.length; i++) {
        this.graphics.lineTo(pathPoints[i].x, pathPoints[i].y);
      }
      this.graphics.stroke({ color, width, alpha, cap: 'round', join: 'round' });
    };

    // Translucent outline + core line
    drawPath(thickness, 0.35);
    drawPath(2, 0.9);

    // Direction arrow for directional brushes, on the last segment being drawn.
    if (state.activeBrush === 'conveyor' || state.activeBrush === 'pipe') {
      const from = pathPoints[pathPoints.length - 2];
      const to = pathPoints[pathPoints.length - 1];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 10) {
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const segmentAngle = Math.atan2(dy, dx);
        const cosA = Math.cos(segmentAngle);
        const sinA = Math.sin(segmentAngle);
        const pA = { x: midX, y: midY };
        const pB = { x: midX - 10 * cosA - 5 * sinA, y: midY - 10 * sinA + 5 * cosA };
        const pC = { x: midX - 10 * cosA + 5 * sinA, y: midY - 10 * sinA - 5 * cosA };
        this.graphics.moveTo(pA.x, pA.y);
        this.graphics.lineTo(pB.x, pB.y);
        this.graphics.lineTo(pC.x, pC.y);
        this.graphics.closePath();
        this.graphics.fill({ color, alpha: 0.8 });
      }
    }
  }

  private drawEditHover(hover: BrushEditHover): void {
    const shape = hover.shape;
    const path = shape.def.path;
    if (!path || path.length < 2) return;

    const body = shape.getBody();
    const bx = body ? body.position.x : shape.x;
    const by = body ? body.position.y : shape.y;
    const angle = body ? body.angle : 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    this.graphics.x = 0;
    this.graphics.y = 0;
    this.graphics.rotation = 0;

    // Hovering a vertex highlights that vertex; hovering a segment highlights
    // its two endpoints (the ones that will move together).
    const indices =
      hover.kind === 'vertex' ? [hover.index] : [hover.index, hover.index + 1];
    for (const idx of indices) {
      const wx = bx + path[idx].x * cos - path[idx].y * sin;
      const wy = by + path[idx].x * sin + path[idx].y * cos;
      this.graphics.circle(wx, wy, 8);
      this.graphics.fill({ color: 0xffe066, alpha: 0.9 });
      this.graphics.stroke({ color: 0x111116, width: 1, alpha: 0.6 });
    }
  }

  public clear(): void {
    this.graphics.clear();
  }
}
