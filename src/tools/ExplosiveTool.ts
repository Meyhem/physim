import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { Materials } from '../terrain/Materials.ts';
import { Fracture } from '../physics/Fracture.ts';
import { ParticleSystem } from '../rendering/ParticleSystem.ts';
import { Camera } from '../core/Camera.ts';
import { Body } from 'matter-js';
import { Graphics } from 'pixi.js';

export class ExplosiveTool {
  private paintedPoints: Point2D[] = [];
  private paintRadius: number = 15; // Paint brush size
  private blastRadius: number = 60; // Detonation radius
  private overlayGraphics: Graphics;

  constructor(overlayContainer: any) {
    this.overlayGraphics = new Graphics();
    overlayContainer.addChild(this.overlayGraphics);
  }

  public paint(worldX: number, worldY: number): void {
    // Avoid painting duplicates too close to each other
    const minSpacing = 10;
    const tooClose = this.paintedPoints.some(pt => {
      const dx = pt.x - worldX;
      const dy = pt.y - worldY;
      return dx * dx + dy * dy < minSpacing * minSpacing;
    });

    if (!tooClose) {
      this.paintedPoints.push({ x: worldX, y: worldY });
      this.drawOverlay();
    }
  }

  public clearPaint(): void {
    this.paintedPoints = [];
    this.overlayGraphics.clear();
  }

  public detonate(
    terrainManager: TerrainManager,
    physicsWorld: PhysicsWorld,
    particleSystem: ParticleSystem,
    camera: Camera
  ): void {
    if (this.paintedPoints.length === 0) return;

    // Apply blast to terrain blocks
    for (const blastCenter of this.paintedPoints) {
      // 1. Trigger visual effects
      particleSystem.spawnExplosion(blastCenter.x, blastCenter.y, this.blastRadius);
      camera.triggerShake(12);

      // Create octagonal approximation of blast circle
      const blastPolygon: Point2D[] = [];
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        blastPolygon.push({
          x: blastCenter.x + Math.cos(angle) * this.blastRadius,
          y: blastCenter.y + Math.sin(angle) * this.blastRadius
        });
      }

      // Check all terrain blocks
      const blocks = [...terrainManager.getBlocks()];
      
      for (const block of blocks) {
        // Quick bounding box check to optimize clipping operations
        if (!this.checkOverlapBoundingBox(block.points, blastCenter, this.blastRadius)) {
          continue;
        }

        // Perform clipping
        const insidePolys = PolygonUtils.intersection(block.points, blastPolygon);
        
        if (insidePolys.length > 0) {
          // Block got hit! Remove it from terrain manager and physics world
          terrainManager.removeBlock(block.id);
          physicsWorld.removeTerrainBody(block.id);

          const remainingPolys = PolygonUtils.difference(block.points, blastPolygon);

          // Re-add remaining portions as new static terrain blocks
          remainingPolys.forEach((poly, index) => {
            const newBlockId = `${block.id}_r${index}_${Date.now()}`;
            terrainManager.addBlock({
              id: newBlockId,
              materialType: block.materialType,
              points: poly,
              isFractured: false
            });
            const props = Materials[block.materialType];
            physicsWorld.createTerrainBody(newBlockId, poly, props.density);
          });

          // Fracture the inside portions into shards
          const matProps = Materials[block.materialType];
          insidePolys.forEach((insidePoly) => {
            const shards = Fracture.generateShards(insidePoly, blastCenter, this.blastRadius, matProps.shardCount);
            
            shards.forEach((shard) => {
              const shardBody = physicsWorld.createShardBody(shard, block.materialType, matProps.density);
              
              // Apply physical impulse force outwards from blast center
              const centroid = PolygonUtils.getCentroid(shard);
              let dx = centroid.x - blastCenter.x;
              let dy = centroid.y - blastCenter.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              if (dist > 0.1) {
                dx /= dist;
                dy /= dist;
                // Force magnitude decays with distance from center
                const forceDecay = Math.max(0, 1 - dist / this.blastRadius);
                const forceMagnitude = 0.04 * forceDecay * shardBody.mass;
                
                Body.applyForce(shardBody, shardBody.position, {
                  x: dx * forceMagnitude,
                  y: dy * forceMagnitude
                });
              }
            });
          });
        }
      }
    }

    this.clearPaint();
  }

  private checkOverlapBoundingBox(points: Point2D[], center: Point2D, radius: number): boolean {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Is circle overlapping with block bounding box?
    const closestX = Math.max(minX, Math.min(center.x, maxX));
    const closestY = Math.max(minY, Math.min(center.y, maxY));

    const dx = center.x - closestX;
    const dy = center.y - closestY;

    return dx * dx + dy * dy < radius * radius;
  }

  private drawOverlay(): void {
    this.overlayGraphics.clear();
    
    // Draw glowing orange circles at painted spots
    for (const pt of this.paintedPoints) {
      this.overlayGraphics.fill({ color: 0xFF5722, alpha: 0.4 });
      this.overlayGraphics.stroke({ color: 0xFF9800, width: 2, alpha: 0.8 });
      this.overlayGraphics.drawCircle(pt.x, pt.y, this.paintRadius);
    }
  }

  public destroy(): void {
    this.overlayGraphics.destroy();
  }
}
