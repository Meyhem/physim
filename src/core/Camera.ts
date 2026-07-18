import { Container } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './Constants.ts';

export class Camera {
  public x: number = 0; // World center X
  public y: number = 0; // World center Y
  public zoom: number = 1.0;

  private targetX: number = 0;
  private targetY: number = 0;
  private targetZoom: number = 1.0;

  private minZoom: number = 0.2;
  private maxZoom: number = 3.0;

  private viewportWidth: number = 1200;
  private viewportHeight: number = 800;

  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.92; // Slight decay each frame

  constructor(startX: number, startY: number, startZoom: number = 1.0) {
    this.x = startX;
    this.y = startY;
    this.targetX = startX;
    this.targetY = startY;
    this.zoom = startZoom;
    this.targetZoom = startZoom;
  }

  public resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public pan(dx: number, dy: number): void {
    // Panning takes camera zoom into account so dragging moves items 1:1 with mouse cursor
    this.targetX += dx / this.zoom;
    this.targetY += dy / this.zoom;
    this.clampTarget();
  }

  public zoomAt(screenX: number, screenY: number, delta: number): void {
    // Zoom factor multiplier
    const factor = delta > 0 ? 0.9 : 1.1;
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom * factor));

    // Adjust camera position so the cursor remains over the same world point
    const worldPt = this.screenToWorld(screenX, screenY);
    
    // Position camera such that screenCoords = worldToScreen(worldPt)
    // worldToScreen(p) = (p.x - camera.x) * zoom + viewportWidth/2
    // For screenCoords to remain screenX:
    // screenX = (worldPt.x - newCamera.x) * newZoom + viewportWidth/2
    // newCamera.x = worldPt.x - (screenX - viewportWidth/2) / newZoom
    
    const newZoom = this.targetZoom;
    this.targetX = worldPt.x - (screenX - this.viewportWidth / 2) / newZoom;
    this.targetY = worldPt.y - (screenY - this.viewportHeight / 2) / newZoom;
    this.clampTarget();
  }

  public triggerShake(intensity: number): void {
    this.shakeIntensity = intensity;
  }

  public update(dt: number): void {
    // Smooth interpolation (lerp) - frame-rate independent
    const lerpSpeed = 1 - Math.exp(-10 * dt);
    this.x += (this.targetX - this.x) * lerpSpeed;
    this.y += (this.targetY - this.y) * lerpSpeed;
    this.zoom += (this.targetZoom - this.zoom) * lerpSpeed;

    this.clampActual();

    // Decay shake
    if (this.shakeIntensity > 0.05) {
      this.shakeIntensity *= Math.pow(this.shakeDecay, dt * 60);
    } else {
      this.shakeIntensity = 0;
    }
  }

  public applyToContainer(container: Container): void {
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0.05) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
    }

    container.scale.set(this.zoom);
    container.position.set(
      this.viewportWidth / 2 - (this.x + shakeX) * this.zoom,
      this.viewportHeight / 2 - (this.y + shakeY) * this.zoom
    );
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.viewportWidth / 2) / this.zoom + this.x,
      y: (screenY - this.viewportHeight / 2) / this.zoom + this.y
    };
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.x) * this.zoom + this.viewportWidth / 2,
      y: (worldY - this.y) * this.zoom + this.viewportHeight / 2
    };
  }

  private clampTarget(): void {
    // Don't let the camera pan way outside the world boundaries
    const marginX = this.viewportWidth / (2 * this.zoom);
    const marginY = this.viewportHeight / (2 * this.zoom);

    this.targetX = Math.max(marginX, Math.min(WORLD_WIDTH - marginX, this.targetX));
    this.targetY = Math.max(marginY, Math.min(WORLD_HEIGHT - marginY, this.targetY));
  }

  private clampActual(): void {
    const marginX = this.viewportWidth / (2 * this.zoom);
    const marginY = this.viewportHeight / (2 * this.zoom);

    this.x = Math.max(marginX, Math.min(WORLD_WIDTH - marginX, this.x));
    this.y = Math.max(marginY, Math.min(WORLD_HEIGHT - marginY, this.y));
  }
}
