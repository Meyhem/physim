import { Engine } from '../core/Engine.ts';

export class Toolbar {
  private container: HTMLDivElement;
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    this.container = document.createElement('div');
    this.container.className = 'ui-panel toolbar-panel';
    this.container.id = 'left-toolbar';
  }

  public init(parent: HTMLDivElement): void {
    this.container.innerHTML = `
      <div class="toolbar-section">
        <h3 class="toolbar-title">OPERATIONS</h3>
        <button id="tool-grab" class="toolbar-btn active" title="Grab and drag objects in the world">
          <span class="icon">🖐</span> Grab & Move
        </button>
      </div>

      <div class="toolbar-section separator">
        <h3 class="toolbar-title">BUILDINGS</h3>

        <!-- Predefined Buildings -->
        <button id="build-crusher" class="toolbar-btn" title="Drag to place a Crusher. Q/E to rotate.">
          <span class="icon">⚙️</span> Crusher
        </button>
        <button id="build-furnace" class="toolbar-btn" title="Drag to place a Furnace. Q/E to rotate.">
          <span class="icon">🔥</span> Furnace
        </button>
        <button id="build-miner" class="toolbar-btn" title="Drag to place a Miner. Mines the terrain it is mounted on. Q/E to rotate.">
          <span class="icon">⛏️</span> Miner
        </button>
      </div>

      <div class="toolbar-section separator">
        <h3 class="toolbar-title">DRAW BRUSHES</h3>

        <!-- Brushes -->
        <button id="brush-solid" class="toolbar-btn" title="Draw solid walls directly into the world">
          <span class="icon">🧱</span> Solid Wall Brush
        </button>
        <button id="brush-conveyor" class="toolbar-btn" title="Draw conveyor belts directly into the world">
          <span class="icon">➡️</span> Conveyor Brush
        </button>
        <button id="brush-pipe" class="toolbar-btn" title="Draw pipes that suck shards in at the start and propel them to the end">
          <span class="icon">🟦</span> Pipe Brush
        </button>

      </div>

      <div class="toolbar-section footer">
        <div class="controls-hint">
          <p><strong>Pan:</strong> WASD / Right Drag</p>
          <p><strong>Zoom:</strong> Scroll Wheel</p>
          <p><strong>Rotate:</strong> Q / E</p>
        </div>
      </div>
    `;

    parent.appendChild(this.container);

    // Setup event listeners
    const grabBtn = this.container.querySelector('#tool-grab') as HTMLButtonElement;
    const buildCrusherBtn = this.container.querySelector('#build-crusher') as HTMLButtonElement;
    const buildFurnaceBtn = this.container.querySelector('#build-furnace') as HTMLButtonElement;
    const buildMinerBtn = this.container.querySelector('#build-miner') as HTMLButtonElement;

    // Brush components
    const brushSolidBtn = this.container.querySelector('#brush-solid') as HTMLButtonElement;
    const brushConveyorBtn = this.container.querySelector('#brush-conveyor') as HTMLButtonElement;
    const brushPipeBtn = this.container.querySelector('#brush-pipe') as HTMLButtonElement;

    grabBtn.addEventListener('click', () => {
      this.setActiveTool('grab');
    });

    // Brushes triggers
    brushSolidBtn.addEventListener('click', () => {
      if (this.engine.activeTool === 'brush' && this.engine.activeBrush === 'solid') {
        this.setActiveTool('grab');
      } else {
        this.setActiveBrush('solid');
      }
    });

    brushConveyorBtn.addEventListener('click', () => {
      if (this.engine.activeTool === 'brush' && this.engine.activeBrush === 'conveyor') {
        this.setActiveTool('grab');
      } else {
        this.setActiveBrush('conveyor');
      }
    });

    brushPipeBtn.addEventListener('click', () => {
      if (this.engine.activeTool === 'brush' && this.engine.activeBrush === 'pipe') {
        this.setActiveTool('grab');
      } else {
        this.setActiveBrush('pipe');
      }
    });

    // Mousedown on buildings starts drag-and-hold placement
    buildCrusherBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.setActiveTool('grab'); // Reset tool state
      this.engine.startPlacement('building', 'crusher');
    });

    buildFurnaceBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.setActiveTool('grab');
      this.engine.startPlacement('building', 'furnace');
    });

    buildMinerBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.setActiveTool('grab');
      this.engine.startPlacement('building', 'miner');
    });
  }
  private setActiveBrush(brushType: 'solid' | 'conveyor' | 'pipe'): void {
    this.engine.setTool('brush');
    this.engine.activeBrush = brushType;

    const grabBtn = this.container.querySelector('#tool-grab');
    const brushSolidBtn = this.container.querySelector('#brush-solid');
    const brushConveyorBtn = this.container.querySelector('#brush-conveyor');
    const brushPipeBtn = this.container.querySelector('#brush-pipe');
    if (grabBtn) grabBtn.classList.remove('active');
    if (brushSolidBtn) brushSolidBtn.classList.remove('active');
    if (brushConveyorBtn) brushConveyorBtn.classList.remove('active');
    if (brushPipeBtn) brushPipeBtn.classList.remove('active');

    const activeBtn =
      brushType === 'solid' ? brushSolidBtn
      : brushType === 'conveyor' ? brushConveyorBtn
      : brushPipeBtn;
    if (activeBtn) activeBtn.classList.add('active');
  }

  private setActiveTool(tool: 'grab'): void {
    this.engine.setTool(tool);
    this.engine.activeBrush = null;

    const grabBtn = this.container.querySelector('#tool-grab');
    const brushSolidBtn = this.container.querySelector('#brush-solid');
    const brushConveyorBtn = this.container.querySelector('#brush-conveyor');
    const brushPipeBtn = this.container.querySelector('#brush-pipe');
    if (grabBtn) grabBtn.classList.remove('active');
    if (brushSolidBtn) brushSolidBtn.classList.remove('active');
    if (brushConveyorBtn) brushConveyorBtn.classList.remove('active');
    if (brushPipeBtn) brushPipeBtn.classList.remove('active');

    const activeBtn = this.container.querySelector('#tool-grab') as HTMLButtonElement;
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }
}
