import './style.css';
import { Engine } from './core/Engine.ts';
import { Toolbar } from './ui/Toolbar.ts';
import { SpeedControls } from './ui/SpeedControls.ts';
import { EscMenu } from './ui/EscMenu.ts';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiContainer = document.getElementById('ui-container') as HTMLDivElement;
  if (!canvas || !uiContainer) {
    console.error('Canvas or UI container element not found!');
    return;
  }

  const engine = new Engine();
  try {
    await engine.init(canvas);
    
    // Initialize UI toolbar
    const toolbar = new Toolbar(engine);
    toolbar.init(uiContainer);

    // Initialize Speed Controls
    const speedControls = new SpeedControls(engine);
    speedControls.init(uiContainer);

    // Initialize ESC Menu
    const escMenu = new EscMenu(engine);
    escMenu.init(uiContainer);

    engine.start();
    (window as any).engine = engine;
    console.log('PhySim engine started successfully.');
  } catch (err) {
    console.error('Failed to initialize PhySim engine:', err);
  }
});
