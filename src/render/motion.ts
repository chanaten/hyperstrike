/**
 * Motion helpers: speed-aware durations, arc flights, flips, and juice.
 * All timing divides by the ×2 speed toggle; juice scales with the motion
 * intensity setting (Q28) and OS reduced-motion.
 */

import { gsap } from 'gsap';
import { Graphics, type Container } from 'pixi.js';
import { getSettings } from '../state/settingsStore';

/** Convert a design duration (seconds at ×1) to real seconds. */
export function dur(seconds: number): number {
  return seconds / getSettings().speed;
}

export function motionFull(): boolean {
  return getSettings().motion === 'full';
}

export interface FlyOptions {
  /** Peak height of the arc (px, positive = arcs upward). */
  arc?: number;
  /** End rotation in radians. */
  rotation?: number;
  ease?: string;
}

/**
 * Fly a container along an arc from its current position to (x, y).
 * Uses two eased tweens on a progress value so x and y can differ.
 */
export function flyArc(
  target: Container,
  x: number,
  y: number,
  seconds: number,
  opts: FlyOptions = {},
): gsap.core.Timeline {
  const { arc = 0, rotation = target.rotation, ease = 'power2.inOut' } = opts;
  const sx = target.x;
  const sy = target.y;
  const sr = target.rotation;
  const state = { p: 0 };
  const tl = gsap.timeline();
  tl.to(state, {
    p: 1,
    duration: dur(seconds),
    ease,
    onUpdate: () => {
      const p = state.p;
      target.x = sx + (x - sx) * p;
      // parabolic arc: rises then settles
      target.y = sy + (y - sy) * p - Math.sin(p * Math.PI) * arc;
      target.rotation = sr + (rotation - sr) * p;
    },
  });
  return tl;
}

/** Card flip at scaleX≈0: collapse, swap face/back, expand. */
export function flipCard(
  view: { container: Container; showFace: () => void; showBack: () => void },
  toFace: boolean,
  base = 1,
): gsap.core.Timeline {
  const c = view.container;
  const tl = gsap.timeline();
  tl.to(c.scale, {
    x: 0.02,
    duration: dur(0.12),
    ease: 'power2.in',
    onComplete: () => (toFace ? view.showFace() : view.showBack()),
  }).to(c.scale, {
    x: base,
    y: base,
    duration: dur(0.18),
    ease: 'back.out(2.2)',
  });
  return tl;
}

/** Small settle with overshoot after a card lands. */
export function settle(target: Container, base = 1): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.fromTo(
    target.scale,
    { x: base * 1.12, y: base * 1.12 },
    { x: base, y: base, duration: dur(0.22), ease: 'elastic.out(1, 0.55)' },
  );
  return tl;
}

/** Screen shake for big moments — only at full motion intensity. */
export function shake(target: Container, amount: number): void {
  if (!motionFull()) return;
  const a = amount * (getSettings().speed === 2 ? 0.5 : 1);
  const tl = gsap.timeline();
  const ox = target.x;
  const oy = target.y;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n;
    tl.to(target, {
      x: ox + (Math.random() - 0.5) * a * k,
      y: oy + (Math.random() - 0.5) * a * k * 0.6,
      duration: dur(0.03),
      ease: 'none',
    });
  }
  tl.to(target, { x: ox, y: oy, duration: dur(0.04), ease: 'power1.out' });
}

/** A quick neon particle burst (juice for penalties / big moments). */
export function burst(
  layer: Container,
  x: number,
  y: number,
  color: number,
  opts: { count?: number; spread?: number } = {},
): void {
  if (!motionFull()) return;
  const count = opts.count ?? 10;
  const spread = opts.spread ?? 60;
  for (let i = 0; i < count; i++) {
    const dot = new Graphics();
    const size = 3 + Math.random() * 4;
    dot.circle(0, 0, size).fill(color);
    dot.x = x;
    dot.y = y;
    dot.alpha = 0.95;
    layer.addChild(dot);
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random() * 0.6);
    gsap.to(dot, {
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist + 14,
      alpha: 0,
      duration: dur(0.5 + Math.random() * 0.3),
      ease: 'power2.out',
      onComplete: () => dot.destroy(),
    });
  }
}

/** Await helper: resolve after a scaled duration (used for beat pauses). */
export function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => gsap.delayedCall(dur(seconds), resolve));
}
