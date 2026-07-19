import { Camera } from '../core/Camera.ts';
import { InputManager } from './InputManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { Building } from '../buildings/Building.ts';
import { Body } from 'matter-js';

export class DragController {
  private camera: Camera;
  private inputManager: InputManager;
  private physicsWorld: PhysicsWorld;
  private buildingManager: BuildingManager;

  private draggingBuilding: Building | null = null;
  private draggingShard: Body | null = null;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  // When set, RMB presses are ignored entirely (the brush-edit controller owns
  // RMB in brush mode). The engine toggles this when entering/leaving brush.
  public rightClickSuppressed: boolean = false;

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
    if (this.rightClickSuppressed) return;

    const worldPos = this.camera.screenToWorld(screenX, screenY);

    if (this.tryDragBuilding(worldPos)) return;
    this.tryDragShard(worldPos);
  }

  private tryDragBuilding(worldPos: { x: number; y: number }): boolean {
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

  private tryDragShard(worldPos: { x: number; y: number }): boolean {
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

    if (this.draggingBuilding) {
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
    if (this.draggingBuilding) {
      const body = this.draggingBuilding.getBody();
      if (body) {
        Body.setStatic(body, true);
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
