import { Camera } from './Camera.ts';
import { Renderer } from '../rendering/Renderer.ts';
import { TerrainManager } from '../terrain/TerrainManager.ts';
import { TerrainRenderer } from '../rendering/TerrainRenderer.ts';
import { ShardRenderer } from '../rendering/ShardRenderer.ts';
import { ParticleSystem } from '../rendering/ParticleSystem.ts';
import { InputManager } from '../input/InputManager.ts';
import { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { WORLD_WIDTH } from './Constants.ts';
import { Materials } from '../terrain/Materials.ts';
import { BuildingManager } from '../buildings/BuildingManager.ts';
import { BuildingRenderer } from '../rendering/BuildingRenderer.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';
import { SaveManager } from '../save/SaveManager.ts';
import { DragController } from '../input/DragController.ts';
import { BrushController } from '../tools/BrushController.ts';
import { BrushEditController } from '../tools/BrushEditController.ts';
import type { BrushEditHover } from '../tools/BrushEditController.ts';
import type { Point2D } from '../physics/PolygonUtils.ts';
import { PlacementController } from '../buildings/PlacementController.ts';
import { SaveLoadController } from '../save/SaveLoadController.ts';
import { Body } from 'matter-js';

export class Engine {
  private camera!: Camera;
  private renderer!: Renderer;
  private terrainManager!: TerrainManager;
  private terrainRenderer!: TerrainRenderer;
  private shardRenderer!: ShardRenderer;
  private particleSystem!: ParticleSystem;
  private inputManager!: InputManager;
  private physicsWorld!: PhysicsWorld;

  // Controllers
  private dragController!: DragController;
  private brushController!: BrushController;
  private brushEditController!: BrushEditController;
  private placementController!: PlacementController;
  private saveLoadController!: SaveLoadController;

  // Buildings & Unified Tools
  public buildingManager!: BuildingManager;
  private buildingRenderer!: BuildingRenderer;

  // Custom Shapes Definitions
  public customShapeDefs: CustomShapeDef[] = [];
  public onCustomShapesUpdated?: (defs: CustomShapeDef[]) => void;

  // Save System
  public saveManager!: SaveManager;

  // Tools
  public activeTool: 'grab' | 'brush' = 'grab';

  private lastTime: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private speedScale: number = 1.0;

  constructor() {}

  public async init(canvasElement: HTMLCanvasElement): Promise<void> {
    this.initInput(canvasElement);
    await this.initRenderer(canvasElement);
    this.initPhysics(canvasElement);
    this.initTerrain();
    this.initRenderHelpers();
    this.initBuildingSystem();
    this.initTools();
    this.initSaveSystem();
    this.initCamera();
    this.initControllers();
    this.initResizeHandler();
  }

  // --- Init sub-steps ---

  private initInput(canvasElement: HTMLCanvasElement): void {
    this.inputManager = new InputManager();
    this.inputManager.init(canvasElement);
  }

  private async initRenderer(canvasElement: HTMLCanvasElement): Promise<void> {
    this.renderer = new Renderer();
    await this.renderer.init(canvasElement);
  }

  private initPhysics(canvasElement: HTMLCanvasElement): void {
    this.physicsWorld = new PhysicsWorld();
    this.physicsWorld.init(canvasElement);
  }

  private initTerrain(): void {
    this.terrainManager = new TerrainManager();
    this.terrainManager.init();

    const blocks = this.terrainManager.getBlocks();
    for (const block of blocks) {
      const props = Materials[block.materialType];
      this.physicsWorld.createTerrainBody(block.id, block.points, props.density);
    }
  }

  private initRenderHelpers(): void {
    this.terrainRenderer = new TerrainRenderer(this.renderer.terrainContainer);
    this.terrainRenderer.update(this.terrainManager);

    this.shardRenderer = new ShardRenderer(this.renderer.shardsContainer);
    this.particleSystem = new ParticleSystem(this.renderer.particlesContainer);
  }

  private initBuildingSystem(): void {
    this.buildingManager = new BuildingManager();
    this.buildingRenderer = new BuildingRenderer(this.renderer.buildingsContainer, this);
  }

  private initTools(): void {
  }

  private initSaveSystem(): void {
    this.saveManager = new SaveManager();
  }

  private initCamera(): void {
    const middleX = WORLD_WIDTH / 2;
    const startY = 2800;
    this.camera = new Camera(middleX, startY, 0.4);
    this.camera.resize(this.renderer.width, this.renderer.height);

    this.inputManager.onPan((dx, dy) => this.camera.pan(dx, dy));
    this.inputManager.onZoom((x, y, delta) => this.camera.zoomAt(x, y, delta));
  }

  private initControllers(): void {
    this.brushController = new BrushController(
      this.terrainManager,
      this.buildingManager,
      this.physicsWorld,
      this.customShapeDefs,
      (defs) => { if (this.onCustomShapesUpdated) this.onCustomShapesUpdated(defs); },
    );

    this.dragController = new DragController(
      this.camera,
      this.inputManager,
      this.physicsWorld,
      this.buildingManager,
    );
    this.dragController.setupCallbacks();

    this.brushEditController = new BrushEditController(
      this.physicsWorld,
      this.buildingManager,
    );

    this.placementController = new PlacementController(
      this.camera,
      this.inputManager,
      this.buildingManager,
      this.customShapeDefs,
    );

    this.saveLoadController = new SaveLoadController(
      this.camera,
      this.terrainManager,
      this.buildingManager,
      this.physicsWorld,
      this.saveManager,
      this.customShapeDefs,
      (defs) => { if (this.onCustomShapesUpdated) this.onCustomShapesUpdated(defs); },
    );
  }

  private initResizeHandler(): void {
    window.addEventListener('resize', () => {
      this.camera.resize(this.renderer.width, this.renderer.height);
    });
  }

  // --- Public API (delegates to controllers) ---

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  public stop(): void {
    this.isRunning = false;
  }

  public setTool(tool: 'grab' | 'brush'): void {
    this.activeTool = tool;

    if (tool !== 'brush') {
      this.brushController.cancelPath();
    }

    // In brush mode the brush-edit controller owns RMB on editable shapes;
    // the generic DragController's RMB grab is suppressed. Outside brush mode,
    // RMB drag of whole buildings/shards works as before.
    this.dragController.rightClickSuppressed = tool === 'brush';

    if (tool === 'grab') {
      this.physicsWorld.updateMousePosition(this.camera, this.inputManager);
    }
  }

  // --- Brush delegation ---

  public get activeBrush(): 'solid' | 'conveyor' | 'pipe' | null {
    return this.brushController.activeBrush;
  }

  public set activeBrush(value: 'solid' | 'conveyor' | 'pipe' | null) {
    this.brushController.activeBrush = value;
  }

  public get brushThickness(): number {
    return this.brushController.brushThickness;
  }

  public get brushIsDrawing(): boolean {
    return this.brushController.isDrawing;
  }

  public get brushLastPoint(): Point2D | null {
    return this.brushController.lastPoint;
  }

  public get brushPipePath(): Point2D[] {
    return this.brushController.getPathPoints();
  }

  public brushPreviewEnd: Point2D | null = null;

  public get brushEditHover(): BrushEditHover | null {
    return this.brushEditController ? this.brushEditController.getHover() : null;
  }

  // --- Placement delegation ---

  public get activePlacement() {
    return this.placementController.activePlacement;
  }

  public startPlacement(type: 'building' | 'custom_shape', targetId: string): void {
    this.placementController.startPlacement(type, targetId);
  }

  public confirmPlacement(): void {
    this.placementController.confirmPlacement(this.physicsWorld, this.terrainManager);
    this.buildingRenderer.clearGhost();
  }

  public cancelPlacement(): void {
    this.placementController.cancelPlacement();
    this.buildingRenderer.clearGhost();
  }

  // --- Simulation control ---

  public togglePause(): void {
    this.isPaused = !this.isPaused;
    this.saveLoadController.setPaused(this.isPaused);
    console.log(`Simulation ${this.isPaused ? 'paused' : 'resumed'}`);
  }

  public setSpeed(scale: number): void {
    this.speedScale = scale;
    this.physicsWorld.setTimeScale(this.isPaused ? 0 : scale);
  }

  // --- Save / Load delegation ---

  public serializeState(): any {
    return this.saveLoadController.serializeState();
  }

  public async deserializeState(state: any): Promise<void> {
    await this.saveLoadController.deserializeState(state);
    this.refreshRenderData();
  }

  public async saveGame(slot: string, type: 'manual' | 'autosave', label: string): Promise<void> {
    await this.saveLoadController.saveGame(slot, type, label);
  }

  public async loadGame(slot: string): Promise<void> {
    await this.saveLoadController.loadGame(slot);
    this.refreshRenderData();
  }

  public async triggerAutosave(): Promise<void> {
    await this.saveLoadController.triggerAutosave();
  }

  // --- Game loop ---

  private loop(time: number): void {
    if (!this.isRunning) return;

    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame((time) => this.loop(time));
  }

  private update(dt: number): void {
    this.updateCameraPan(dt);
    this.updateDraggingRotation(dt);

    this.camera.update(dt);

    this.updateToolSpecific(dt);
    this.stepPhysics(dt);
    this.updateEffects(dt);
    this.updateBuildings(dt);
    this.refreshRenderData();
    this.saveLoadController.tickAutosave(dt);
  }

  private updateCameraPan(dt: number): void {
    const panSpeed = 800 * dt;
    let dx = 0;
    let dy = 0;

    if (this.inputManager.isKeyPressed('w') || this.inputManager.isKeyPressed('arrowup')) dy -= panSpeed;
    if (this.inputManager.isKeyPressed('s') || this.inputManager.isKeyPressed('arrowdown')) dy += panSpeed;
    if (this.inputManager.isKeyPressed('a') || this.inputManager.isKeyPressed('arrowleft')) dx -= panSpeed;
    if (this.inputManager.isKeyPressed('d') || this.inputManager.isKeyPressed('arrowright')) dx += panSpeed;

    if (dx !== 0 || dy !== 0) {
      this.camera.pan(dx * this.camera.zoom, dy * this.camera.zoom);
    }
  }

  private updateDraggingRotation(dt: number): void {
    if (!this.dragController.isDraggingBuilding()) return;

    const building = this.dragController.getDraggingBuilding();
    if (!building) return;

    const body = building.getBody();
    if (!body) return;

    if (this.inputManager.isKeyPressed('q')) {
      Body.setAngle(body, body.angle - dt * 2.5);
    }
    if (this.inputManager.isKeyPressed('e')) {
      Body.setAngle(body, body.angle + dt * 2.5);
    }
  }

  private updateToolSpecific(dt: number): void {
    if (this.placementController.isActive()) {
      const confirmed = this.placementController.update(dt, this.terrainManager, this.physicsWorld);
      if (confirmed) {
        this.buildingRenderer.clearGhost();
      }
    } else if (this.activeTool === 'brush' && this.activeBrush) {
      this.updateBrushTool(dt);
    } else if (this.activeTool === 'grab') {
      this.physicsWorld.updateMousePosition(this.camera, this.inputManager);
    }
  }

  private wasLeftDown: boolean = false;
  private wasRightDown: boolean = false;

  private updateBrushTool(_dt: number): void {
    const worldPos = this.camera.screenToWorld(
      this.inputManager.mouseX,
      this.inputManager.mouseY,
    );

    // Track preview endpoint for renderer
    if (this.brushController.isDrawing) {
      this.brushPreviewEnd = worldPos;
    } else {
      this.brushPreviewEnd = null;
    }

    // LMB click: start path or place segment
    if (this.inputManager.isLeftDown && !this.wasLeftDown) {
      if (!this.brushController.isDrawing) {
        this.brushController.startPath(worldPos);
      } else {
        this.brushController.placeSegment(worldPos);
      }
    }

    // RMB click: finish an in-progress path; otherwise hand off to the
    // brush-edit controller (segment/vertex/whole-path drag).
    if (this.inputManager.isRightDown && !this.wasRightDown) {
      if (this.brushController.isDrawing) {
        this.brushController.finishPath();
      } else {
        this.brushEditController.onRightDown(worldPos, this.inputManager.ctrlDown);
      }
    }

    // RMB drag/up are forwarded to the brush-edit controller only when it owns
    // the current press; the generic DragController's RMB drag is suppressed
    // in brush mode.
    if (this.inputManager.isRightDown && this.wasRightDown) {
      if (this.brushEditController.isDragging()) {
        this.brushEditController.onRightDrag(worldPos);
      }
    }
    if (!this.inputManager.isRightDown && this.wasRightDown) {
      if (this.brushEditController.isDragging()) {
        this.brushEditController.onRightUp();
      }
    }

    // Refresh hover when idle (not drawing, not dragging)
    if (!this.brushController.isDrawing && !this.brushEditController.isDragging()) {
      this.brushEditController.updateHover(worldPos);
    }

    this.wasLeftDown = this.inputManager.isLeftDown;
    this.wasRightDown = this.inputManager.isRightDown;
  }

  private stepPhysics(dt: number): void {
    if (!this.isPaused) {
      this.physicsWorld.update(dt * this.speedScale);
    }
  }

  private updateEffects(dt: number): void {
    this.particleSystem.update(dt);
  }

  private updateBuildings(dt: number): void {
    this.buildingManager.update(dt, this.physicsWorld);
  }

  private refreshRenderData(): void {
    this.terrainRenderer.update(this.terrainManager);
    this.shardRenderer.update(this.physicsWorld.getShardBodies());
    this.buildingRenderer.update(this.buildingManager, this.customShapeDefs);
  }

  private render(): void {
    this.renderer.render(this.camera);
  }
}