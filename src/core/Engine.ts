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
import { DrawingPopup } from '../ui/DrawingPopup.ts';
import { CustomShape } from '../buildings/CustomShape.ts';
import type { CustomShapeDef } from '../buildings/CustomShape.ts';
import { SaveManager } from '../save/SaveManager.ts';
import { Body, Bodies, Composite } from 'matter-js';
import { Crusher } from '../buildings/Crusher.ts';
import { Furnace } from '../buildings/Furnace.ts';

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

  // Custom Shapes Drawing
  private drawingPopup!: DrawingPopup;
  public customShapeDefs: CustomShapeDef[] = [];
  public onCustomShapesUpdated?: (defs: CustomShapeDef[]) => void;

  public activePlacement: { type: 'building' | 'custom_shape'; targetId: string } | null = null;

  // Save System
  public saveManager!: SaveManager;
  private autosaveTimer: number = 300; // 5 minutes in seconds

  // Tools
  private explosiveTool!: ExplosiveTool;
  public activeTool: 'grab' | 'explosive' = 'grab';

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
    this.buildingRenderer = new BuildingRenderer(this.renderer.buildingsContainer);

    // 7. Initialize tools
    this.explosiveTool = new ExplosiveTool(this.renderer.toolsContainer);

    // Initialize Save System
    this.saveManager = new SaveManager();

    // Initialize Drawing Popup
    const uiContainer = document.getElementById('ui-container');
    if (uiContainer) {
      this.drawingPopup = new DrawingPopup();
      this.drawingPopup.init(uiContainer);
    }

    // 8. Initialize camera
    const middleX = WORLD_WIDTH / 2;
    const startY = 2800;
    this.camera = new Camera(middleX, startY, 0.4);
    this.camera.resize(this.renderer.width, this.renderer.height);

    // 9. Connect input callbacks to camera
    this.inputManager.onPan((dx, dy) => this.camera.pan(dx, dy));
    this.inputManager.onZoom((x, y, delta) => this.camera.zoomAt(x, y, delta));

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

  public setTool(tool: 'grab' | 'explosive'): void {
    this.activeTool = tool;
    
    if (tool === 'grab') {
      this.physicsWorld.updateMousePosition(this.camera, this.inputManager);
    } else {
      this.explosiveTool.clearPaint();
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

  public openDrawingPopup(editId?: string): void {
    const editDef = editId ? this.customShapeDefs.find(d => d.id === editId) : undefined;
    this.drawingPopup.open(
      (def) => this.saveCustomShape(def),
      () => {},
      editDef
    );
  }

  public saveCustomShape(def: CustomShapeDef): void {
    const idx = this.customShapeDefs.findIndex(d => d.id === def.id);
    if (idx !== -1) {
      this.customShapeDefs[idx] = def;
    } else {
      this.customShapeDefs.push(def);
    }
    if (this.onCustomShapesUpdated) {
      this.onCustomShapesUpdated(this.customShapeDefs);
    }
  }

  public deleteCustomShape(id: string): void {
    this.customShapeDefs = this.customShapeDefs.filter(d => d.id !== id);
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

    // Keyboard shortcuts
    if (this.inputManager.isKeyPressed('e') || this.inputManager.isKeyPressed('enter')) {
      this.detonateExplosives();
    }
    if (this.inputManager.isKeyPressed('c')) {
      this.clearPaintedExplosives();
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
        const relativeVerts = s.parts[0].vertices.map(v => ({
          x: v.x - s.position.x,
          y: v.y - s.position.y
        }));
        
        const label = s.label;
        const isIngot = label.startsWith('ingot:');
        
        return {
          label,
          isIngot,
          x: s.position.x,
          y: s.position.y,
          vx: s.velocity.x,
          vy: s.velocity.y,
          angle: s.angle,
          vertices: relativeVerts
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
        this.customShapeDefs = state.customShapeDefs;
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
          
          let body;
          if (s.isIngot) {
            const props = Materials[matType as MaterialType] || Materials[MaterialType.DIRT];
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
          } else {
            const props = Materials[matType.replace('_crushed', '') as MaterialType] || Materials[MaterialType.DIRT];
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
