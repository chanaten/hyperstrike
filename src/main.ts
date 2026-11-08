/**
 * Boot: PixiJS stage (forward-flying starfield + softened grid backdrop)
 * → app screen manager.
 */

import './styles.css';
import { Application, Container, Graphics, type Ticker } from 'pixi.js';
import gsap from 'gsap';
import { startApp } from './ui/app';
import { motionFull } from './render/motion';

const BG = 0x12102a;
const GRID = 0x2a2660;

/**
 * Three depth layers of stars streaming toward the viewer (fake-3D pilot
 * view): stars fly out from the vanishing point at screen center, growing
 * as they approach. Speeds in z-units/sec — kept calm; fully static when
 * motion is reduced.
 */
const STAR_LAYERS = [
  { count: 70, size: 1.3, alpha: 0.4, speed: 0.18, tint: 0xffffff, warm: false },
  { count: 50, size: 1.9, alpha: 0.55, speed: 0.3, tint: 0xcfe6ff, warm: false },
  { count: 30, size: 2.7, alpha: 0.75, speed: 0.5, tint: 0x9fd8ff, warm: false },
];
const Z_NEAR = 0.4;
const Z_FAR = 4;

interface Star {
  g: Graphics;
  nx: number; // -1..1 across the field
  ny: number;
  z: number;
  speed: number;
  alphaBase: number;
}

interface Backdrop {
  root: Container;
  redraw: () => void;
  destroy: () => void;
}

function buildBackdrop(app: Application): Backdrop {
  const root = new Container();
  const grid = new Graphics();
  const starsLayer = new Container();
  root.addChild(starsLayer);
  root.addChild(grid);

  // build star sprites once (positions re-projected every frame/resize)
  const stars: Star[] = [];
  STAR_LAYERS.forEach((spec) => {
    for (let i = 0; i < spec.count; i++) {
      const g = new Graphics();
      const warm = Math.random() < 0.12;
      g.circle(0, 0, spec.size).fill({
        color: warm ? 0xffe9b0 : spec.tint,
        alpha: spec.alpha,
      });
      starsLayer.addChild(g);
      stars.push({
        g,
        nx: Math.random() * 2 - 1,
        ny: Math.random() * 2 - 1,
        z: Z_NEAR + Math.random() * (Z_FAR - Z_NEAR),
        speed: spec.speed,
        alphaBase: spec.alpha,
      });
    }
  });

  // The center of view (vanishing point) leans toward the cursor — the
  // pilot's gaze follows the pointer — and eases back to center on leave.
  const VP_FACTOR = 0.16;
  let targetNX = 0;
  let targetNY = 0;
  let vpX = 0;
  let vpY = 0;
  const onPointerMove = (e: PointerEvent): void => {
    const { width, height } = app.screen;
    targetNX = Math.max(-1, Math.min(1, (e.clientX - width / 2) / (width / 2)));
    targetNY = Math.max(-1, Math.min(1, (e.clientY - height / 2) / (height / 2)));
  };
  const onPointerLeave = (): void => {
    targetNX = 0;
    targetNY = 0;
  };
  window.addEventListener('pointermove', onPointerMove);
  document.addEventListener('mouseleave', onPointerLeave);

  const project = (): void => {
    const { width, height } = app.screen;
    const cx = width / 2 + vpX;
    const cy = height / 2 + vpY;
    const persp = Math.min(width, height) * 0.78;
    for (const s of stars) {
      s.g.x = cx + (s.nx * persp) / s.z;
      s.g.y = cy + (s.ny * persp * 0.62) / s.z;
      s.g.scale.set(1 / s.z);
      s.g.alpha = Math.min(1, s.alphaBase * (1.45 / s.z));
    }
  };

  const redraw = (): void => {
    const { width, height } = app.screen;

    // softened console grid over the starfield
    grid.clear();
    grid.setStrokeStyle({ width: 1, color: GRID, alpha: 0.22 });
    const step = 64;
    for (let x = 0; x <= width; x += step) {
      grid.moveTo(x, 0);
      grid.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
    }
    grid.stroke();

    project();
  };
  redraw();

  // forward flight: z shrinks, stars swell and sweep outward past the edges;
  // the center of view eases toward the cursor each frame
  const drift = (ticker: Ticker): void => {
    if (!motionFull()) return;
    const dt = ticker.deltaMS / 1000;
    const { width, height } = app.screen;
    const ease = 1 - Math.exp(-3.2 * dt); // frame-rate independent smoothing
    vpX += (targetNX * (width / 2) * VP_FACTOR - vpX) * ease;
    vpY += (targetNY * (height / 2) * VP_FACTOR - vpY) * ease;
    for (const s of stars) {
      s.z -= s.speed * dt;
      if (s.z <= Z_NEAR) {
        // respawn far ahead near the vanishing point
        s.z = Z_FAR + Math.random() * 0.6;
        s.nx = Math.random() * 2 - 1;
        s.ny = Math.random() * 2 - 1;
      }
    }
    project();
  };
  app.ticker.add(drift);

  // dev/test aid: current center-of-view offset
  (window as unknown as Record<string, unknown>).__starfield = () => ({
    x: Math.round(vpX),
    y: Math.round(vpY),
  });

  return {
    root,
    redraw,
    destroy: () => {
      app.ticker.remove(drift);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
      delete (window as unknown as Record<string, unknown>).__starfield;
      root.destroy({ children: true });
    },
  };
}

async function boot(): Promise<void> {
  // Advance tweens by wall-time even in throttled/hidden tabs, so beats never
  // crawl in slow motion when the window is occluded.
  gsap.ticker.lagSmoothing(0);

  // Pixi bakes text into textures at creation, so the card font must be
  // ready before the first deal. Never block boot for long (offline/first
  // visit): fall back to Arial Black if it does not arrive in time.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 16px Orbitron'),
        document.fonts.load('900 40px Orbitron'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* fallback font stack applies */
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (!canvas) throw new Error('missing #game-canvas');

  const app = new Application();
  await app.init({
    canvas,
    background: BG,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  const backdrop = buildBackdrop(app);
  app.stage.addChild(backdrop.root);
  const onResize = (): void => backdrop.redraw();
  app.renderer.on('resize', onResize);
  window.addEventListener('beforeunload', () => {
    app.renderer.off('resize', onResize);
    backdrop.destroy();
  });

  startApp(app);
  document.documentElement.dataset.booted = 'true';
}

void boot();
