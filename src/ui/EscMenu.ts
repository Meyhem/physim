import { Engine } from '../core/Engine.ts';

export class EscMenu {
  private container: HTMLDivElement;
  private engine: Engine;
  private currentMode: 'save' | 'load' = 'save';

  constructor(engine: Engine) {
    this.engine = engine;
    this.container = document.createElement('div');
    this.container.className = 'modal-backdrop esc-menu-backdrop';
    this.container.style.display = 'none';
  }

  public init(parent: HTMLDivElement): void {
    this.container.innerHTML = `
      <div class="ui-panel esc-menu-panel">
        <div class="esc-menu-left">
          <h2>SYSTEM MODES</h2>
          <button id="esc-btn-resume" class="toolbar-btn active">▶ Resume Simulation</button>
          <button id="esc-btn-save-mode" class="toolbar-btn secondary-btn">💾 Save Game</button>
          <button id="esc-btn-load-mode" class="toolbar-btn secondary-btn">📂 Load Game</button>
          <button id="esc-btn-restart" class="toolbar-btn danger-btn" style="margin-top: auto;">🔄 Restart World</button>
        </div>

        <div class="esc-menu-right">
          <h2 id="slots-header">SELECT SLOT</h2>
          <div id="save-slots-list" class="slots-list-container"></div>
        </div>
      </div>
    `;

    parent.appendChild(this.container);

    const btnResume = this.container.querySelector('#esc-btn-resume') as HTMLButtonElement;
    const btnSaveMode = this.container.querySelector('#esc-btn-save-mode') as HTMLButtonElement;
    const btnLoadMode = this.container.querySelector('#esc-btn-load-mode') as HTMLButtonElement;
    const btnRestart = this.container.querySelector('#esc-btn-restart') as HTMLButtonElement;

    // Menu tabs
    btnResume.addEventListener('click', () => this.close());
    
    btnSaveMode.addEventListener('click', () => {
      this.currentMode = 'save';
      btnSaveMode.classList.add('active');
      btnLoadMode.classList.remove('active');
      this.renderSlots();
    });

    btnLoadMode.addEventListener('click', () => {
      this.currentMode = 'load';
      btnLoadMode.classList.add('active');
      btnSaveMode.classList.remove('active');
      this.renderSlots();
    });

    btnRestart.addEventListener('click', () => {
      if (confirm('Are you sure you want to reload the simulation? This will clear all buildings and items!')) {
        window.location.reload();
      }
    });

    // Escape key binds
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const drawingBackdrop = parent.querySelector('.modal-backdrop');
        // Do not trigger esc menu if the drawing modal is open
        if (drawingBackdrop && (drawingBackdrop as HTMLElement).style.display === 'flex') return;

        if (this.container.style.display === 'none') {
          this.open();
        } else {
          this.close();
        }
      }
    });
  }

  public open(): void {
    this.container.style.display = 'flex';
    // Pause physics engine when menu is open
    if (!(this.engine as any).isPaused) {
      this.engine.togglePause();
    }
    
    // Default to save mode
    const btnSaveMode = this.container.querySelector('#esc-btn-save-mode') as HTMLButtonElement;
    const btnLoadMode = this.container.querySelector('#esc-btn-load-mode') as HTMLButtonElement;
    btnSaveMode.classList.add('active');
    btnLoadMode.classList.remove('active');
    this.currentMode = 'save';

    this.renderSlots();
  }

  public close(): void {
    this.container.style.display = 'none';
    // Resume physics engine when menu is closed
    if ((this.engine as any).isPaused) {
      this.engine.togglePause();
    }
  }

  private async renderSlots(): Promise<void> {
    const listContainer = this.container.querySelector('#save-slots-list') as HTMLDivElement;
    const slotsHeader = this.container.querySelector('#slots-header') as HTMLElement;
    if (!listContainer || !slotsHeader) return;

    slotsHeader.textContent = this.currentMode === 'save' ? 'SAVE GAME SLOT' : 'LOAD GAME SLOT';

    const slots = await this.engine.saveManager.getSaveSlots();
    
    // We display 5 fixed slots
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const slotName = `slot_${i}`;
      const metadata = slots.find(s => s.slot === slotName);

      if (metadata) {
        const timeStr = new Date(metadata.timestamp).toLocaleString();
        html += `
          <div class="save-slot-item occupied" data-slot="${slotName}">
            <div class="slot-info">
              <span class="slot-index">Slot ${i}</span>
              <span class="slot-label">${metadata.label}</span>
              <span class="slot-time">${timeStr}</span>
            </div>
            <span class="slot-badge">${metadata.type === 'autosave' ? 'Autosave' : 'Manual'}</span>
          </div>
        `;
      } else {
        html += `
          <div class="save-slot-item empty" data-slot="${slotName}">
            <div class="slot-info">
              <span class="slot-index">Slot ${i}</span>
              <span class="slot-label">Empty Slot</span>
            </div>
          </div>
        `;
      }
    }

    listContainer.innerHTML = html;

    // Attach click events
    const items = listContainer.querySelectorAll('.save-slot-item');
    items.forEach(item => {
      const slot = item.getAttribute('data-slot')!;
      
      item.addEventListener('click', async () => {
        if (this.currentMode === 'save') {
          // Trigger save
          const label = prompt('Enter a label for this save slot:', `Manual Save ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
          if (label !== null) {
            await this.engine.saveGame(slot, 'manual', label || 'Manual Save');
            this.renderSlots();
          }
        } else {
          // Trigger load
          if (item.classList.contains('empty')) {
            alert('This slot is empty!');
            return;
          }
          if (confirm('Load this slot? Your current simulation progress will be lost!')) {
            await this.engine.loadGame(slot);
            this.close();
          }
        }
      });
    });
  }
}
