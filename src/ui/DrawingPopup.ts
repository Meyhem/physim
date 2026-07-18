import type { Point2D } from '../physics/PolygonUtils.ts';
import type { CustomShapeDef } from '../tools/CustomShape.ts';

export class DrawingPopup {
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  
  // Drawing states
  private isDrawing: boolean = false;
  private points: Point2D[] = [];
  private brushType: 'solid' | 'conveyor' = 'solid';
  private thickness: number = 16;
  private editId: string | null = null;
  private editName: string = '';

  private onSaveCallback?: (def: CustomShapeDef) => void;
  private onCancelCallback?: () => void;

  constructor() {}

  public init(parent: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.className = 'modal-backdrop';
    this.container.style.display = 'none';

    this.container.innerHTML = `
      <div class="ui-panel drawing-popup-panel">
        <div class="drawing-popup-header">
          <h2>Draw Custom Tool</h2>
          <span class="close-btn" id="draw-close-x">&times;</span>
        </div>

        <div class="drawing-config-row">
          <div class="config-group">
            <label>Brush Type</label>
            <div class="brush-selector">
              <button id="brush-solid" class="selector-btn active">🧱 Solid Wall</button>
              <button id="brush-conveyor" class="selector-btn">➡️ Conveyor Belt</button>
            </div>
          </div>

          <div class="config-group">
            <label>Thickness: <span id="val-thickness">16px</span></label>
            <input type="range" id="slider-thickness" min="8" max="40" value="16" step="2">
          </div>
        </div>

        <div class="canvas-container">
          <canvas id="drawing-canvas" width="520" height="300"></canvas>
        </div>

        <div class="drawing-actions">
          <button id="draw-btn-clear" class="toolbar-btn secondary-btn">🧹 Clear</button>
          <button id="draw-btn-cancel" class="toolbar-btn secondary-btn" style="margin-left:auto;">Cancel</button>
          <button id="draw-btn-save" class="toolbar-btn active">💾 Save Tool</button>
        </div>
      </div>
    `;

    parent.appendChild(this.container);

    // Get elements
    this.canvas = this.container.querySelector('#drawing-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    const closeX = this.container.querySelector('#draw-close-x') as HTMLElement;
    const btnSolid = this.container.querySelector('#brush-solid') as HTMLButtonElement;
    const btnConveyor = this.container.querySelector('#brush-conveyor') as HTMLButtonElement;
    const sliderThickness = this.container.querySelector('#slider-thickness') as HTMLInputElement;
    const labelThickness = this.container.querySelector('#val-thickness') as HTMLElement;
    const btnClear = this.container.querySelector('#draw-btn-clear') as HTMLButtonElement;
    const btnCancel = this.container.querySelector('#draw-btn-cancel') as HTMLButtonElement;
    const btnSave = this.container.querySelector('#draw-btn-save') as HTMLButtonElement;

    // Events
    closeX.addEventListener('click', () => this.close());
    btnCancel.addEventListener('click', () => this.close());

    btnSolid.addEventListener('click', () => {
      this.brushType = 'solid';
      btnSolid.classList.add('active');
      btnConveyor.classList.remove('active');
      this.redraw();
    });

    btnConveyor.addEventListener('click', () => {
      this.brushType = 'conveyor';
      btnConveyor.classList.add('active');
      btnSolid.classList.remove('active');
      this.redraw();
    });

    sliderThickness.addEventListener('input', () => {
      this.thickness = parseInt(sliderThickness.value);
      labelThickness.textContent = `${this.thickness}px`;
      this.redraw();
    });

    btnClear.addEventListener('click', () => {
      this.points = [];
      this.redraw();
    });

    btnSave.addEventListener('click', () => {
      if (this.points.length < 2) {
        alert('Please draw a line of at least 2 points first!');
        return;
      }
      this.save();
    });

    this.setupCanvasListeners();
  }

  public open(onSave: (def: CustomShapeDef) => void, onCancel: () => void, editDef?: CustomShapeDef): void {
    if (!this.container) return;
    this.onSaveCallback = onSave;
    this.onCancelCallback = onCancel;
    
    // Sync UI elements with loaded def or defaults
    const btnSolid = this.container.querySelector('#brush-solid') as HTMLButtonElement;
    const btnConveyor = this.container.querySelector('#brush-conveyor') as HTMLButtonElement;
    const sliderThickness = this.container.querySelector('#slider-thickness') as HTMLInputElement;
    const labelThickness = this.container.querySelector('#val-thickness') as HTMLElement;

    if (editDef) {
      this.points = [...editDef.points];
      this.brushType = editDef.brushType;
      this.thickness = editDef.thickness;
      this.editId = editDef.id;
      this.editName = editDef.name;

      if (this.brushType === 'solid') {
        btnSolid.classList.add('active');
        btnConveyor.classList.remove('active');
      } else {
        btnConveyor.classList.add('active');
        btnSolid.classList.remove('active');
      }
      sliderThickness.value = this.thickness.toString();
      labelThickness.textContent = `${this.thickness}px`;
    } else {
      this.points = [];
      this.editId = null;
      this.editName = '';
      this.brushType = 'solid';
      this.thickness = 16;

      btnSolid.classList.add('active');
      btnConveyor.classList.remove('active');
      sliderThickness.value = '16';
      labelThickness.textContent = '16px';
    }

    this.container.style.display = 'flex';
    this.redraw();
  }

  public close(): void {
    if (!this.container) return;
    this.container.style.display = 'none';
    if (this.onCancelCallback) {
      this.onCancelCallback();
    }
  }

  private save(): void {
    if (this.onSaveCallback) {
      const def: CustomShapeDef = {
        id: this.editId || `custom_${Date.now()}`,
        name: this.editName || `Tool ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
        points: this.points,
        brushType: this.brushType,
        thickness: this.thickness
      };
      this.onSaveCallback(def);
    }
    this.close();
  }

  private setupCanvasListeners(): void {
    if (!this.canvas) return;

    const getMouseCoords = (e: MouseEvent): Point2D => {
      const rect = this.canvas!.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDrawing = true;
      this.points = [getMouseCoords(e)];
      this.redraw();
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDrawing) return;
      
      const pt = getMouseCoords(e);
      const lastPt = this.points[this.points.length - 1];
      const dist = Math.sqrt((pt.x - lastPt.x) ** 2 + (pt.y - lastPt.y) ** 2);
      
      // Minimum distance before capturing next point (reduces points counts)
      if (dist > 8) {
        this.points.push(pt);
        this.redraw();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDrawing = false;
    });
  }

  private redraw(): void {
    if (!this.canvas || !this.ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Draw blueprint grid background
    this.ctx.fillStyle = '#161620';
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.strokeStyle = '#252535';
    this.ctx.lineWidth = 1;
    
    const gridSize = 20;
    for (let x = 0; x < w; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }

    // 2. Draw user path
    if (this.points.length < 1) {
      // Draw prompt text
      this.ctx.fillStyle = '#5c5c70';
      this.ctx.font = '14px Inter, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Click and drag here to draw your shape', w / 2, h / 2);
      return;
    }

    // Color code based on brush type
    const strokeColor = this.brushType === 'solid' ? '#7f8c8d' : '#f39c12';
    
    // Draw the thick line outline (semi-transparent fill)
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = this.thickness;
    this.ctx.strokeStyle = strokeColor + '55'; // translucent
    this.ctx.beginPath();
    this.ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      this.ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    this.ctx.stroke();

    // Draw the thin core line
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.beginPath();
    this.ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      this.ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    this.ctx.stroke();

    // Draw directional arrows for conveyor belts
    if (this.brushType === 'conveyor' && this.points.length >= 2) {
      this.ctx.fillStyle = '#f39c12';
      
      // Draw arrows along the path
      let accumulatedDist = 0;
      const arrowSpacing = 40;
      
      for (let i = 0; i < this.points.length - 1; i++) {
        const p1 = this.points[i];
        const p2 = this.points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        accumulatedDist += len;
        
        if (accumulatedDist >= arrowSpacing) {
          accumulatedDist = 0;
          
          // Draw arrow pointing from p1 to p2
          const angle = Math.atan2(dy, dx);
          this.ctx.save();
          this.ctx.translate(p2.x, p2.y);
          this.ctx.rotate(angle);
          
          // Tiny triangle
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0);
          this.ctx.lineTo(-10, -5);
          this.ctx.lineTo(-10, 5);
          this.ctx.closePath();
          this.ctx.fill();
          
          this.ctx.restore();
        }
      }
    }
  }
}
