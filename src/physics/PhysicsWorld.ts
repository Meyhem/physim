import { Engine, World, Composite, MouseConstraint, Mouse, Body, Bodies, Query } from 'matter-js';
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
      gravity: { x: 0, y: 0.98 }, // Realistic gravity (9.8 m/s^2 scaled)
      positionIterations: 10,      // Higher = more accurate collision resolution (default: 6)
      velocityIterations: 8        // Higher = less overshoot on impulses (default: 4)
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

    // Make sure we only drag shards, tools, buildings, or ingots, not static terrain
    this.mouseConstraint.collisionFilter.mask = 
      CollisionCategories.SHARDS | 
      CollisionCategories.TOOLS |
      CollisionCategories.BUILDINGS;

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

  // Fixed sub-step size in ms — small enough to prevent collision overshoot
  private static readonly FIXED_STEP_MS = 8; // ~120 Hz physics

  public update(dt: number): void {
    // Use fixed sub-stepping to prevent collision resolution overshoot.
    // Variable-size timesteps cause the solver to push bodies apart
    // by inconsistent amounts, leading to spazzing/jitter.
    const totalMs = dt * 1000;
    const steps = Math.ceil(totalMs / PhysicsWorld.FIXED_STEP_MS);
    const stepMs = totalMs / steps;

    for (let i = 0; i < steps; i++) {
      Engine.update(this.engine, stepMs);
    }
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
   * Creates a dynamic shard body as a circle. Radius is derived from
   * the source polygon's area (r = sqrt(area / π)).
   * Circles are dramatically faster for collision detection than polygons.
   */
  public createShardBody(points: Point2D[], materialType: string, density: number): Body {
    const area = PolygonUtils.getArea(points);
    const centroid = PolygonUtils.getCentroid(points);

    // Derive radius from polygon area, with a minimum of 3px
    const radius = Math.max(3, Math.sqrt(area / Math.PI));

    const body = Bodies.circle(centroid.x, centroid.y, radius, {
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

  /**
   * Creates a circle shard body directly from a position and radius.
   */
  public createCircleShardBody(x: number, y: number, radius: number, materialType: string, density: number): Body {
    const body = Bodies.circle(x, y, Math.max(3, radius), {
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

  /**
   * Queries bodies at a world point. Returns all bodies whose bounds contain the point.
   * Optionally filter by label prefix.
   */
  public queryPoint(worldX: number, worldY: number, labelPrefix?: string): Body[] {
    const allBodies = Composite.allBodies(this.world);
    const hits = Query.point(allBodies, { x: worldX, y: worldY });
    if (labelPrefix) {
      return hits.filter(b => b.label.startsWith(labelPrefix));
    }
    return hits;
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
