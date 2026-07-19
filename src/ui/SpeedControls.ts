import { Engine } from '../core/Engine.ts';

export class SpeedControls {
  private container: HTMLDivElement;
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    this.container = document.createElement('div');
    this.container.className = 'ui-panel speed-controls-panel';
    this.container.id = 'speed-controls';
  }

  public init(parent: HTMLDivElement): void {
    this.container.innerHTML = `
      <button id="speed-pause" class="speed-btn" title="Pause simulation (Shortcut: Space)">⏸</button>
      <button id="speed-1x" class="speed-btn active" title="1x Normal speed (Shortcut: 1)">1x</button>
      <button id="speed-2x" class="speed-btn" title="2x Fast speed (Shortcut: 2)">2x</button>
      <button id="speed-4x" class="speed-btn" title="4x Hyper speed (Shortcut: 3)">4x</button>
    `;

    parent.appendChild(this.container);

    const btnPause = this.container.querySelector('#speed-pause') as HTMLButtonElement;
    const btn1x = this.container.querySelector('#speed-1x') as HTMLButtonElement;
    const btn2x = this.container.querySelector('#speed-2x') as HTMLButtonElement;
    const btn4x = this.container.querySelector('#speed-4x') as HTMLButtonElement;

    const btns = [btnPause, btn1x, btn2x, btn4x];

    const setSpeedUI = (activeBtn: HTMLButtonElement) => {
      btns.forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');
    };

    btnPause.addEventListener('click', () => {
      this.engine.togglePause();
      // Since togglePause negates the state, we check if it is now paused
      const isPaused = (this.engine as any).isPaused;
      if (isPaused) {
        setSpeedUI(btnPause);
      } else {
        // Fallback to active speed
        const activeSpeed = (this.engine as any).speedScale;
        if (activeSpeed === 1.0) setSpeedUI(btn1x);
        if (activeSpeed === 2.0) setSpeedUI(btn2x);
        if (activeSpeed === 4.0) setSpeedUI(btn4x);
      }
    });

    btn1x.addEventListener('click', () => {
      if ((this.engine as any).isPaused) this.engine.togglePause();
      this.engine.setSpeed(1.0);
      setSpeedUI(btn1x);
    });

    btn2x.addEventListener('click', () => {
      if ((this.engine as any).isPaused) this.engine.togglePause();
      this.engine.setSpeed(2.0);
      setSpeedUI(btn2x);
    });

    btn4x.addEventListener('click', () => {
      if ((this.engine as any).isPaused) this.engine.togglePause();
      this.engine.setSpeed(4.0);
      setSpeedUI(btn4x);
    });

    // Listen to window key shortcuts (1, 2, 3, Space)
    window.addEventListener('keydown', (e) => {
      // Ignore key shortcuts if the ESC menu is open
      const escMenu = parent.querySelector('.esc-menu-backdrop') as HTMLElement;
      if (escMenu && escMenu.style.display !== 'none') return;

      if (e.key === ' ') {
        btnPause.click();
        e.preventDefault();
      }
      if (e.key === '1') {
        btn1x.click();
      }
      if (e.key === '2') {
        btn2x.click();
      }
      if (e.key === '3') {
        btn4x.click();
      }
    });
  }
}
