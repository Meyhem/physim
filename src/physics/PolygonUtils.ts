import polygonClipping from 'polygon-clipping';

export interface Point2D {
  x: number;
  y: number;
}

export type Ring = [number, number][];
export type PolygonCoords = Ring[]; // [outer, hole1, hole2...]

export class PolygonUtils {
  /**
   * Simplifies a path of points using the Douglas-Peucker algorithm.
   */
  public static simplifyPath(points: Point2D[], tolerance: number): Point2D[] {
    if (points.length <= 2) return points;

    let maxSqDist = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const sqDist = this.getSquareSegmentDistance(points[i], points[0], points[end]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (maxSqDist > tolerance * tolerance) {
      const results1 = this.simplifyPath(points.slice(0, index + 1), tolerance);
      const results2 = this.simplifyPath(points.slice(index), tolerance);
      return results1.slice(0, results1.length - 1).concat(results2);
    }

    return [points[0], points[end]];
  }

  private static getSquareSegmentDistance(p: Point2D, s1: Point2D, s2: Point2D): number {
    let x = s1.x;
    let y = s1.y;
    let dx = s2.x - x;
    let dy = s2.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = s2.x;
        y = s2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  }

  /**
   * Calculates the area of a polygon.
   */
  public static getArea(points: Point2D[]): number {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area / 2);
  }

  /**
   * Calculates the centroid of a polygon.
   */
  public static getCentroid(points: Point2D[]): Point2D {
    let cx = 0;
    let cy = 0;
    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const factor = (points[i].x * points[j].y - points[j].x * points[i].y);
      cx += (points[i].x + points[j].x) * factor;
      cy += (points[i].y + points[j].y) * factor;
      area += factor;
    }

    area = area / 2;
    if (Math.abs(area) < 0.0001) {
      return { x: points[0].x, y: points[0].y };
    }

    return {
      x: cx / (6 * area),
      y: cy / (6 * area)
    };
  }

  /**
   * Performs polygon subtraction (A - B) using polygon-clipping.
   * Returns list of resulting polygons.
   */
  public static difference(polyA: Point2D[], polyB: Point2D[]): Point2D[][] {
    try {
      const result = polygonClipping.difference(
        this.toClippingPolygon(polyA),
        this.toClippingPolygon(polyB),
      );
      return this.multiPolygonToPointArrays(result);
    } catch (e) {
      console.warn("Polygon difference failed, falling back to original polygon", e);
      return [polyA];
    }
  }

  /**
   * Performs polygon intersection (A * B).
   */
  public static intersection(polyA: Point2D[], polyB: Point2D[]): Point2D[][] {
    try {
      const result = polygonClipping.intersection(
        this.toClippingPolygon(polyA),
        this.toClippingPolygon(polyB),
      );
      return this.multiPolygonToPointArrays(result);
    } catch (e) {
      console.warn("Polygon intersection failed", e);
      return [];
    }
  }

  /**
   * Performs polygon union (A + B) using polygon-clipping.
   * Returns list of resulting polygons.
   */
  public static union(polyA: Point2D[], polyB: Point2D[]): Point2D[][] {
    try {
      const result = polygonClipping.union(
        this.toClippingPolygon(polyA),
        this.toClippingPolygon(polyB),
      );
      return this.multiPolygonToPointArrays(result);
    } catch (e) {
      console.warn("Polygon union failed, returning both input polygons", e);
      return [polyA, polyB];
    }
  }

  /**
   * Unions a list of polygons together into a set of non-overlapping polygons.
   */
  public static unionList(polys: Point2D[][]): Point2D[][] {
    if (polys.length === 0) return [];
    if (polys.length === 1) return polys;

    let currentList = [polys[0]];

    for (let i = 1; i < polys.length; i++) {
      const nextPoly = polys[i];
      const coordsCurrent = currentList.map((p) => this.toClippingPolygon(p));
      const coordsNext = this.toClippingPolygon(nextPoly);

      try {
        const result = polygonClipping.union(coordsCurrent, coordsNext);
        currentList = this.multiPolygonToPointArrays(result);
      } catch (e) {
        console.warn("Union list iteration failed, appending polygon", e);
        currentList.push(nextPoly);
      }
    }
    return currentList;
  }

  /**
   * Converts a polygon (list of vertices) into the ring format that the
   * polygon-clipping library expects ([ring] where ring is [x, y] pairs).
   * Centralizes the coordinate mapping used by all boolean operations.
   */
  private static toClippingPolygon(poly: Point2D[]): polygonClipping.Polygon {
    return [poly.map((p) => [p.x, p.y] as [number, number])];
  }

  /**
   * Ray-casting algorithm to check if a point is inside a polygon.
   */
  public static isPointInPolygon(p: Point2D, vs: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x, yi = vs[i].y;
      const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y))
          && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Checks if a circle (center + radius) overlaps with a polygon.
   * Returns true if the circle's center is inside the polygon OR
   * if the circle's edge intersects any edge of the polygon.
   */
  public static isCircleOverlappingPolygon(center: Point2D, radius: number, vs: Point2D[]): boolean {
    // Quick check: is center inside?
    if (this.isPointInPolygon(center, vs)) return true;

    // Check distance to each edge
    for (let i = 0; i < vs.length; i++) {
      const j = (i + 1) % vs.length;
      const dist = this.distToSegment(center, vs[i], vs[j]);
      if (dist < radius) return true;
    }
    return false;
  }

  /**
   * Generates a rectangle polygon around a segment of a path with a given thickness.
   */
  public static getSegmentRectangle(p1: Point2D, p2: Point2D, thickness: number): Point2D[] {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) {
      const r = thickness / 2;
      return [
        { x: p1.x - r, y: p1.y - r },
        { x: p1.x + r, y: p1.y - r },
        { x: p1.x + r, y: p1.y + r },
        { x: p1.x - r, y: p1.y + r }
      ];
    }

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const r = thickness / 2;
    return [
      { x: p1.x + nx * r, y: p1.y + ny * r },
      { x: p2.x + nx * r, y: p2.y + ny * r },
      { x: p2.x - nx * r, y: p2.y - ny * r },
      { x: p1.x - nx * r, y: p1.y - ny * r }
    ];
  }

  /**
   * Generates a hollow pipe/tube segment along p1->p2.
   * Returns the two wall rails (collidable bodies) and the interior channel
   * polygon (the empty space shards travel through, used for force tests).
   * `extend` lengthens both rails/channel beyond p1 and p2 so neighbouring
   * segments overlap into a continuous tube.
   */
  public static getSegmentTube(
    p1: Point2D,
    p2: Point2D,
    thickness: number,
    wallThickness: number,
    extend: number = 0,
  ): { topRail: Point2D[]; bottomRail: Point2D[]; channel: Point2D[] } {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const half = thickness / 2;
    const innerHalf = Math.max(1, half - wallThickness);

    if (len < 0.001) {
      const r = half;
      // Degenerate: a short capsule of walls
      const top: Point2D[] = [
        { x: p1.x - r, y: p1.y - innerHalf },
        { x: p1.x + r, y: p1.y - innerHalf },
        { x: p1.x + r, y: p1.y - r },
        { x: p1.x - r, y: p1.y - r },
      ];
      const bottom: Point2D[] = [
        { x: p1.x - r, y: p1.y + r },
        { x: p1.x + r, y: p1.y + r },
        { x: p1.x + r, y: p1.y + innerHalf },
        { x: p1.x - r, y: p1.y + innerHalf },
      ];
      const channel: Point2D[] = [
        { x: p1.x - r, y: p1.y - innerHalf },
        { x: p1.x + r, y: p1.y - innerHalf },
        { x: p1.x + r, y: p1.y + innerHalf },
        { x: p1.x - r, y: p1.y + innerHalf },
      ];
      return { topRail: top, bottomRail: bottom, channel };
    }

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const ax = p1.x - ux * extend;
    const ay = p1.y - uy * extend;
    const bx = p2.x + ux * extend;
    const by = p2.y + uy * extend;

    const topRail: Point2D[] = [
      { x: ax + nx * innerHalf, y: ay + ny * innerHalf },
      { x: bx + nx * innerHalf, y: by + ny * innerHalf },
      { x: bx + nx * half, y: by + ny * half },
      { x: ax + nx * half, y: ay + ny * half },
    ];

    const bottomRail: Point2D[] = [
      { x: ax - nx * half, y: ay - ny * half },
      { x: bx - nx * half, y: by - ny * half },
      { x: bx - nx * innerHalf, y: by - ny * innerHalf },
      { x: ax - nx * innerHalf, y: ay - ny * innerHalf },
    ];

    const channel: Point2D[] = [
      { x: ax + nx * innerHalf, y: ay + ny * innerHalf },
      { x: bx + nx * innerHalf, y: by + ny * innerHalf },
      { x: bx - nx * innerHalf, y: by - ny * innerHalf },
      { x: ax - nx * innerHalf, y: ay - ny * innerHalf },
    ];

    return { topRail, bottomRail, channel };
  }

  /**
   * Offsets a polyline to the left (or right if `offset` is negative) by the
   * given distance, using mitered joints.
   *
   * When `clampMiter` is true, the miter length is capped at `|offset|` so the
   * offset point can never extend further from the centerline than `offset`.
   * This is used for the *inner* wall edge of a pipe so that sharp bends cannot
   * spike the wall into the interior channel (which would obstruct flow).
   * The outer edge leaves `clampMiter` false so corners stay smooth and sealed.
   */
  public static offsetPolyline(points: Point2D[], offset: number, clampMiter: boolean = false): Point2D[] {
    const n = points.length;
    if (n === 0) return [];
    if (n === 1) return [{ x: points[0].x, y: points[0].y }];

    const result: Point2D[] = [];
    for (let i = 0; i < n; i++) {
      const prev = points[Math.max(0, i - 1)];
      const curr = points[i];
      const next = points[Math.min(n - 1, i + 1)];

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const l1 = Math.hypot(dx1, dy1) || 1;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      const l2 = Math.hypot(dx2, dy2) || 1;

      // Left-hand unit normals of the two adjacent segments
      const nx1 = -dy1 / l1;
      const ny1 = dx1 / l1;
      const nx2 = -dy2 / l2;
      const ny2 = dx2 / l2;

      // Averaged (mitered) normal
      let mx = nx1 + nx2;
      let my = ny1 + ny2;
      let mLen = Math.hypot(mx, my);
      if (mLen < 0.001) {
        mx = nx1;
        my = ny1;
        mLen = 1;
      }
      mx /= mLen;
      my /= mLen;

      const cosTheta = nx1 * nx2 + ny1 * ny2;
      const cosHalf = Math.sqrt(Math.max(0.0001, (1 + cosTheta) / 2));
      let miterLen = offset / cosHalf;
      const maxLen = clampMiter ? Math.abs(offset) : 2 * Math.abs(offset);
      miterLen = Math.max(-maxLen, Math.min(maxLen, miterLen));

      result.push({
        x: curr.x + mx * miterLen,
        y: curr.y + my * miterLen,
      });
    }
    return result;
  }

  /**
   * Generates an octagonal approximation of a circle.
   */
  public static getCirclePolygon(center: Point2D, radius: number): Point2D[] {
    const poly: Point2D[] = [];
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      poly.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }
    return poly;
  }

  /**
   * Converts a polyline path with a given thickness into a unioned polygon structure,
   * including circles at each joint and end to make the path smooth.
   */
  public static pathToPolygons(points: Point2D[], thickness: number): Point2D[][] {
    if (points.length === 0) return [];
    if (points.length === 1) {
      return [this.getCirclePolygon(points[0], thickness / 2)];
    }

    // Check if path is closed
    const first = points[0];
    const last = points[points.length - 1];
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    const isClosed = points.length >= 3 && Math.sqrt(dx * dx + dy * dy) < thickness;

    if (isClosed) {
      // For closed paths, generate individual convex trapezoids per segment.
      // Each trapezoid is: left-offset(p1), left-offset(p2), right-offset(p2), right-offset(p1)
      // This produces a clean ring with no holes or degenerate geometry.
      return this.generateRingSegments(points, thickness);
    }

    // Open path: union of segment rectangles and joint circles
    const polys: Point2D[][] = [];
    for (const pt of points) {
      polys.push(this.getCirclePolygon(pt, thickness / 2));
    }
    for (let i = 0; i < points.length - 1; i++) {
      polys.push(this.getSegmentRectangle(points[i], points[i + 1], thickness));
    }
    return this.unionList(polys);
  }

  /**
   * Generates convex trapezoid segments for a closed ring path.
   * Each segment is a simple 4-vertex convex polygon that Matter.js
   * can decompose cleanly.
   */
  private static generateRingSegments(points: Point2D[], thickness: number): Point2D[][] {
    const half = thickness / 2;
    const n = points.length;
    const segments: Point2D[][] = [];

    // Precompute offset normals at each point (average of adjacent segment normals)
    const offsets: { left: Point2D; right: Point2D }[] = [];

    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

      // Unit normals pointing left of each segment direction
      const nx1 = -dy1 / len1;
      const ny1 = dx1 / len1;
      const nx2 = -dy2 / len2;
      const ny2 = dx2 / len2;

      // Average and normalize for the corner normal
      let mx = nx1 + nx2;
      let my = ny1 + ny2;
      const mLen = Math.sqrt(mx * mx + my * my);

      if (mLen < 0.001) {
        mx = nx1;
        my = ny1;
      } else {
        mx /= mLen;
        my /= mLen;
      }

      offsets.push({
        left: { x: curr.x + mx * half, y: curr.y + my * half },
        right: { x: curr.x - mx * half, y: curr.y - my * half },
      });
    }

    // Generate one trapezoid per segment
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const seg: Point2D[] = [
        offsets[i].left,
        offsets[j].left,
        offsets[j].right,
        offsets[i].right,
      ];
      segments.push(seg);
    }

    return segments;
  }

  /**
   * Triangulates a simple polygon using Ear Clipping.
   * Returns an array of triangles (each triangle is 3 points).
   */
  public static triangulate(points: Point2D[]): Point2D[][] {
    if (points.length < 3) return [];
    if (points.length === 3) return [points];

    // Ensure points are oriented counter-clockwise
    const vertices = [...points];
    if (!this.isClockwise(vertices)) {
      vertices.reverse();
    }

    const triangles: Point2D[][] = [];
    const indexList: number[] = Array.from({ length: vertices.length }, (_, i) => i);

    let count = 0;
    while (indexList.length > 3) {
      // Prevent infinite loop on self-intersecting or zero-area polygons
      if (count++ > vertices.length * 2) {
        break;
      }

      let earFound = false;
      for (let i = 0; i < indexList.length; i++) {
        const prevIdx = indexList[i === 0 ? indexList.length - 1 : i - 1];
        const currIdx = indexList[i];
        const nextIdx = indexList[i === indexList.length - 1 ? 0 : i + 1];

        const pPrev = vertices[prevIdx];
        const pCurr = vertices[currIdx];
        const pNext = vertices[nextIdx];

        if (this.isEar(pPrev, pCurr, pNext, vertices, indexList)) {
          triangles.push([pPrev, pCurr, pNext]);
          indexList.splice(i, 1);
          earFound = true;
          break;
        }
      }

      if (!earFound) {
        // Fallback: just carve off the first convex triangle we find, even if it might overlap
        triangles.push([
          vertices[indexList[0]],
          vertices[indexList[1]],
          vertices[indexList[2]]
        ]);
        indexList.splice(1, 1);
      }
    }

    // Add the final triangle
    if (indexList.length === 3) {
      triangles.push([
        vertices[indexList[0]],
        vertices[indexList[1]],
        vertices[indexList[2]]
      ]);
    }

    return triangles;
  }

  private static isClockwise(points: Point2D[]): boolean {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      sum += (p2.x - p1.x) * (p2.y + p1.y);
    }
    return sum < 0;
  }

  private static isEar(
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    vertices: Point2D[],
    indexList: number[]
  ): boolean {
    // 1. Must be a convex angle (cross product > 0 for CCW)
    const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
    if (cross <= 0) return false;

    // 2. Must not contain any other vertex of the polygon
    for (const idx of indexList) {
      const p = vertices[idx];
      if (p === p1 || p === p2 || p === p3) continue;

      if (this.isPointInTriangle(p, p1, p2, p3)) {
        return false;
      }
    }

    return true;
  }

  private static isPointInTriangle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
    const d1 = this.sign(p, a, b);
    const d2 = this.sign(p, b, c);
    const d3 = this.sign(p, c, a);

    const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    return !(has_neg && has_pos);
  }

  private static sign(p1: Point2D, p2: Point2D, p3: Point2D): number {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  }

  public static distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2);
  }

  private static multiPolygonToPointArrays(mp: polygonClipping.MultiPolygon): Point2D[][] {
    const result: Point2D[][] = [];
    for (const polygon of mp) {
      if (polygon.length === 0) continue;

      const outerRing = polygon[0];
      const holes = polygon.slice(1);

      if (holes.length === 0) {
        // No holes — simple polygon
        const points = this.ringToPoints(outerRing);
        if (points.length >= 3) {
          result.push(points);
        }
      } else {
        // Has holes — convert to simple polygon(s) using bridge edges
        const simplePolys = this.polygonWithHolesToSimple(outerRing, holes);
        for (const sp of simplePolys) {
          if (sp.length >= 3) {
            result.push(sp);
          }
        }
      }
    }
    return result;
  }

  /**
   * Converts a polygon with holes into one or more simple polygons
   * by connecting each hole to the outer boundary with a zero-width bridge.
   */
  private static polygonWithHolesToSimple(
    outer: [number, number][],
    holes: [number, number][][],
  ): Point2D[][] {
    const result: Point2D[][] = [];
    let currentOuter = outer;

    for (const hole of holes) {
      if (hole.length < 3) continue;

      // Find the rightmost hole vertex and the closest outer vertex to its right
      let holeRightmostIdx = 0;
      for (let i = 1; i < hole.length; i++) {
        if (hole[i][0] > hole[holeRightmostIdx][0]) {
          holeRightmostIdx = i;
        }
      }
      const holePt = hole[holeRightmostIdx];

      // Find intersection of a ray going right from holePt with the outer ring
      let bestOuterIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < currentOuter.length; i++) {
        const a = currentOuter[i];
        const b = currentOuter[(i + 1) % currentOuter.length];
        // Check if the horizontal ray from holePt intersects segment a-b
        if ((a[1] > holePt[1]) !== (b[1] > holePt[1])) {
          const intersectX = a[0] + ((b[0] - a[0]) * (holePt[1] - a[1])) / (b[1] - a[1]);
          if (intersectX > holePt[0] && intersectX - holePt[0] < bestDist) {
            bestDist = intersectX - holePt[0];
            bestOuterIdx = i;
          }
        }
      }

      // Build a simple polygon by bridging: walk outer, bridge to hole, walk hole, bridge back
      const simplePoly: Point2D[] = [];

      // Walk outer from 0 to bestOuterIdx
      for (let i = 0; i <= bestOuterIdx; i++) {
        simplePoly.push({ x: currentOuter[i][0], y: currentOuter[i][1] });
      }
      // Bridge to hole
      simplePoly.push({ x: holePt[0], y: holePt[1] });
      // Walk hole starting from rightmost vertex
      for (let i = 0; i < hole.length; i++) {
        const idx = (holeRightmostIdx + i) % hole.length;
        simplePoly.push({ x: hole[idx][0], y: hole[idx][1] });
      }
      // Bridge back
      simplePoly.push({ x: holePt[0], y: holePt[1] });
      // Continue walking outer from bestOuterIdx+1 to end
      for (let i = bestOuterIdx + 1; i < currentOuter.length; i++) {
        simplePoly.push({ x: currentOuter[i][0], y: currentOuter[i][1] });
      }

      result.push(simplePoly);
    }

    // If no holes were processed (all had < 3 points), return the outer ring
    if (result.length === 0) {
      const pts = this.ringToPoints(outer);
      if (pts.length >= 3) result.push(pts);
    }

    return result;
  }

  private static ringToPoints(ring: [number, number][]): Point2D[] {
    const points: Point2D[] = [];
    for (let i = 0; i < ring.length; i++) {
      const pt = ring[i];
      const nextPt = ring[(i + 1) % ring.length];
      const distSq = (pt[0] - nextPt[0]) ** 2 + (pt[1] - nextPt[1]) ** 2;
      if (distSq > 0.001) {
        points.push({ x: pt[0], y: pt[1] });
      }
    }
    return points;
  }

  /**
   * Builds one conveyor flow-segment per path segment: a rectangle the size of
   * the segment plus the unit direction along it. Coordinates are returned in
   * the same frame as the input path (callers convert to relative as needed).
   */
  public static buildConveyorSegmentsFromPath(
    path: Point2D[],
    thickness: number,
  ): { poly: Point2D[]; dir: Point2D }[] {
    const result: { poly: Point2D[]; dir: Point2D }[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;
      const dir = { x: dx / len, y: dy / len };
      result.push({ poly: this.getSegmentRectangle(a, b, thickness), dir });
    }
    return result;
  }

  /**
   * Infers a 2-vertex editable path from existing polygons. Used to migrate
   * legacy solid/conveyor CustomShapeDefs (which were stored without a `path`)
   * into the new editable-path model.
   *
   * Strategy:
   *  - If `dirHint` is provided (e.g. a conveyor segment direction), align the
   *    path along that direction through the AABB center.
   *  - Otherwise pick the longer of the AABB's two axes.
   * The endpoints are inset by half the thickness so the generated tube
   * (rect + end circles) matches the original geometry.
   */
  public static inferPathFromPolygons(
    polys: Point2D[][],
    thickness: number,
    dirHint?: Point2D,
  ): Point2D[] {
    if (!polys || polys.length === 0) return [{ x: 0, y: 0 }, { x: thickness, y: 0 }];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const poly of polys) {
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = maxX - minX;
    const h = maxY - minY;

    let dir: Point2D;
    if (dirHint) {
      const len = Math.hypot(dirHint.x, dirHint.y) || 1;
      dir = { x: dirHint.x / len, y: dirHint.y / len };
    } else if (w >= h) {
      dir = { x: 1, y: 0 };
    } else {
      dir = { x: 0, y: 1 };
    }

    const longExtent = Math.abs(dir.x) * w / 2 + Math.abs(dir.y) * h / 2;
    const half = thickness / 2;
    const reach = Math.max(0, longExtent - half);
    return [
      { x: cx - dir.x * reach, y: cy - dir.y * reach },
      { x: cx + dir.x * reach, y: cy + dir.y * reach },
    ];
  }
}
