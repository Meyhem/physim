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
    const coordsA = [[polyA.map(p => [p.x, p.y] as [number, number])]] as any;
    const coordsB = [[polyB.map(p => [p.x, p.y] as [number, number])]] as any;

    try {
      const result = polygonClipping.difference(coordsA, coordsB);
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
    const coordsA = [[polyA.map(p => [p.x, p.y] as [number, number])]] as any;
    const coordsB = [[polyB.map(p => [p.x, p.y] as [number, number])]] as any;

    try {
      const result = polygonClipping.intersection(coordsA, coordsB);
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
    const coordsA = [[polyA.map(p => [p.x, p.y] as [number, number])]] as any;
    const coordsB = [[polyB.map(p => [p.x, p.y] as [number, number])]] as any;

    try {
      const result = polygonClipping.union(coordsA, coordsB);
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
      const coordsCurrent = currentList.map(p => [p.map(pt => [pt.x, pt.y] as [number, number])]) as any;
      const coordsNext = [[nextPoly.map(pt => [pt.x, pt.y] as [number, number])]] as any;

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

    const polys: Point2D[][] = [];

    // 1. Add circles at all joints
    for (const pt of points) {
      polys.push(this.getCirclePolygon(pt, thickness / 2));
    }

    // 2. Add rectangles for all segments
    for (let i = 0; i < points.length - 1; i++) {
      polys.push(this.getSegmentRectangle(points[i], points[i + 1], thickness));
    }

    // 3. Union everything together
    return this.unionList(polys);
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
      // We take the outer boundary (the first ring)
      if (polygon.length > 0) {
        const outerRing = polygon[0];
        // Convert to Point2D[] and deduplicate sequential equal points
        const points: Point2D[] = [];
        for (let i = 0; i < outerRing.length; i++) {
          const pt = outerRing[i];
          const nextPt = outerRing[(i + 1) % outerRing.length];
          const distSq = (pt[0] - nextPt[0]) ** 2 + (pt[1] - nextPt[1]) ** 2;
          if (distSq > 0.001) {
            points.push({ x: pt[0], y: pt[1] });
          }
        }
        if (points.length >= 3) {
          result.push(points);
        }
      }
    }
    return result;
  }
}
