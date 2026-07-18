import { Body, World, Composite } from 'matter-js';

export abstract class Building {
  public id: string;
  public type: string;
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public angle: number = 0;

  // constituent physics bodies
  protected bodies: Body[] = [];
  protected sensorBody: Body | null = null;

  // Processing queue
  protected queue: { bodyId: number; label: string; timer: number }[] = [];

  constructor(id: string, type: string, x: number, y: number, width: number, height: number) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  /**
   * Initializes physics bodies in the Matter.js world.
   */
  public abstract initPhysics(world: World): void;

  /**
   * Cleans up physics bodies from the world.
   */
  public destroyPhysics(world: World): void {
    for (const body of this.bodies) {
      Composite.remove(world, body);
    }
    this.bodies = [];
    this.sensorBody = null;
  }

  /**
   * Checks if a body is inside the input sensor.
   */
  public checkSensorCollision(collidedBody: Body): void {
    if (!this.sensorBody) return;
    if (collidedBody === this.sensorBody) return;
    
    // Check if the collided body is a shard
    if (collidedBody.label.startsWith('shard:')) {
      // Check if already in queue
      const alreadyInQueue = this.queue.some(item => item.bodyId === collidedBody.id);
      if (!alreadyInQueue) {
        this.onItemEnter(collidedBody);
      }
    }
  }

  protected abstract onItemEnter(body: Body): void;

  public abstract update(dt: number, physicsWorld: any): void;

  public abstract getBounds(): { minX: number; maxX: number; minY: number; maxY: number };

  public getBody(): Body | null {
    return this.bodies[0] || null;
  }

  public getBodies(): Body[] {
    return this.bodies;
  }

  public getSensorBody(): Body | null {
    return this.sensorBody;
  }
}
