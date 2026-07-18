export class InputManager {
  private keys: Set<string> = new Set();
  
  // Mouse states
  public mouseX: number = 0;
  public mouseY: number = 0;
  public isLeftDown: boolean = false;
  public isRightDown: boolean = false;
  public isMiddleDown: boolean = false;


  // Event callbacks
  private onPanCallback?: (dx: number, dy: number) => void;
  private onZoomCallback?: (screenX: number, screenY: number, delta: number) => void;
  private onRightDownCallback?: (screenX: number, screenY: number) => void;
  private onRightUpCallback?: (screenX: number, screenY: number) => void;
  private onRightDragCallback?: (screenX: number, screenY: number) => void;

  constructor() {}

  public init(canvasElement: HTMLCanvasElement): void {
    // Keyboard listeners
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    // Mouse position
    canvasElement.addEventListener('mousemove', (e) => {
      const rect = canvasElement.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newY = e.clientY - rect.top;

      // If dragging with middle button, trigger pan
      if (this.isMiddleDown) {
        const dx = this.mouseX - newX;
        const dy = this.mouseY - newY;
        if (this.onPanCallback) {
          this.onPanCallback(dx, dy);
        }
      }

      // If dragging with right button, trigger right-drag callback
      if (this.isRightDown) {
        if (this.onRightDragCallback) {
          this.onRightDragCallback(newX, newY);
        }
      }

      this.mouseX = newX;
      this.mouseY = newY;
    });

  // Mouse buttons
  canvasElement.addEventListener('mousedown', (e) => {
    if (e.button === 0) this.isLeftDown = true;
    if (e.button === 2) {
      this.isRightDown = true;
      e.preventDefault(); // Prevent context menu
      if (this.onRightDownCallback) {
        this.onRightDownCallback(this.mouseX, this.mouseY);
      }
    }
    if (e.button === 1) {
      this.isMiddleDown = true;
      e.preventDefault();
    }
  });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isLeftDown = false;
      if (e.button === 2) {
        this.isRightDown = false;
        if (this.onRightUpCallback) {
          this.onRightUpCallback(this.mouseX, this.mouseY);
        }
      }
      if (e.button === 1) this.isMiddleDown = false;
    });

    // Prevent context menu on right click
    canvasElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse scroll (zoom)
    canvasElement.addEventListener('wheel', (e) => {
      if (this.onZoomCallback) {
        this.onZoomCallback(this.mouseX, this.mouseY, e.deltaY);
      }
      e.preventDefault();
    }, { passive: false });
  }

  public isKeyPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  public onPan(callback: (dx: number, dy: number) => void): void {
    this.onPanCallback = callback;
  }

  public onZoom(callback: (screenX: number, screenY: number, delta: number) => void): void {
    this.onZoomCallback = callback;
  }

  public onRightDown(callback: (screenX: number, screenY: number) => void): void {
    this.onRightDownCallback = callback;
  }

  public onRightUp(callback: (screenX: number, screenY: number) => void): void {
    this.onRightUpCallback = callback;
  }

  public onRightDrag(callback: (screenX: number, screenY: number) => void): void {
    this.onRightDragCallback = callback;
  }
}
