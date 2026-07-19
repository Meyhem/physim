import { Application, Container } from 'pixi.js';
import { Camera } from '../core/Camera.ts';

export class Renderer {
  public app!: Application;
  public stage!: Container;

  // Containers
  public worldContainer!: Container;
  public terrainContainer!: Container;
  public buildingsContainer!: Container;
  public shardsContainer!: Container;
  public ghostContainer!: Container;

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

    // Ghost/preview overlays (placement + brush previews) render above buildings
    this.ghostContainer = new Container();
    this.worldContainer.addChild(this.ghostContainer);
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
  }
}
