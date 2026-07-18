import { Container, Graphics } from 'pixi.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private container: Container;
  private graphics: Graphics;
  private particles: Particle[] = [];

  constructor(container: Container) {
    this.container = container;
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  /**
   * Spawns a burst of explosion particles at a coordinate.
   */
  public spawnExplosion(x: number, y: number, radius: number): void {
    const particleCount = 40 + Math.floor(Math.random() * 20);
    
    // Core fire/orange colors
    const colors = [0xFF4500, 0xFF8C00, 0xFFA500, 0xFFD700, 0xDCDCDC];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // High initial velocity exploding outwards
      const speed = 100 + Math.random() * 400 * (radius / 100);
      
      const life = 0.4 + Math.random() * 0.6; // 0.4 to 1.0 seconds
      const size = 2 + Math.random() * 6;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
        alpha: 1.0,
        life,
        maxLife: life
      });
    }
  }

  /**
   * Spawns dust particles (e.g. from fracturing or items sliding).
   */
  public spawnDust(x: number, y: number, color: number, count: number = 3): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 4 - Math.random() * Math.PI / 2; // Upwards burst
      const speed = 20 + Math.random() * 60;
      const life = 0.2 + Math.random() * 0.3;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 3,
        alpha: 0.8,
        life,
        maxLife: life
      });
    }
  }

  public update(dt: number): void {
    const gravity = 250; // pixels/s^2
    const friction = 0.96; // drag coefficient per frame

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Apply physics to particles
      p.vy += gravity * dt;
      p.vx *= Math.pow(friction, dt * 60);
      p.vy *= Math.pow(friction, dt * 60);

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Fade out
      p.alpha = Math.max(0, p.life / p.maxLife);
    }

    // Redraw
    this.renderParticles();
  }

  private renderParticles(): void {
    this.graphics.clear();
    
    for (const p of this.particles) {
      // Draw a circle for each particle
      this.graphics.fill({ color: p.color, alpha: p.alpha });
      this.graphics.drawCircle(p.x, p.y, p.size);
    }
  }

  public clear(): void {
    this.particles = [];
    this.graphics.clear();
  }
}
