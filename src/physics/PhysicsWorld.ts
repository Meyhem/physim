import { Engine, World, Composite, MouseConstraint, Mouse, Body, Bodies } from 'matter-js';
import { CollisionCategories } from '../core/Constants.ts';
import { PolygonUtils } from './PolygonUtils.ts';
import type { Point2D } from './PolygonUtils.ts';
import { Camera } from '../core/Camera.ts';
import { InputManager } from '../input/InputManager.ts';

export class PhysicsWorld {
  public engine: Engine;
  public world: World;
  private mouseConstraint!: MouseConstraint;
  private mouseObj!: Mouse;

  // Track bodies by ID
  private terrainBodies: Map<string, Body> = new Map();
  private shardBodies: Set<Body> = new Set();

  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0.98 } // Realistic gravity (9.8 m/s^2 scaled)
    });
    this.world = this.engine.world;
  }

  public init(canvasElement: HTMLCanvasElement): void {
    // Set up mouse constraint
    this.mouseObj = Mouse.create(canvasElement);
    
    this.mouseConstraint = MouseConstraint.create(this.engine, {
      mouse: this.mouseObj,
      constraint: {
        stiffness: 0.1,
        render: { visible: false } // We don't render Matter.js built-in lines
      }
    });

    // Make sure we only drag shards, tools, or ingots, not static terrain
    this.mouseConstraint.collisionFilter.mask = 
      CollisionCategories.SHARDS | 
      CollisionCategories.TOOLS;

    Composite.add(this.world, this.mouseConstraint);
  }

  /**
   * Updates mouse position in world coordinates for dragging to work with camera panning/zooming.
   */
  public updateMousePosition(camera: Camera, inputManager: InputManager): void {
    const worldPos = camera.screenToWorld(inputManager.mouseX, inputManager.mouseY);
    // Directly override mouse position with world coordinates
    this.mouseObj.position.x = worldPos.x;
    this.mouseObj.position.y = worldPos.y;
  }

  /**
   * Set simulation speed multiplier (1x, 2x, 4x, etc.)
   */
  public setTimeScale(scale: number): void {
    this.engine.timing.timeScale = scale;
  }

  public update(dt: number): void {
    // Step the physics engine
    // Matter.js engine.update takes timestep in ms
    Engine.update(this.engine, dt * 1000);
  }

  /**
   * Creates a static terrain block body.
   */
  public createTerrainBody(id: string, points: Point2D[], density: number): Body {
    const centroid = PolygonUtils.getCentroid(points);
    const centeredPoints = points.map(p => ({ x: p.x - centroid.x, y: p.y - centroid.y }));

    const body = Bodies.fromVertices(centroid.x, centroid.y, [centeredPoints], {
      isStatic: true,
      friction: 0.3,
      density: density,
      collisionFilter: {
        category: CollisionCategories.TERRAIN
      }
    });

    // Custom label to retrieve block properties later
    body.label = `terrain:${id}`;

    Composite.add(this.world, body);
    this.terrainBodies.set(id, body);
    return body;
  }

  /**
   * Removes a static terrain body.
   */
  public removeTerrainBody(id: string): void {
    const body = this.terrainBodies.get(id);
    if (body) {
      Composite.remove(this.world, body);
      this.terrainBodies.delete(id);
    }
  }

  /**
   * Creates a dynamic shard body from a set of points (usually a Voronoi triangle/polygon).
   */
  public createShardBody(points: Point2D[], materialType: string, density: number): Body {
    // If polygon is too small, skip creating physics body
    if (PolygonUtils.getArea(points) < 10) {
      // Create a tiny circle instead
      const centroid = PolygonUtils.getCentroid(points);
      const circleBody = Bodies.circle(centroid.x, centroid.y, 3, {
        friction: 0.1,
        restitution: 0.1,
        density: density * 0.5,
        collisionFilter: {
          category: CollisionCategories.SHARDS,
          mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.TOOLS | CollisionCategories.BUILDINGS
        }
      });
      circleBody.label = `shard:${materialType}`;
      Composite.add(this.world, circleBody);
      this.shardBodies.add(circleBody);
      return circleBody;
    }

    const centroid = PolygonUtils.getCentroid(points);
    const centeredPoints = points.map(p => ({ x: p.x - centroid.x, y: p.y - centroid.y }));

    const body = Bodies.fromVertices(centroid.x, centroid.y, [centeredPoints], {
      friction: 0.2,
      restitution: 0.1,
      density: density,
      collisionFilter: {
        category: CollisionCategories.SHARDS,
        mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.TOOLS | CollisionCategories.BUILDINGS
      }
    });

    body.label = `shard:${materialType}`;
    
    Composite.add(this.world, body);
    this.shardBodies.add(body);
    return body;
  }

  public removeBody(body: Body): void {
    Composite.remove(this.world, body);
    this.shardBodies.delete(body);
  }

  public getShardBodies(): Set<Body> {
    return this.shardBodies;
  }

  public clearAll(): void {
    // Clear all terrain and shard bodies
    for (const body of this.terrainBodies.values()) {
      Composite.remove(this.world, body);
    }
    this.terrainBodies.clear();

    for (const body of this.shardBodies) {
      Composite.remove(this.world, body);
    }
    this.shardBodies.clear();
  }
}
