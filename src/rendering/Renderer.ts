import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../core/Camera.ts';

export class Renderer {
  public app!: Application;
  public stage!: Container;
  
  // Containers
  public worldContainer!: Container;
  public terrainContainer!: Container;
  public buildingsContainer!: Container;
  public shardsContainer!: Container;
  public toolsContainer!: Container;
  public particlesContainer!: Container;
  
  private debugGraphics!: Graphics;
  private isDebugMode: boolean = false;

  constructor() {}

  public async init(canvasElement: HTMLCanvasElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas: canvasElement,
      resizeTo: window,
      antialias: true,
      background: '#121218',
    });

    this.stage = this.app.stage;

    // Build scene graph
    this.worldContainer = new Container();
    this.stage.addChild(this.worldContainer);

    this.terrainContainer = new Container();
    this.worldContainer.addChild(this.terrainContainer);

    this.buildingsContainer = new Container();
    this.worldContainer.addChild(this.buildingsContainer);

    this.shardsContainer = new Container();
    this.worldContainer.addChild(this.shardsContainer);

    this.toolsContainer = new Container();
    this.worldContainer.addChild(this.toolsContainer);

    this.particlesContainer = new Container();
    this.worldContainer.addChild(this.particlesContainer);

    // Debug overlay
    this.debugGraphics = new Graphics();
    this.worldContainer.addChild(this.debugGraphics);
  }

  public get width(): number {
    return this.app.screen.width;
  }

  public get height(): number {
    return this.app.screen.height;
  }

  public render(camera: Camera): void {
    // Apply camera transform to the world container
    camera.applyToContainer(this.worldContainer);
    
    // Clear debug graphics for new frames
    if (this.isDebugMode) {
      this.drawDebugWireframes();
    } else {
      this.debugGraphics.clear();
    }
  }

  public toggleDebugMode(): void {
    this.isDebugMode = !this.isDebugMode;
    if (!this.isDebugMode) {
      this.debugGraphics.clear();
    }
  }

  private drawDebugWireframes(): void {
    this.debugGraphics.clear();
    // Matter.js bodies wireframe rendering can be done here if needed
  }
}
