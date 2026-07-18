import { Camera } from './Camera.ts';
import { Renderer } from '../rendering/Renderer.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';
import { TerrainRenderer } from '../rendering/TerrainRenderer.ts';
import { ShardRenderer } from '../rendering/ShardRenderer.ts';
import { ParticleSystem } from '../rendering/ParticleSystem.ts';
import { InputManager } from '../input/InputManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { ExplosiveTool } from '../tools/ExplosiveTool.ts';
import { WORLD_WIDTH, CollisionCategories } from './Constants.ts';
import { Materials, MaterialType } from '../terrain/Materials.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { BuildingRenderer } from '../rendering/BuildingRenderer.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';
import { SaveManager } from '../save/SaveManager.ts';
import { PolygonUtils } from '../physics/PolygonUtils.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';
import { Body, Bodies, Composite } from 'matter-js';
import { Crusher } from '../buildings/Crusher.ts';
import { Furnace } from '../buildings/Furnace.ts';
import { Building } from '../buildings/Building.ts';

export class Engine {
  private camera!: Camera;
  private renderer!: Renderer;
  private terrainManager!: TerrainManager;
  private terrainRenderer!: TerrainRenderer;
  private shardRenderer!: ShardRenderer;
  private particleSystem!: ParticleSystem;
  private inputManager!: InputManager;
  private physicsWorld!: PhysicsWorld;

  // Buildings & Unified Tools
  public buildingManager!: BuildingManager;
  private buildingRenderer!: BuildingRenderer;
  private placementAngle: number = 0;

  // Custom Shapes Drawing & Brushes
  public customShapeDefs: CustomShapeDef[] = [];
  public onCustomShapesUpdated?: (defs: CustomShapeDef[]) => void;

  public activeBrush: 'solid' | 'conveyor' | null = null;
  public ghostPaths: Point2D[][] = [];     // Array of completed strokes (world coords)
  public ghostPosition: Point2D = { x: 0, y: 0 };
  public ghostAngle: number = 0;
  public ghostThickness: number = 40;
  private isDrawingGhost: boolean = false;
  private draggingGhost: boolean = false;
  private ghostDragOffset: Point2D = { x: 0, y: 0 };
  private currentStroke: Point2D[] = [];   // Points being drawn in the current stroke (world coords)
  private strokeCount: number = 0;         // Number of strokes in ghostPaths

  public activePlacement: { type: 'building' | 'custom_shape'; targetId: string } | null = null;

  // Right-click building dragging
  private draggingBuilding: Building | null = null;
  private draggingShard: Body | null = null;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  // Save System
  public saveManager!: SaveManager;
  private autosaveTimer: number = 300; // 5 minutes in seconds

  // Tools
  private explosiveTool!: ExplosiveTool;
  public activeTool: 'grab' | 'explosive' | 'brush' = 'grab';

  private lastTime: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private speedScale: number = 1.0;

  constructor() {}

  public async init(canvasElement: HTMLCanvasElement): Promise<void> {
    // 1. Initialize input
    this.inputManager = new InputManager();
    this.inputManager.init(canvasElement);

    // 2. Initialize renderer
    this.renderer = new Renderer();
    await this.renderer.init(canvasElement);

    // 3. Initialize physics
    this.physicsWorld = new PhysicsWorld();
    this.physicsWorld.init(canvasElement);

    // 4. Initialize terrain
    this.terrainManager = new TerrainManager();
    this.terrainManager.init();

    // 5. Create static physics bodies for terrain
    const blocks = this.terrainManager.getBlocks();
    for (const block of blocks) {
      const props = Materials[block.materialType];
      this.physicsWorld.createTerrainBody(block.id, block.points, props.density);
    }

    // 6. Initialize render helpers
    this.terrainRenderer = new TerrainRenderer(this.renderer.terrainContainer);
    this.terrainRenderer.update(this.terrainManager);

    this.shardRenderer = new ShardRenderer(this.renderer.shardsContainer);
    this.particleSystem = new ParticleSystem(this.renderer.particlesContainer);

    this.buildingManager = new BuildingManager();
    this.buildingRenderer = new BuildingRenderer(this.renderer.buildingsContainer, this);

    // 7. Initialize tools
    this.explosiveTool = new ExplosiveTool(this.renderer.toolsContainer);

    // Initialize Save System
    this.saveManager = new SaveManager();

    // 8. Initialize camera
    const middleX = WORLD_WIDTH / 2;
    const startY = 2800;
    this.camera = new Camera(middleX, startY, 0.4);
    this.camera.resize(this.renderer.width, this.renderer.height);

    // 9. Connect input callbacks to camera
    this.inputManager.onPan((dx, dy) => this.camera.pan(dx, dy));
    this.inputManager.onZoom((x, y, delta) => this.camera.zoomAt(x, y, delta));

    // 10. Right-click building, ghost & shard drag callbacks
    this.inputManager.onRightDown((screenX, screenY) => {
      const worldPos = this.camera.screenToWorld(screenX, screenY);

      // Check if we hit the active ghost
      if (this.activeBrush && this.hasStrokeData()) {
        if (this.hitTestGhost(worldPos)) {
          this.draggingGhost = true;
          this.ghostDragOffset = {
            x: this.ghostPosition.x - worldPos.x,
            y: this.ghostPosition.y - worldPos.y
          };
          return;
        }
      }

      // Hit-test for building & custom shape bodies
      const hits = this.physicsWorld.queryPoint(worldPos.x, worldPos.y);
      const hitBody = hits.find(b => b.label.startsWith('building:') || b.label.startsWith('custom:'));
      if (hitBody) {
        // Find the building that owns this body
        const building = this.buildingManager.getBuildings().find(b => {
          const bodies = b.getBodies();
          return bodies.some(bod => bod === hitBody || bod.parts.includes(hitBody));
        });
        if (building) {
          this.draggingBuilding = building;
          const body = building.getBody();
          if (body) {
            this.dragOffset.x = body.position.x - worldPos.x;
            this.dragOffset.y = body.position.y - worldPos.y;
            Body.setStatic(body, true);
          }
        }
        return;
      }

      // Hit-test for shards (terrain spheres)
      const hitShard = hits.find(b => b.label.startsWith('shard:'));
      if (hitShard) {
        this.draggingShard = hitShard;
        this.dragOffset.x = hitShard.position.x - worldPos.x;
        this.dragOffset.y = hitShard.position.y - worldPos.y;
        Body.setStatic(hitShard, true);
      }
    });

    this.inputManager.onRightDrag((screenX, screenY) => {
      const worldPos = this.camera.screenToWorld(screenX, screenY);
      if (this.draggingGhost) {
        this.ghostPosition.x = worldPos.x + this.ghostDragOffset.x;
        this.ghostPosition.y = worldPos.y + this.ghostDragOffset.y;
      } else if (this.draggingBuilding) {
        const body = this.draggingBuilding.getBody();
        if (body) {
          Body.setPosition(body, {
            x: worldPos.x + this.dragOffset.x,
            y: worldPos.y + this.dragOffset.y
          });
        }
      } else if (this.draggingShard) {
        Body.setPosition(this.draggingShard, {
          x: worldPos.x + this.dragOffset.x,
          y: worldPos.y + this.dragOffset.y
        });
      }
    });

    this.inputManager.onRightUp((_screenX, _screenY) => {
      if (this.draggingGhost) {
        this.draggingGhost = false;
      } else if (this.draggingBuilding) {
        const body = this.draggingBuilding.getBody();
        if (body) {
          const isCustom = body.label.startsWith('custom:');
          Body.setStatic(body, isCustom);
          // Update building coordinates to match final body position
          this.draggingBuilding.x = body.position.x;
          this.draggingBuilding.y = body.position.y;
          this.draggingBuilding.angle = body.angle;
        }
        this.draggingBuilding = null;
      } else if (this.draggingShard) {
        Body.setStatic(this.draggingShard, false);
        this.draggingShard = null;
      }
    });

    // Handle window resizing
    window.addEventListener('resize', () => {
      this.camera.resize(this.renderer.width, this.renderer.height);
    });
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  public stop(): void {
    this.isRunning = false;
  }

  public setTool(tool: 'grab' | 'explosive' | 'brush'): void {
    this.activeTool = tool;

    // Clear other tools' states
    this.explosiveTool.clearPaint();
    if (tool !== 'brush') {
      this.clearBrushDrawing();
    }

    if (tool === 'grab') {
      this.physicsWorld.updateMousePosition(this.camera, this.inputManager);
    }
  }

  public detonateExplosives(): void {
    this.explosiveTool.detonate(
      this.terrainManager,
      this.physicsWorld,
      this.particleSystem,
      this.camera
    );
  }

  public clearPaintedExplosives(): void {
    this.explosiveTool.clearPaint();
  }

  /** Returns true if any stroke data exists (either completed strokes or current in-progress stroke) */
  public hasStrokeData(): boolean {
    return this.ghostPaths.length > 0 || this.currentStroke.length >= 2;
  }

  /** Get all strokes with ghostPosition translation applied (for right-click drag repositioning) */
  public getWorldStrokes(): Point2D[][] {
    const ox = this.ghostPosition.x;
    const oy = this.ghostPosition.y;
    return this.ghostPaths.map(stroke =>
      stroke.map(p => ({ x: p.x + ox, y: p.y + oy }))
    );
  }

  /** Flatten all strokes (with ghostPosition offset applied) for hit-testing */
  private getAllStrokePoints(): Point2D[] {
    const all: Point2D[] = [];
    for (const stroke of this.getWorldStrokes()) {
      all.push(...stroke);
    }
    if (this.currentStroke.length >= 2) {
      all.push(...this.currentStroke);
    }
    return all;
  }

  public hitTestGhost(worldPos: Point2D): boolean {
    const allPoints = this.getAllStrokePoints();
    if (allPoints.length < 2) return false;

    let minDist = Infinity;
    for (let i = 0; i < allPoints.length - 1; i++) {
      const d = PolygonUtils.distToSegment(worldPos, allPoints[i], allPoints[i + 1]);
      if (d < minDist) minDist = d;
    }

    return minDist < (this.ghostThickness / 2 + 15);
  }

  public clearBrushDrawing(): void {
    this.ghostPaths = [];
    this.currentStroke = [];
    this.isDrawingGhost = false;
    this.draggingGhost = false;
    this.strokeCount = 0;
    this.ghostPosition = { x: 0, y: 0 };
    this.ghostAngle = 0;
  }

  public confirmBrushDrawing(): void {
    // Collect all strokes in world coordinates
    const worldStrokes: Point2D[][] = this.getWorldStrokes();
    if (this.currentStroke.length >= 2) {
      worldStrokes.push(this.currentStroke);
    }

    if (worldStrokes.length === 0) {
      alert("Please draw a line of at least 2 points first!");
      return;
    }

    // Flatten all strokes into a single world points array
    const worldPoints: Point2D[] = [];
    for (const stroke of worldStrokes) {
      worldPoints.push(...stroke);
    }

    if (worldPoints.length < 2) {
      alert("Please draw a line of at least 2 points first!");
      return;
    }

    // 1. Generate segment rectangles and joint circles in world coordinates
    const worldPolys = PolygonUtils.pathToPolygons(worldPoints, this.ghostThickness);
    if (worldPolys.length === 0) {
      alert("Could not generate shapes from path.");
      return;
    }

    // 3. Clip against terrain blocks
    let clippedPolys = worldPolys;
    const terrainBlocks = this.terrainManager.getBlocks();
    for (const block of terrainBlocks) {
      let tempClipped: Point2D[][] = [];
      for (const poly of clippedPolys) {
        const diff = PolygonUtils.difference(poly, block.points);
        tempClipped.push(...diff);
      }
      clippedPolys = tempClipped;
    }

    clippedPolys = clippedPolys.filter(poly => PolygonUtils.getArea(poly) > 10);

    if (clippedPolys.length === 0) {
      alert("Placement cancelled: The drawn shape is completely inside or clipped by the terrain.");
      return;
    }

    // 4. Generate clipped conveyor segments if conveyor brush
    let conveyorSegments: { poly: Point2D[]; dir: Point2D }[] = [];
    if (this.activeBrush === 'conveyor') {
      // worldStrokes already computed above (world coords)
      for (const stroke of worldStrokes) {
        for (let j = 0; j < stroke.length - 1; j++) {
          const p1 = stroke[j];
          const p2 = stroke[j + 1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0.001) {
            const dir = { x: dx / len, y: dy / len };
            const segRect = PolygonUtils.getSegmentRectangle(p1, p2, this.ghostThickness);

            let clippedSegs = [segRect];
            for (const block of terrainBlocks) {
              clippedSegs = clippedSegs.flatMap(poly => PolygonUtils.difference(poly, block.points));
            }
            clippedSegs = clippedSegs.filter(poly => PolygonUtils.getArea(poly) > 5);

            for (const poly of clippedSegs) {
              conveyorSegments.push({ poly, dir });
            }
          }
        }
      }
    }

    // 5. Merge with existing custom shapes of the same brush type that overlap
    let finalWorldPolys = [...clippedPolys];
    let finalWorldConveyorSegments = [...conveyorSegments];
    const brushType = this.activeBrush!;

    const buildingsToMerge: CustomShape[] = [];

    for (const b of this.buildingManager.getBuildings()) {
      if (b instanceof CustomShape && b.def.brushType === brushType) {
        const body = b.getBody();
        if (!body) continue;

        const eCos = Math.cos(body.angle);
        const eSin = Math.sin(body.angle);
        const existingWorldPolys = b.def.polygons.map(poly => poly.map((p: Point2D) => ({
          x: body.position.x + p.x * eCos - p.y * eSin,
          y: body.position.y + p.x * eSin + p.y * eCos
        })));

        let intersects = false;
        for (const pA of finalWorldPolys) {
          for (const pB of existingWorldPolys) {
            const overlap = PolygonUtils.intersection(pA, pB);
            if (overlap.length > 0 && overlap.some(o => PolygonUtils.getArea(o) > 5)) {
              intersects = true;
              break;
            }
          }
          if (intersects) break;
        }

        if (intersects) {
          buildingsToMerge.push(b);
          finalWorldPolys.push(...existingWorldPolys);

          if (brushType === 'conveyor' && b.def.conveyorSegments) {
            const existingWorldSegments = b.def.conveyorSegments.map(seg => ({
              poly: seg.poly.map((p: Point2D) => ({
                x: body.position.x + p.x * eCos - p.y * eSin,
                y: body.position.y + p.x * eSin + p.y * eCos
              })),
              dir: {
                x: seg.dir.x * eCos - seg.dir.y * eSin,
                y: seg.dir.x * eSin + seg.dir.y * eCos
              }
            }));
            finalWorldConveyorSegments.push(...existingWorldSegments);
          }
        }
      }
    }

    finalWorldPolys = PolygonUtils.unionList(finalWorldPolys);

    for (const oldBuilding of buildingsToMerge) {
      this.buildingManager.removeBuilding(oldBuilding.id, this.physicsWorld.world);
    }

    // 6. Compute new centroid of merged world polygons
    const allVertices: Point2D[] = finalWorldPolys.flat();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const v of allVertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    const finalCentroid = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };

    const relativePolys = finalWorldPolys.map(poly => poly.map((p: Point2D) => ({
      x: p.x - finalCentroid.x,
      y: p.y - finalCentroid.y
    })));

    const relativeConveyorSegments = finalWorldConveyorSegments.map(seg => ({
      poly: seg.poly.map((p: Point2D) => ({
        x: p.x - finalCentroid.x,
        y: p.y - finalCentroid.y
      })),
      dir: seg.dir
    }));

    const defId = `custom_${brushType}_${Date.now()}`;
    const defName = `${brushType === 'solid' ? 'Solid Wall' : 'Conveyor'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const def: CustomShapeDef = {
      id: defId,
      name: defName,
      polygons: relativePolys,
      brushType,
      thickness: this.ghostThickness,
      conveyorSegments: relativeConveyorSegments
    };

    this.customShapeDefs.push(def);

    const buildingId = `${defId}_${Date.now()}`;
    const customShape = new CustomShape(buildingId, def, finalCentroid.x, finalCentroid.y);
    customShape.initPhysics(this.physicsWorld.world);
    this.buildingManager.getBuildings().push(customShape);

    // Clear all stroke data
    this.ghostPaths = [];
    this.currentStroke = [];
    this.isDrawingGhost = false;
    this.draggingGhost = false;

    if (this.onCustomShapesUpdated) {
      this.onCustomShapesUpdated(this.customShapeDefs);
    }
  }

  public startPlacement(type: 'building' | 'custom_shape', targetId: string): void {
    this.inputManager.isLeftDown = true;
    this.activePlacement = { type, targetId };
    this.placementAngle = 0;
    this.buildingManager.startPlacement(targetId);
  }

  public confirmPlacement(): void {
    if (!this.activePlacement) return;

    this.buildingManager.confirmPlacement(this.physicsWorld, this.customShapeDefs);
    this.buildingRenderer.clearGhost();
    this.activePlacement = null;
  }

  public cancelPlacement(): void {
    if (!this.activePlacement) return;

    this.buildingManager.cancelPlacement();
    this.buildingRenderer.clearGhost();
    this.activePlacement = null;
  }

  public togglePause(): void {
    this.isPaused = !this.isPaused;
    console.log(`Simulation ${this.isPaused ? 'paused' : 'resumed'}`);
  }

  public setSpeed(scale: number): void {
    this.speedScale = scale;
    this.physicsWorld.setTimeScale(this.isPaused ? 0 : scale);
  }

  private loop(time: number): void {
    if (!this.isRunning) return;

    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame((time) => this.loop(time));
  }

  private update(dt: number): void {
    // 1. WASD camera pan
    const panSpeed = 800 * dt;
    let dx = 0;
    let dy = 0;

    if (this.inputManager.isKeyPressed('w') || this.inputManager.isKeyPressed('arrowup')) {
      dy -= panSpeed;
    }
    if (this.inputManager.isKeyPressed('s') || this.inputManager.isKeyPressed('arrowdown')) {
      dy += panSpeed;
    }
    if (this.inputManager.isKeyPressed('a') || this.inputManager.isKeyPressed('arrowleft')) {
      dx -= panSpeed;
    }
    if (this.inputManager.isKeyPressed('d') || this.inputManager.isKeyPressed('arrowright')) {
      dx += panSpeed;
    }

    if (dx !== 0 || dy !== 0) {
      this.camera.pan(dx * this.camera.zoom, dy * this.camera.zoom);
    }

    // Keyboard shortcuts - only detonate with E if not placing, dragging, or using the brush tool
    const isRotatingToolActive = this.activePlacement || this.draggingBuilding || (this.activeTool === 'brush');
    if (this.inputManager.isKeyPressed('enter') || (!isRotatingToolActive && this.inputManager.isKeyPressed('e'))) {
      this.detonateExplosives();
    }
    if (this.inputManager.isKeyPressed('c')) {
      this.clearPaintedExplosives();
    }

    // Rotate grabbed building if right-click dragging
    if (this.draggingBuilding) {
      const body = this.draggingBuilding.getBody();
      if (body) {
        if (this.inputManager.isKeyPressed('q')) {
          Body.setAngle(body, body.angle - dt * 2.5);
        }
        if (this.inputManager.isKeyPressed('e')) {
          Body.setAngle(body, body.angle + dt * 2.5);
        }
      }
    }

    // 2. Camera updates
    this.camera.update(dt);

    // 3. Tool specific updates
    if (this.activePlacement) {
      // Rotate placement with Q/E
      if (this.inputManager.isKeyPressed('q')) {
        this.placementAngle -= dt * 2.5;
      }
      if (this.inputManager.isKeyPressed('e')) {
        this.placementAngle += dt * 2.5;
      }

      const worldPos = this.camera.screenToWorld(this.inputManager.mouseX, this.inputManager.mouseY);
      this.buildingManager.updateGhost(worldPos.x, worldPos.y, this.placementAngle, this.terrainManager, this.customShapeDefs);

      // Confirm placement on release
      if (!this.inputManager.isLeftDown) {
        this.confirmPlacement();
      }
    } else if (this.activeTool === 'explosive') {
      if (this.inputManager.isLeftDown) {
        const worldPos = this.camera.screenToWorld(this.inputManager.mouseX, this.inputManager.mouseY);
        this.explosiveTool.paint(worldPos.x, worldPos.y);
      }
    } else if (this.activeTool === 'brush' && this.activeBrush) {
      if (this.inputManager.isKeyPressed('q')) {
        this.ghostAngle -= dt * 2.5;
      }
      if (this.inputManager.isKeyPressed('e')) {
        this.ghostAngle += dt * 2.5;
      }

      const worldPos = this.camera.screenToWorld(this.inputManager.mouseX, this.inputManager.mouseY);

      if (!this.draggingGhost) {
        if (this.inputManager.isLeftDown) {
          if (!this.isDrawingGhost) {
            // Start drawing a new stroke
            this.isDrawingGhost = true;
            this.currentStroke = [worldPos];
            this.ghostAngle = 0;
          } else {
            const lastPt = this.currentStroke[this.currentStroke.length - 1];
            const dx = worldPos.x - lastPt.x;
            const dy = worldPos.y - lastPt.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 8) {
              this.currentStroke.push(worldPos);
            }
          }
        } else {
          if (this.isDrawingGhost) {
            // Release: finalize the current stroke and add to ghostPaths in world coords
            this.isDrawingGhost = false;
            if (this.currentStroke.length >= 2) {
              this.ghostPaths.push([...this.currentStroke]);
              this.strokeCount++;
            }
            this.currentStroke = [];
          }
        }
      }
    } else if (this.activeTool === 'grab') {
      this.physicsWorld.updateMousePosition(this.camera, this.inputManager);
    }

    // 4. Step physics
    if (!this.isPaused) {
      this.physicsWorld.update(dt * this.speedScale);
    }

    // 5. Update particle effects
    this.particleSystem.update(dt);

    // 6. Update building logic
    this.buildingManager.update(dt, this.physicsWorld);

    // 7. Update render data
    this.terrainRenderer.update(this.terrainManager);
    this.shardRenderer.update(this.physicsWorld.getShardBodies());
    this.buildingRenderer.update(this.buildingManager, this.customShapeDefs);

    // 8. Autosave timer tick
    if (!this.isPaused) {
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = 300;
        this.triggerAutosave();
      }
    }
  }

  private render(): void {
    this.renderer.render(this.camera);
  }

  public serializeState(): any {
    return {
      camera: {
        x: this.camera.x,
        y: this.camera.y,
        zoom: this.camera.zoom
      },
      terrain: this.terrainManager.getBlocks(),
      buildings: this.buildingManager.getBuildings().map(b => {
        const body = b.getBody();
        return {
          id: b.id,
          type: b.type,
          x: body ? body.position.x : b.x,
          y: body ? body.position.y : b.y,
          angle: body ? body.angle : b.angle
        };
      }),
      customShapeDefs: this.customShapeDefs,
      customShapes: [], // deprecated, saved inside buildings now
      shards: Array.from(this.physicsWorld.getShardBodies()).map(s => {
        const label = s.label;
        const isIngot = label.startsWith('ingot:');
        const radius = (s as any).circleRadius || 5;

        return {
          label,
          isIngot,
          radius,
          x: s.position.x,
          y: s.position.y,
          vx: s.velocity.x,
          vy: s.velocity.y,
          angle: s.angle
        };
      })
    };
  }

  public async deserializeState(state: any): Promise<void> {
    if (!state) return;

    const wasPaused = this.isPaused;
    this.isPaused = true;

    try {
      // 1. Load Camera
      if (state.camera) {
        this.camera.x = state.camera.x;
        this.camera.y = state.camera.y;
        this.camera.zoom = state.camera.zoom;
        (this.camera as any).targetX = state.camera.x;
        (this.camera as any).targetY = state.camera.y;
        (this.camera as any).targetZoom = state.camera.zoom;
      }

      // 2. Clear existing items
      this.physicsWorld.clearAll();
      this.buildingManager.clearAll(this.physicsWorld.world);

      // 3. Load Terrain
      if (state.terrain) {
        (this.terrainManager as any).blocks = state.terrain;
        for (const block of state.terrain) {
          const props = Materials[block.materialType as MaterialType] || Materials[MaterialType.DIRT];
          this.physicsWorld.createTerrainBody(block.id, block.points, props.density);
        }
      }

      // 4. Load custom shape definitions
      if (state.customShapeDefs) {
        this.customShapeDefs = state.customShapeDefs.map((def: any) => {
          if (!def.polygons && def.points) {
            const thickness = def.thickness || 16;
            const worldPolys = PolygonUtils.pathToPolygons(def.points, thickness);
            const startPt = def.points[0] || { x: 0, y: 0 };
            const relativePolys = worldPolys.map(poly => poly.map((p: Point2D) => ({
              x: p.x - startPt.x,
              y: p.y - startPt.y
            })));

            let conveyorSegments;
            if (def.brushType === 'conveyor') {
              conveyorSegments = [];
              for (let i = 0; i < def.points.length - 1; i++) {
                const p1 = def.points[i];
                const p2 = def.points[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.001) {
                  const dir = { x: dx / len, y: dy / len };
                  const segRect = PolygonUtils.getSegmentRectangle(p1, p2, thickness);
                  const relPoly = segRect.map(p => ({ x: p.x - startPt.x, y: p.y - startPt.y }));
                  conveyorSegments.push({ poly: relPoly, dir });
                }
              }
            }
            return {
              ...def,
              polygons: relativePolys,
              conveyorSegments
            };
          }
          return def;
        });
        if (this.onCustomShapesUpdated) {
          this.onCustomShapesUpdated(this.customShapeDefs);
        }
      }

      // 5. Load Buildings
      if (state.buildings) {
        for (const b of state.buildings) {
          let building;
          if (b.type === 'crusher') {
            building = new Crusher(b.id, b.x, b.y);
          } else if (b.type === 'furnace') {
            building = new Furnace(b.id, b.x, b.y);
          } else {
            const def = this.customShapeDefs.find(d => d.id === b.type);
            if (def) {
              building = new CustomShape(b.id, def, b.x, b.y);
            }
          }

          if (building) {
            building.angle = b.angle;
            building.initPhysics(this.physicsWorld.world);
            this.buildingManager.getBuildings().push(building);
          }
        }
      }

      // Backward compatibility: load customShapes from old saves
      if (state.customShapes) {
        for (const saved of state.customShapes) {
          if (this.buildingManager.getBuildings().some(b => b.id === saved.defId || b.id.includes(saved.defId))) {
            continue;
          }
          const def = this.customShapeDefs.find(d => d.id === saved.defId);
          if (def) {
            const buildingId = `custom_${def.brushType}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const building = new CustomShape(buildingId, def, saved.x, saved.y);
            building.angle = saved.angle;
            building.initPhysics(this.physicsWorld.world);
            this.buildingManager.getBuildings().push(building);
          }
        }
      }

      // 6. Load Shards
      if (state.shards) {
        for (const s of state.shards) {
          const labelParts = s.label.split(':');
          const matType = labelParts[1];
          const props = Materials[matType.replace('_crushed', '') as MaterialType] || Materials[MaterialType.DIRT];

          // Support both new circle format (radius) and legacy polygon format (vertices)
          let body;
          if (s.isIngot) {
            body = Bodies.rectangle(s.x, s.y, 36, 14, {
              friction: 0.1,
              restitution: 0.2,
              density: props.density * 1.2,
              collisionFilter: {
                category: CollisionCategories.SHARDS,
                mask: CollisionCategories.TERRAIN | CollisionCategories.SHARDS | CollisionCategories.TOOLS | CollisionCategories.BUILDINGS
              }
            });
            body.label = s.label;
            Composite.add(this.physicsWorld.world, body);
            this.physicsWorld.getShardBodies().add(body);
          } else if (s.radius != null) {
            // New circle format
            body = this.physicsWorld.createCircleShardBody(s.x, s.y, s.radius, matType, props.density);
          } else if (s.vertices) {
            // Legacy polygon format — convert to circle via createShardBody
            body = this.physicsWorld.createShardBody(s.vertices, matType, props.density);
          }

          if (body) {
            Body.setPosition(body, { x: s.x, y: s.y });
            Body.setVelocity(body, { x: s.vx, y: s.vy });
            Body.setAngle(body, s.angle);
          }
        }
      }

      // Force views updates
      this.terrainRenderer.update(this.terrainManager);
      this.shardRenderer.update(this.physicsWorld.getShardBodies());
      this.buildingRenderer.update(this.buildingManager, this.customShapeDefs);

      console.log('PhySim state loaded successfully.');

    } catch (e) {
      console.error('Failed to load state', e);
    } finally {
      this.isPaused = wasPaused;
    }
  }

  public async saveGame(slot: string, type: 'manual' | 'autosave', label: string): Promise<void> {
    const state = this.serializeState();
    await this.saveManager.saveState(slot, type, label, state);
    console.log(`Saved game to ${slot} (${label})`);
  }

  public async loadGame(slot: string): Promise<void> {
    const state = await this.saveManager.loadState(slot);
    if (state) {
      await this.deserializeState(state);
      console.log(`Loaded game from ${slot}`);
    } else {
      console.warn(`No save found in slot ${slot}`);
    }
  }

  public async triggerAutosave(): Promise<void> {
    const slot = await this.saveManager.getNextRollingSlot('autosave');
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await this.saveGame(slot, 'autosave', `Autosave ${timestampStr}`);
  }
}