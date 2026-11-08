/**
 * Card visuals: vector-drawn faces (big number + damage icons with danger
 * color-coding, foil sheen above 70) and neon card backs. No image assets.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { damage } from '../engine/cards';
import { COLORS, type CardMetrics } from './theme';

/** Danger tint by damage count (shape+color, never color alone).
 *  Chip variants are darkened for legibility on the white card face. */
function dangerColor(dmg: number): number {
  if (dmg >= 7) return 0xd01030;
  if (dmg === 5) return 0xc97f00;
  if (dmg === 3) return 0x8f8ab8;
  return 0x6b66a0;
}

/**
 * Targeting reticle: circle + four cardinal ticks + center dot
 * (the card's damage-chip glyph).
 */
export function drawReticle(g: Graphics, x: number, y: number, s: number, color: number): void {
  const r = s * 0.36;
  const lw = Math.max(1, s * 0.13);
  g.circle(x, y, r).stroke({ width: lw, color });
  // cardinal ticks
  const t0 = r + lw;
  const t1 = r + s * 0.24;
  g.moveTo(x, y - t0).lineTo(x, y - t1);
  g.moveTo(x, y + t0).lineTo(x, y + t1);
  g.moveTo(x - t0, y).lineTo(x - t1, y);
  g.moveTo(x + t0, y).lineTo(x + t1, y);
  g.stroke({ width: lw, color, cap: 'round' });
  // center dot
  g.circle(x, y, Math.max(1, s * 0.09)).fill(color);
}

/** Impact starburst (card back emblem): spiky radial blast. */
export function drawStarburst(g: Graphics, x: number, y: number, s: number, color: number): void {
  const spikes = 8;
  const outer = s * 0.5;
  const inner = s * 0.2;
  const pts: number[] = [];
  for (let k = 0; k < spikes * 2; k++) {
    const ang = (k * Math.PI) / spikes - Math.PI / 2;
    const rad = k % 2 === 0 ? outer : inner;
    pts.push(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
  }
  g.poly(pts).fill(color);
  g.circle(x, y, s * 0.1).fill({ color: 0xffffff, alpha: 0.85 });
}

function roundedRect(g: Graphics, w: number, h: number, r: number): void {
  g.roundRect(-w / 2, -h / 2, w, h, r);
}

export interface CardView {
  container: Container;
  /** Crossfade-free flip: call at scaleX≈0. */
  showFace: () => void;
  showBack: () => void;
  /** Redraw the vector art at new metrics (window resized / rotated),
   *  preserving whichever side is currently shown. */
  resize: (m: CardMetrics) => void;
}

/** Card face: hero number, danger border, foil sheen, damage chip. */
function buildFace(value: number, m: CardMetrics): Container {
  const face = new Container();
  const bh = damage(value);
  const danger = dangerColor(bh);
  const isSeven = bh >= 7;
  const isFive = bh === 5;
  const foil = value >= 70;

  const pad = m.w * 0.06;
  const maxContentW = m.w - pad * 2;

  const bg = new Graphics();
  roundedRect(bg, m.w, m.h, m.radius);
  bg.fill(foil ? COLORS.cardFaceHi : COLORS.cardFace);
  // danger border: 1/2/3 neutral, 5 gold, 7 red
  bg.stroke({
    width: Math.max(1.5, m.h * 0.03),
    color: isSeven ? COLORS.danger : isFive ? COLORS.yellow : 0xb9b4e0,
    alpha: isSeven || isFive ? 0.95 : 0.6,
  });
  face.addChild(bg);

  if (foil) {
    const streak = new Graphics();
    streak.poly([
      -m.w * 0.5,
      m.h * 0.18,
      m.w * 0.18,
      -m.h * 0.5,
      m.w * 0.38,
      -m.h * 0.5,
      -m.w * 0.3,
      m.h * 0.5,
      -m.w * 0.5,
      m.h * 0.5,
    ]);
    streak.fill({ color: 0xffffff, alpha: 0.35 });
    face.addChild(streak);
  }

  const label = String(value);
  // Arial Black digit ≈ 0.62em wide — fit the card width
  const fontSize = Math.min(
    Math.floor(m.h * 0.4),
    Math.floor(maxContentW / (label.length * 0.62)),
  );
  const num = new Text({
    text: label,
    style: {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize,
      fontWeight: '900',
      fill: isSeven ? 0xb01030 : 0x1a1740,
    },
  });
  num.anchor.set(0.5);
  num.x = 0;
  num.y = -m.h * 0.05; // hero number sits above the damage chip
  face.addChild(num);

  // bottom-left damage chip: value + targeting reticle
  const chip = new Container();
  const chipFont = Math.max(10, Math.floor(m.h * 0.1875)); // +25%
  const dmgText = new Text({
    text: String(bh),
    style: {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: chipFont,
      fontWeight: '900',
      fill: danger,
    },
  });
  dmgText.anchor.set(0, 0.5);
  dmgText.x = 0;
  chip.addChild(dmgText);
  const reticleSize = Math.max(11, m.h * 0.1625); // +25%
  const ret = new Graphics();
  drawReticle(
    ret,
    dmgText.width + reticleSize * 0.62,
    0,
    reticleSize,
    danger,
  );
  chip.addChild(ret);
  chip.x = -m.w / 2 + pad;
  chip.y = m.h / 2 - pad - chipFont * 0.5;
  face.addChild(chip);
  return face;
}

/** Neon card back: double frame + impact starburst. */
function buildBack(m: CardMetrics): Container {
  const back = new Container();
  const bb = new Graphics();
  roundedRect(bb, m.w, m.h, m.radius);
  bb.fill(COLORS.cardBack);
  bb.stroke({ width: Math.max(1.5, m.h * 0.03), color: COLORS.cardBackLine, alpha: 0.85 });
  bb.roundRect(-m.w * 0.4, -m.h * 0.4, m.w * 0.8, m.h * 0.8, m.radius * 0.6);
  bb.stroke({ width: Math.max(1, m.h * 0.015), color: COLORS.cardBackLine, alpha: 0.35 });
  back.addChild(bb);
  const glyph = new Graphics();
  drawStarburst(glyph, 0, 0, Math.min(m.w, m.h) * 0.5, COLORS.cardBackLine);
  back.addChild(glyph);
  return back;
}

/** A card that can display either its face or its back (for flips). */
export function createCard(value: number, initial: CardMetrics): CardView {
  const container = new Container();
  let metrics = initial;
  let showing: 'face' | 'back' = 'face';

  const build = (): void => {
    container.removeChildren().forEach((c) => c.destroy({ children: true }));
    const face = buildFace(value, metrics);
    const back = buildBack(metrics);
    face.visible = showing === 'face';
    back.visible = showing === 'back';
    container.addChild(face, back);
  };
  build();

  return {
    container,
    showFace: () => {
      showing = 'face';
      container.children[0].visible = true;
      container.children[1].visible = false;
    },
    showBack: () => {
      showing = 'back';
      container.children[0].visible = false;
      container.children[1].visible = true;
    },
    resize: (m: CardMetrics) => {
      if (Math.abs(m.w - metrics.w) < 0.5 && Math.abs(m.h - metrics.h) < 0.5) return;
      metrics = m;
      build();
    },
  };
}

/** A short stack of card backs for an opponent's hand. */
export function createBackStack(m: CardMetrics, count: number): Container {
  const stack = new Container();
  const layers = Math.min(3, Math.max(1, Math.ceil(count / 4)));
  for (let i = layers - 1; i >= 0; i--) {
    const g = new Graphics();
    roundedRect(g, m.w, m.h, m.radius);
    g.fill(COLORS.cardBack);
    g.stroke({ width: Math.max(1.5, m.h * 0.045), color: COLORS.cardBackLine, alpha: 0.85 });
    g.x = i * m.w * 0.07;
    g.y = -i * m.h * 0.05;
    stack.addChild(g);
  }
  return stack;
}
