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
        <button id="tool-explosive" class="toolbar-btn" title="Paint explosives on terrain">
          <span class="icon">🧨</span> Explosive Paint
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

        <!-- Brush Configuration & Confirm/Cancel Menu -->
        <div id="brush-menu-controls" style="display: none; flex-direction: column; gap: 12px; margin-top: 8px;">
          <div class="divider-line" style="margin: 4px 0;"></div>
          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button id="brush-btn-clear" class="toolbar-btn secondary-btn" style="padding: 8px; font-size: 11px; flex: 1; text-align: center; justify-content: center;" title="Clear drawn path">🧹 Clear</button>
            <button id="brush-btn-confirm" class="toolbar-btn active" style="padding: 8px; font-size: 11px; flex: 1.5; text-align: center; justify-content: center;" title="Confirm and place shape">✔️ Confirm</button>
          </div>
        </div>
      </div>

      <div class="toolbar-section separator">
        <h3 class="toolbar-title">EXPLOSIVES</h3>
        <button id="btn-detonate" class="toolbar-btn detonate-btn" title="Detonate all painted explosives (Shortcut: Enter)">
          <span class="icon">💥</span> Detonate Blasts
        </button>
        <button id="btn-clear-paint" class="toolbar-btn secondary-btn" title="Clear all painted spots (Shortcut: C)">
          <span class="icon">🧹</span> Clear Paint
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
    const explosiveBtn = this.container.querySelector('#tool-explosive') as HTMLButtonElement;
    const detonateBtn = this.container.querySelector('#btn-detonate') as HTMLButtonElement;
    const clearBtn = this.container.querySelector('#btn-clear-paint') as HTMLButtonElement;
    const buildCrusherBtn = this.container.querySelector('#build-crusher') as HTMLButtonElement;
    const buildFurnaceBtn = this.container.querySelector('#build-furnace') as HTMLButtonElement;

    // Brush components
    const brushSolidBtn = this.container.querySelector('#brush-solid') as HTMLButtonElement;
    const brushConveyorBtn = this.container.querySelector('#brush-conveyor') as HTMLButtonElement;
    const brushClearBtn = this.container.querySelector('#brush-btn-clear') as HTMLButtonElement;
    const brushConfirmBtn = this.container.querySelector('#brush-btn-confirm') as HTMLButtonElement;

    grabBtn.addEventListener('click', () => {
      this.setActiveTool('grab');
    });

    explosiveBtn.addEventListener('click', () => {
      this.setActiveTool('explosive');
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

    brushClearBtn.addEventListener('click', () => {
      this.engine.clearBrushDrawing();
    });

    brushConfirmBtn.addEventListener('click', () => {
      this.engine.confirmBrushDrawing();
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

    detonateBtn.addEventListener('click', () => {
      this.engine.detonateExplosives();
    });

    clearBtn.addEventListener('click', () => {
      this.engine.clearPaintedExplosives();
    });
  }

  private setActiveBrush(brushType: 'solid' | 'conveyor'): void {
    this.engine.setTool('brush');
    this.engine.activeBrush = brushType;

    const grabBtn = this.container.querySelector('#tool-grab');
    const explosiveBtn = this.container.querySelector('#tool-explosive');
    const brushSolidBtn = this.container.querySelector('#brush-solid');
    const brushConveyorBtn = this.container.querySelector('#brush-conveyor');
    const brushMenu = this.container.querySelector('#brush-menu-controls') as HTMLDivElement;

    if (grabBtn) grabBtn.classList.remove('active');
    if (explosiveBtn) explosiveBtn.classList.remove('active');
    if (brushSolidBtn) brushSolidBtn.classList.remove('active');
    if (brushConveyorBtn) brushConveyorBtn.classList.remove('active');

    const activeBtn = brushType === 'solid' ? brushSolidBtn : brushConveyorBtn;
    if (activeBtn) activeBtn.classList.add('active');

    if (brushMenu) brushMenu.style.display = 'flex';
  }

  private setActiveTool(tool: 'grab' | 'explosive'): void {
    this.engine.setTool(tool);
    this.engine.activeBrush = null;

    const grabBtn = this.container.querySelector('#tool-grab');
    const explosiveBtn = this.container.querySelector('#tool-explosive');
    const brushSolidBtn = this.container.querySelector('#brush-solid');
    const brushConveyorBtn = this.container.querySelector('#brush-conveyor');
    const brushMenu = this.container.querySelector('#brush-menu-controls') as HTMLDivElement;

    if (grabBtn) grabBtn.classList.remove('active');
    if (explosiveBtn) explosiveBtn.classList.remove('active');
    if (brushSolidBtn) brushSolidBtn.classList.remove('active');
    if (brushConveyorBtn) brushConveyorBtn.classList.remove('active');

    const activeId = tool === 'grab' ? 'tool-grab' : 'tool-explosive';
    const activeBtn = this.container.querySelector(`#${activeId}`) as HTMLButtonElement;
    if (activeBtn) {
      activeBtn.classList.add('active');
    }

    if (brushMenu) brushMenu.style.display = 'none';
  }
}
