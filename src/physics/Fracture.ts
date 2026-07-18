import { PolygonUtils } from './PolygonUtils.ts';
import type { Point2D } from './PolygonUtils.ts';

export class Fracture {
  /**
   * Clips a polygon against a line defined by a point and a normal vector.
   * Keeps the portion of the polygon in the direction of the normal.
   */
  private static clipPolygonAgainstLine(points: Point2D[], linePoint: Point2D, lineNormal: Point2D): Point2D[] {
    if (points.length < 3) return [];

    const result: Point2D[] = [];
    const n = points.length;

    const isInside = (p: Point2D) => {
      // Dot product (P - LinePoint) . LineNormal >= 0 means inside
      return (p.x - linePoint.x) * lineNormal.x + (p.y - linePoint.y) * lineNormal.y >= 0;
    };

    const getIntersection = (p1: Point2D, p2: Point2D): Point2D => {
      // Line 1: P = p1 + t*(p2 - p1)
      // Line 2: (P - linePoint) . lineNormal = 0
      // (p1.x + t*(p2.x - p1.x) - linePoint.x)*normal.x + (p1.y + t*(p2.y - p1.y) - linePoint.y)*normal.y = 0
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      
      const numerator = (linePoint.x - p1.x) * lineNormal.x + (linePoint.y - p1.y) * lineNormal.y;
      const denominator = dx * lineNormal.x + dy * lineNormal.y;

      if (Math.abs(denominator) < 0.0001) {
        return p1; // parallel or degenerate
      }

      const t = numerator / denominator;
      return {
        x: p1.x + t * dx,
        y: p1.y + t * dy
      };
    };

    let s = points[n - 1];
    let sInside = isInside(s);

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const pInside = isInside(p);

      if (pInside) {
        if (sInside) {
          result.push(p);
        } else {
          result.push(getIntersection(s, p));
          result.push(p);
        }
      } else {
        if (sInside) {
          result.push(getIntersection(s, p));
        }
      }
      s = p;
      sInside = pInside;
    }

    return result;
  }

  /**
   * Generates Voronoi-like shards inside a polygon.
   */
  public static generateShards(
    polygon: Point2D[],
    blastCenter: Point2D,
    blastRadius: number,
    baseCount: number = 8
  ): Point2D[][] {
    const area = PolygonUtils.getArea(polygon);
    if (area < 100 || polygon.length < 3) return [];

    // Calculate bounding box of the polygon
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Generate seed points
    // We want more seeds closer to the blast center to create smaller fragments there
    const seeds: Point2D[] = [];
    const count = Math.max(4, Math.min(30, baseCount));
    
    for (let i = 0; i < count; i++) {
      // Try to generate a seed inside the bounding box
      let sx = 0;
      let sy = 0;
      let found = false;

      for (let attempt = 0; attempt < 10; attempt++) {
        // Bias seeds towards the blast center
        const angle = Math.random() * Math.PI * 2;
        // Distribute distance with a square root bias for denser core
        const dist = Math.pow(Math.random(), 1.5) * blastRadius;
        
        sx = blastCenter.x + Math.cos(angle) * dist;
        sy = blastCenter.y + Math.sin(angle) * dist;

        // Clamp to bounding box of the block
        sx = Math.max(minX, Math.min(maxX, sx));
        sy = Math.max(minY, Math.min(maxY, sy));

        // Check if inside polygon (simple ray-casting check or just proceed)
        found = true;
        break;
      }

      if (found) {
        seeds.push({ x: sx, y: sy });
      }
    }

    // Ensure we have at least 2 distinct seeds
    if (seeds.length < 2) {
      seeds.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
      seeds.push({ x: (minX + maxX) / 2 + 10, y: (minY + maxY) / 2 + 10 });
    }

    const shards: Point2D[][] = [];

    // Compute Voronoi cells using half-plane intersection
    for (let i = 0; i < seeds.length; i++) {
      const sI = seeds[i];
      let cell = [...polygon];

      for (let j = 0; j < seeds.length; j++) {
        if (i === j) continue;
        const sJ = seeds[j];

        // Midpoint of segment SI-SJ
        const mx = (sI.x + sJ.x) / 2;
        const my = (sI.y + sJ.y) / 2;

        // Normal pointing towards sI: sI - sJ
        let nx = sI.x - sJ.x;
        let ny = sI.y - sJ.y;
        
        const len = Math.sqrt(nx * nx + ny * ny);
        if (len > 0.001) {
          nx /= len;
          ny /= len;
        }

        cell = this.clipPolygonAgainstLine(cell, { x: mx, y: my }, { x: nx, y: ny });
        if (cell.length < 3) break;
      }

      // If valid polygon, add to shards
      if (cell.length >= 3 && PolygonUtils.getArea(cell) > 20) {
        shards.push(cell);
      }
    }

    return shards;
  }
}
