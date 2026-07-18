import { Camera } from '../core/Camera.ts';
import { InputManager } from './InputManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { Building } from '../buildings/Building.ts';
import { Body } from 'matter-js';
import type { Point2D } from '../physics/PolygonUtils.ts';

export interface BrushGhostProvider {
  hasStrokeData(): boolean;
  hitTestGhost(worldPos: Point2D): boolean;
  ghostPosition: Point2D;
  ghostDragOffset: Point2D;
  draggingGhost: boolean;
}

export class DragController {
  private camera: Camera;
  private inputManager: InputManager;
  private physicsWorld: PhysicsWorld;
  private buildingManager: BuildingManager;
  private brushGhostProvider: BrushGhostProvider | null = null;

  private draggingBuilding: Building | null = null;
  private draggingShard: Body | null = null;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  constructor(
    camera: Camera,
    inputManager: InputManager,
    physicsWorld: PhysicsWorld,
    buildingManager: BuildingManager,
  ) {
    this.camera = camera;
    this.inputManager = inputManager;
    this.physicsWorld = physicsWorld;
    this.buildingManager = buildingManager;
  }

  public setBrushGhostProvider(provider: BrushGhostProvider | null): void {
    this.brushGhostProvider = provider;
  }

  public isDraggingBuilding(): boolean {
    return this.draggingBuilding !== null;
  }

  public getDraggingBuilding(): Building | null {
    return this.draggingBuilding;
  }

  public setupCallbacks(): void {
    this.inputManager.onRightDown((screenX, screenY) => this.handleRightDown(screenX, screenY));
    this.inputManager.onRightDrag((screenX, screenY) => this.handleRightDrag(screenX, screenY));
    this.inputManager.onRightUp((screenX, screenY) => this.handleRightUp(screenX, screenY));
  }

  private handleRightDown(screenX: number, screenY: number): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY);

    if (this.tryDragGhost(worldPos)) return;
    if (this.tryDragBuilding(worldPos)) return;
    this.tryDragShard(worldPos);
  }

  private tryDragGhost(worldPos: Point2D): boolean {
    const provider = this.brushGhostProvider;
    if (!provider || !provider.hasStrokeData()) return false;
    if (!provider.hitTestGhost(worldPos)) return false;

    provider.draggingGhost = true;
    provider.ghostDragOffset = {
      x: provider.ghostPosition.x - worldPos.x,
      y: provider.ghostPosition.y - worldPos.y,
    };
    return true;
  }

  private tryDragBuilding(worldPos: Point2D): boolean {
    const hits = this.physicsWorld.queryPoint(worldPos.x, worldPos.y);
    const hitBody = hits.find(
      b => b.label.startsWith('building:') || b.label.startsWith('custom:'),
    );
    if (!hitBody) return false;

    const building = this.buildingManager.getBuildings().find(b => {
      const bodies = b.getBodies();
      return bodies.some(bod => bod === hitBody || bod.parts.includes(hitBody));
    });
    if (!building) return false;

    this.draggingBuilding = building;
    const body = building.getBody();
    if (body) {
      this.dragOffset.x = body.position.x - worldPos.x;
      this.dragOffset.y = body.position.y - worldPos.y;
      Body.setStatic(body, true);
    }
    return true;
  }

  private tryDragShard(worldPos: Point2D): boolean {
    const hits = this.physicsWorld.queryPoint(worldPos.x, worldPos.y);
    const hitShard = hits.find(b => b.label.startsWith('shard:'));
    if (!hitShard) return false;

    this.draggingShard = hitShard;
    this.dragOffset.x = hitShard.position.x - worldPos.x;
    this.dragOffset.y = hitShard.position.y - worldPos.y;
    Body.setStatic(hitShard, true);
    return true;
  }

  private handleRightDrag(screenX: number, screenY: number): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY);
    const provider = this.brushGhostProvider;

    if (provider && provider.draggingGhost) {
      provider.ghostPosition.x = worldPos.x + provider.ghostDragOffset.x;
      provider.ghostPosition.y = worldPos.y + provider.ghostDragOffset.y;
    } else if (this.draggingBuilding) {
      const body = this.draggingBuilding.getBody();
      if (body) {
        Body.setPosition(body, {
          x: worldPos.x + this.dragOffset.x,
          y: worldPos.y + this.dragOffset.y,
        });
      }
    } else if (this.draggingShard) {
      Body.setPosition(this.draggingShard, {
        x: worldPos.x + this.dragOffset.x,
        y: worldPos.y + this.dragOffset.y,
      });
    }
  }

  private handleRightUp(_screenX: number, _screenY: number): void {
    const provider = this.brushGhostProvider;

    if (provider && provider.draggingGhost) {
      provider.draggingGhost = false;
    } else if (this.draggingBuilding) {
      const body = this.draggingBuilding.getBody();
      if (body) {
        const isCustom = body.label.startsWith('custom:');
        Body.setStatic(body, isCustom);
        this.draggingBuilding.x = body.position.x;
        this.draggingBuilding.y = body.position.y;
        this.draggingBuilding.angle = body.angle;
      }
      this.draggingBuilding = null;
    } else if (this.draggingShard) {
      Body.setStatic(this.draggingShard, false);
      this.draggingShard = null;
    }
  }
}