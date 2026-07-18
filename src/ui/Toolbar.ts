import { Engine } from '../core/Engine.ts';
import type { CustomShapeDef } from '../tools/CustomShape.ts';

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
        <h3 class="toolbar-title">BUILDINGS (Drag)</h3>
        <button id="build-crusher" class="toolbar-btn" title="Drag to place a Crusher. Q/E to rotate.">
          <span class="icon">⚙️</span> Crusher
        </button>
        <button id="build-furnace" class="toolbar-btn" title="Drag to place a Furnace. Q/E to rotate.">
          <span class="icon">🔥</span> Furnace
        </button>
      </div>

      <div class="toolbar-section separator">
        <h3 class="toolbar-title">CUSTOM TOOLS</h3>
        <button id="btn-draw-new" class="toolbar-btn secondary-btn" title="Draw a custom tool shape">
          <span class="icon">➕</span> Draw New Tool
        </button>
        <div id="custom-shapes-list" class="custom-shapes-list-container"></div>
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
    const btnDrawNew = this.container.querySelector('#btn-draw-new') as HTMLButtonElement;

    grabBtn.addEventListener('click', () => {
      this.setActiveTool('grab');
    });

    explosiveBtn.addEventListener('click', () => {
      this.setActiveTool('explosive');
    });

    btnDrawNew.addEventListener('click', () => {
      this.engine.openDrawingPopup();
    });

    // Mousedown on buildings starts drag-and-hold placement
    buildCrusherBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.setActiveTool('grab'); // Reset to grab tool for safety
      this.engine.startBuildingPlacement('crusher');
    });

    buildFurnaceBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.setActiveTool('grab');
      this.engine.startBuildingPlacement('furnace');
    });

    detonateBtn.addEventListener('click', () => {
      this.engine.detonateExplosives();
    });

    clearBtn.addEventListener('click', () => {
      this.engine.clearPaintedExplosives();
    });

    // Register callback for custom shape updates
    this.engine.onCustomShapesUpdated = (defs) => this.renderCustomShapes(defs);
    this.renderCustomShapes([]); // Show empty list message initially
  }

  private renderCustomShapes(defs: CustomShapeDef[]): void {
    const listContainer = this.container.querySelector('#custom-shapes-list') as HTMLDivElement;
    if (!listContainer) return;

    if (defs.length === 0) {
      listContainer.innerHTML = '<p class="empty-list-msg">No custom tools drawn yet.</p>';
      return;
    }

    listContainer.innerHTML = defs.map(def => {
      const icon = def.brushType === 'solid' ? '🧱' : '➡️';
      return `
        <div class="custom-shape-item" data-id="${def.id}">
          <div class="item-info" title="Click to spawn this tool in the world">
            <span class="item-icon">${icon}</span>
            <span class="item-name">${def.name}</span>
          </div>
          <div class="item-actions">
            <button class="action-btn edit-btn" title="Edit this tool">✏️</button>
            <button class="action-btn delete-btn" title="Delete this tool">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach event listeners
    const items = listContainer.querySelectorAll('.custom-shape-item');
    items.forEach(item => {
      const id = item.getAttribute('data-id')!;
      const infoBtn = item.querySelector('.item-info') as HTMLElement;
      const editBtn = item.querySelector('.edit-btn') as HTMLButtonElement;
      const deleteBtn = item.querySelector('.delete-btn') as HTMLButtonElement;

      infoBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.setActiveTool('grab'); // Reset tool state to grab
        this.engine.startCustomShapePlacement(id);
      });

      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.openDrawingPopup(id);
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.deleteCustomShape(id);
      });
    });
  }

  private setActiveTool(tool: 'grab' | 'explosive'): void {
    this.engine.setTool(tool);
    
    const grabBtn = this.container.querySelector('#tool-grab');
    const explosiveBtn = this.container.querySelector('#tool-explosive');
    if (grabBtn) grabBtn.classList.remove('active');
    if (explosiveBtn) explosiveBtn.classList.remove('active');
    
    const activeId = tool === 'grab' ? 'tool-grab' : 'tool-explosive';
    const activeBtn = this.container.querySelector(`#${activeId}`) as HTMLButtonElement;
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }
}
