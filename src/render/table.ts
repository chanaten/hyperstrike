/**
 * The PixiJS table: layout, cards, seats, HUD, and the full motion
 * choreography for the match controller's UI hooks.
 *
 * Beat structure (Q8/Q10):
 *   deal → roundStart (brief skippable beat) → [your pick flies face-down]
 *   → botCommit stagger → simultaneous reveal → resolve in ascending order
 *   (arc flights, row takes fly to the taker's badge) → handEnd tally.
 *
 * Pausing gates at hook entry, so it always lands between beats (Q31).
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import type { EngineEvent, MatchState } from '../engine/rules';
import { findTargetRow } from '../engine/rules';
import { play } from '../audio/sfx';
import { onLanguageChange, t } from '../i18n';
import { createBackStack, createCard, type CardView } from './card';
import { burst, dur, flyArc, flipCard, motionFull, settle, shake, wait } from './motion';
import { COLORS, computeLayout, ROW_SLOTS, type Layout } from './theme';

const BOT_COLORS = [COLORS.cyan, 0xb64dff, 0xffb84d, 0xff4dd8, 0x4dff9e];
/** Per-seat reveal rhythm — a light touch of bot personality (Q14). */
const BOT_CADENCE = [0, 0.14, 0.05, 0.22, 0.09];

interface Staged {
  view: CardView;
  value: number;
}

export interface TableCallbacks {
  /** Human confirmed a card; the shell calls controller.humanPlay. */
  onPlay: (card: number) => Promise<void>;
  /** Whether card selection input is allowed right now. */
  canInput: () => boolean;
}

export class TableRenderer {
  private readonly app: Application;
  private readonly cb: TableCallbacks;
  private readonly root = new Container();
  private readonly matLayer = new Container();
  private readonly tableLayer = new Container();
  private readonly cardLayer = new Container();
  private readonly hudLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly glowLayer = new Container();

  private layout: Layout;
  private state: MatchState | null = null;

  // visual entities
  private rowCards: CardView[][] = [[], [], [], []];
  private handCards = new Map<number, CardView>();
  private handOrder: number[] = [];
  private stacks: (Container | null)[] = [null, null, null, null, null];
  private avatars: Container[] = [];
  private badgeTexts: Text[] = [];
  private badgeBoxes: Graphics[] = [];
  private badgeFills: Graphics[] = [];
  private hpValues: number[] = [];
  private roundText!: Text;
  private roundBar!: Graphics;
  private rowPrompt!: Text;
  private rowGlow!: Graphics;

  // interaction
  private staged: (Staged | null)[] = [null, null, null, null, null];
  private selected: number | null = null;
  private hovered: number | null = null;
  private highlightRow: number | null = null;
  private rowChoiceActive = false;
  private rowChoiceResolve: ((row: number) => void) | null = null;
  private readonly rowHitAreas: Graphics[] = [];
  private beatWaiters: (() => void)[] = [];
  private awaitingBeat = false;
  private busy = false;
  private promptCard: number | null = null;
  private destroyed = false;
  private guideCard: number | null = null;
  paused = false;
  private pauseWaiters: (() => void)[] = [];
  private readonly onWindowResize = (): void => this.relayout();

  constructor(app: Application, cb: TableCallbacks) {
    this.app = app;
    this.cb = cb;
    this.layout = computeLayout(app.screen.width, app.screen.height);

    this.root.addChild(this.matLayer, this.tableLayer, this.glowLayer, this.cardLayer, this.hudLayer, this.fxLayer);
    this.root.label = 'root';
    this.matLayer.label = 'mat';
    this.tableLayer.label = 'table';
    this.cardLayer.label = 'cards';
    this.hudLayer.label = 'hud';
    this.fxLayer.label = 'fx';
    this.glowLayer.label = 'glow';
    app.stage.addChild(this.root);
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', () => this.onBackgroundClick());

    this.buildHud();
    this.relayout();
    window.addEventListener('resize', this.onWindowResize);
    onLanguageChange(() => {
      this.drawRoundBar();
      if (this.promptCard !== null && this.rowPrompt.visible) {
        this.rowPrompt.text = t('game.rowPrompt', { c: this.promptCard });
      }
    });
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(): void {
    this.roundText = new Text({
      text: '',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 13, fill: COLORS.inkDim, letterSpacing: 2 },
    });
    this.roundText.anchor.set(0, 0.5);
    this.hudLayer.addChild(this.roundText);

    this.roundBar = new Graphics();
    this.hudLayer.addChild(this.roundBar);

    this.rowGlow = new Graphics();
    this.glowLayer.addChild(this.rowGlow);

    this.rowPrompt = new Text({
      text: '',
      style: { fontFamily: 'Arial Black, sans-serif', fontSize: 20, fill: COLORS.yellow, fontWeight: '900' },
    });
    this.rowPrompt.anchor.set(0.5);
    this.rowPrompt.visible = false;
    this.hudLayer.addChild(this.rowPrompt);

    for (let i = 0; i < 5; i++) {
      const box = new Graphics();
      this.badgeBoxes.push(box);
      this.hudLayer.addChild(box);

      const fill = new Graphics();
      this.badgeFills.push(fill);
      this.hudLayer.addChild(fill);

      const t = new Text({
        text: '100',
        style: {
          fontFamily: 'Arial Black, sans-serif',
          fontSize: 15,
          fontWeight: '900',
          fill: 0xffffff,
          dropShadow: { color: 0x000000, alpha: 0.5, distance: 1, blur: 2 },
        },
      });
      t.anchor.set(0.5);
      this.badgeTexts.push(t);
      this.hudLayer.addChild(t);
      this.hpValues.push(100);
    }

    for (let i = 0; i < 4; i++) {
      const hit = new Graphics();
      hit.eventMode = 'none';
      hit.cursor = 'pointer';
      hit.on('pointerdown', (e) => {
        e.stopPropagation();
        if (this.rowChoiceActive) this.chooseRow(i);
      });
      // same cyan outline as the card-hover target preview, driven by row hover
      hit.on('pointerover', () => {
        if (this.rowChoiceActive) this.setRowHighlight(i);
      });
      hit.on('pointerout', () => {
        if (this.rowChoiceActive && this.highlightRow === i) this.setRowHighlight(null);
      });
      this.rowHitAreas.push(hit);
      this.glowLayer.addChild(hit);
    }
  }

  private layoutBadge(i: number): void {
    const pos = this.layout.badges[i];
    const w = 58;
    const h = 26;
    const g = this.badgeBoxes[i];
    g.clear();
    g.roundRect(pos.x - w / 2, pos.y - h / 2, w, h, 7);
    g.fill({ color: 0x0e0c26, alpha: 0.92 });
    g.stroke({ width: 1.5, color: BOT_COLORS[i], alpha: 0.9 });
    this.badgeTexts[i].x = pos.x;
    this.badgeTexts[i].y = pos.y;
    this.badgeFills[i].x = pos.x;
    this.badgeFills[i].y = pos.y;
    this.paintBadge(i);
  }

  /** HP pill fill + number: tinted with the seat's own color; the bar
   *  shrinks as HP drops. Fill is inset evenly inside the pill frame. */
  private paintBadge(i: number): void {
    const w = 58;
    const h = 26;
    const hp = this.hpValues[i] ?? 100;
    const ratio = Math.max(0, Math.min(1, hp / 100));
    const color = BOT_COLORS[i];
    const inset = 3;
    const fill = this.badgeFills[i];
    fill.clear();
    if (ratio > 0) {
      const fw = Math.max(4, (w - inset * 2) * ratio);
      fill.roundRect(-w / 2 + inset, -h / 2 + inset, fw, h - inset * 2, 5);
      fill.fill({ color, alpha: 0.35 });
    }
    this.badgeTexts[i].text = String(Math.max(0, Math.round(hp)));
  }

  // --------------------------------------------------------------- layout

  relayout(): void {
    this.layout = computeLayout(this.app.screen.width, this.app.screen.height);
    this.app.stage.hitArea = this.app.screen;
    const L = this.layout;

    this.drawMat();

    this.rowCards.forEach((row, r) => row.forEach((c, i) => this.placeRowCard(c, r, i)));
    this.layoutHand(false);

    for (let i = 0; i < 5; i++) {
      const seat = L.seats[i];
      const av = this.avatars[i];
      if (av) {
        av.x = seat.x;
        av.y = seat.y;
      }
      const st = this.stacks[i];
      if (st && i !== 0) {
        st.x = L.piles[i].x;
        st.y = L.piles[i].y;
      }
      this.layoutBadge(i);
    }

    this.roundText.x = L.roundLine.x;
    this.roundText.y = L.roundLine.y - 14;
    this.drawRoundBar();

    for (let r = 0; r < 4; r++) {
      const g = this.rowHitAreas[r];
      g.clear();
      g.roundRect(
        L.rowOriginX - 8,
        L.rowY(r) - 6,
        6 * L.rowCard.w + 5 * L.rowGapX + 16,
        L.rowCard.h + 12,
        8,
      );
      g.fill({ color: 0xffffff, alpha: 0.001 });
    }
    this.rowPrompt.x = L.screenW / 2;
    this.rowPrompt.y = Math.max(30, L.rowOriginY - 26);

    this.staged.forEach((s, i) => {
      if (s) {
        const p = L.staging[i];
        gsap.killTweensOf(s.view.container);
        s.view.container.x = p.x;
        s.view.container.y = p.y;
      }
    });

    this.paintRowGlow();
  }

  private placeRowCard(c: CardView, row: number, index: number): void {
    const L = this.layout;
    c.container.x = L.rowOriginX + index * (L.rowCard.w + L.rowGapX) + L.rowCard.w / 2;
    c.container.y = L.rowY(row) + L.rowCard.h / 2;
  }

  /**
   * The playmat: transparent slot outlines under every row — five white
   * slots (a row holds 5 cards) plus a red danger slot at the 6th
   * position (landing there means taking the row).
   */
  private drawMat(): void {
    const L = this.layout;
    this.matLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (let r = 0; r < 4; r++) {
      for (let s = 0; s < ROW_SLOTS; s++) {
        const g = new Graphics();
        const x = L.rowOriginX + s * (L.rowCard.w + L.rowGapX);
        const y = L.rowY(r);
        const danger = s === ROW_SLOTS - 1;
        g.roundRect(x, y, L.rowCard.w, L.rowCard.h, L.rowCard.radius);
        g.fill({
          color: danger ? COLORS.danger : 0xffffff,
          alpha: danger ? 0.12 : 0.045,
        });
        g.stroke({
          width: Math.max(1, L.rowCard.h * 0.015),
          color: danger ? COLORS.danger : 0xffffff,
          alpha: danger ? 0.42 : 0.16,
        });
        this.matLayer.addChild(g);
      }
    }
  }

  /** Hand spacing: cards sit side by side with a gap, never overlapping. */
  private handStep(n: number): number {
    const L = this.layout;
    const gap = L.handCard.w * 0.1;
    const ideal = L.handCard.w + gap;
    const total = L.handCard.w + (n - 1) * ideal;
    if (total <= L.screenW * 0.94) return ideal;
    // extreme window: shrink the gap first, overlap only as a last resort
    return Math.max(
      L.handCard.w * 0.6,
      (L.screenW * 0.94 - L.handCard.w) / Math.max(1, n - 1),
    );
  }

  private rowRect(row: number): { x: number; y: number; w: number; h: number } {
    const L = this.layout;
    return {
      x: L.rowOriginX - 10,
      y: L.rowY(row) - 8,
      w: 6 * L.rowCard.w + 5 * L.rowGapX + 20,
      h: L.rowCard.h + 16,
    };
  }

  private layoutHand(animate: boolean): void {
    const L = this.layout;
    const n = this.handOrder.length;
    if (n === 0) return;
    const step = this.handStep(n);
    const totalW = L.handCard.w + (n - 1) * step;
    const startX = (L.screenW - totalW) / 2 + L.handCard.w / 2;
    this.handOrder.forEach((value, i) => {
      const view = this.handCards.get(value);
      if (!view) return;
      const x = startX + i * step;
      const y = L.handY + L.handCard.h / 2 + (this.selected === value ? -18 : 0);
      const s = this.selected === value ? 1.06 : 1;
      if (animate) {
        gsap.to(view.container, {
          x,
          y,
          duration: dur(0.26),
          ease: 'power2.out',
          overwrite: 'auto',
        });
        gsap.to(view.container.scale, {
          x: s,
          y: s,
          duration: dur(0.18),
          overwrite: 'auto',
        });
      } else {
        view.container.x = x;
        view.container.y = y;
        view.container.scale.set(s);
      }
    });
  }

  private drawRoundBar(): void {
    const L = this.layout;
    const round = this.state?.round ?? 0;
    this.roundText.text = t('game.round', { n: Math.min(round + 1, 10) });
    this.roundBar.clear();
    this.roundBar.rect(L.roundLine.x, L.roundLine.y, L.roundLine.w, 5);
    this.roundBar.fill({ color: 0x2a2660 });
    const fillW = L.roundLine.w * Math.min(1, round / 10);
    if (fillW > 0) {
      this.roundBar.roundRect(L.roundLine.x, L.roundLine.y, fillW, 5, 3);
      this.roundBar.fill({ color: COLORS.cyan, alpha: 0.85 });
    }
  }

  setRowHighlight(row: number | null): void {
    this.highlightRow = row;
    this.paintRowGlow();
  }

  private paintRowGlow(): void {
    this.rowGlow.clear();
    gsap.killTweensOf(this.rowGlow);
    this.rowGlow.alpha = 1;
    if (this.highlightRow === null) {
      this.rowGlow.visible = false;
      return;
    }
    const r = this.rowRect(this.highlightRow);
    this.rowGlow.visible = true;
    this.rowGlow.roundRect(r.x, r.y, r.w, r.h, 10);
    this.rowGlow.stroke({ width: 3, color: COLORS.cyan, alpha: 0.95 });
    this.rowGlow.stroke({ width: 9, color: COLORS.cyan, alpha: 0.22 });
    if (motionFull()) {
      gsap.to(this.rowGlow, {
        alpha: 0.55,
        duration: dur(0.5),
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    }
  }

  // ------------------------------------------------------------- hooks

  async deal(state: MatchState): Promise<void> {
    if (this.destroyed) return;
    this.state = state;
    this.busy = true;
    this.selected = null;
    this.hovered = null;
    this.setRowHighlight(null);

    // clear previous visuals (keep HUD texts/boxes — they get reused)
    for (const layer of [this.tableLayer, this.cardLayer]) {
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
    this.avatars.forEach((a) => a.destroy({ children: true }));
    this.rowCards = [[], [], [], []];
    this.handCards.clear();
    this.handOrder = [];
    this.stacks = [null, null, null, null, null];
    this.avatars = [];
    this.staged = [null, null, null, null, null];

    const L = this.layout;
    const tweens: gsap.core.Tween[] = [];

    // rows: four starting cards drop in
    state.rows.forEach((row, r) => {
      row.forEach((value, i) => {
        const view = createCard(value, L.rowCard);
        this.tableLayer.addChild(view.container);
        const targetX = L.rowOriginX + i * (L.rowCard.w + L.rowGapX) + L.rowCard.w / 2;
        const targetY = L.rowY(r) + L.rowCard.h / 2;
        view.container.x = L.screenW / 2;
        view.container.y = -40;
        view.container.alpha = 0;
        this.rowCards[r].push(view);
        const delay = 0.05 * r + 0.04 * i;
        tweens.push(
          gsap.to(view.container, {
            x: targetX,
            y: targetY,
            alpha: 1,
            duration: dur(0.5),
            delay: dur(delay),
            ease: 'back.out(1.5)',
          }),
        );
      });
    });

    // seats: avatars, stacks, badges
    for (let i = 0; i < 5; i++) {
      const seat = L.seats[i];
      const av = this.buildAvatar(i, state.players[i].name);
      av.x = seat.x;
      av.y = seat.y;
      av.alpha = 0;
      this.avatars.push(av);
      this.hudLayer.addChild(av);
      tweens.push(gsap.to(av, { alpha: 1, duration: dur(0.4), delay: dur(0.1 + i * 0.05) }));

      if (i !== 0) {
        const stack = this.buildStack(i, state.players[i].hand.length);
        stack.alpha = 0;
        this.stacks[i] = stack;
        this.cardLayer.addChild(stack);
        tweens.push(gsap.to(stack, { alpha: 1, duration: dur(0.4), delay: dur(0.2 + i * 0.05) }));
      }

      this.hpValues[i] = Math.max(0, 100 - state.players[i].score);
      this.layoutBadge(i);
      this.badgeBoxes[i].alpha = 0;
      this.badgeFills[i].alpha = 0;
      this.badgeTexts[i].alpha = 0;
      tweens.push(
        gsap.to([this.badgeBoxes[i], this.badgeFills[i], this.badgeTexts[i]], {
          alpha: 1,
          duration: dur(0.4),
          delay: dur(0.25 + i * 0.05),
        }),
      );
    }

    // hand: fan up from below, x preset to final slot (only y+alpha animate)
    this.handOrder = [...state.players[0].hand];
    const n = this.handOrder.length;
    const step = this.handStep(n);
    const totalW = L.handCard.w + (n - 1) * step;
    const startX = (L.screenW - totalW) / 2 + L.handCard.w / 2;
    this.handOrder.forEach((value, i) => {
      const view = createCard(value, L.handCard);
      this.handCards.set(value, view);
      this.cardLayer.addChild(view.container);
      view.container.x = startX + i * step;
      view.container.y = L.screenH + 70;
      view.container.alpha = 0;
      this.attachHandCard(view, value);
      tweens.push(
        gsap.to(view.container, {
          y: L.handY + L.handCard.h / 2,
          alpha: 1,
          duration: dur(0.5),
          delay: dur(0.15 + i * 0.045),
          ease: 'back.out(1.2)',
        }),
      );
    });

    this.drawRoundBar();
    await Promise.all(tweens.map((t) => t.then()));
    this.busy = false;
  }

  private buildStack(player: number, count: number): Container {
    const L = this.layout;
    const pile = L.piles[player];
    const stack = createBackStack(L.handCard, count);
    // outer edge of the side seat — clear of the avatar and name
    stack.x = pile.x;
    stack.y = pile.y;
    return stack;
  }

  private rebuildStack(player: number, count: number): void {
    if (player === 0) return;
    const old = this.stacks[player];
    const alpha = old ? old.alpha : 1;
    old?.destroy({ children: true });
    const next = this.buildStack(player, Math.max(0, count));
    next.alpha = alpha;
    this.stacks[player] = next;
    this.cardLayer.addChild(next);
  }

  private buildAvatar(index: number, name: string): Container {
    const c = new Container();
    const r = 24;
    const ring = new Graphics();
    ring.circle(0, 0, r + 3).stroke({ width: 3, color: BOT_COLORS[index], alpha: 0.95 });
    ring.circle(0, 0, r).fill({ color: 0x0e0c26, alpha: 0.95 });
    c.addChild(ring);

    // top-down fighter jet, nose up, tinted per seat (units of r)
    const jet = new Graphics();
    const half: [number, number][] = [
      [0, -0.85], // nose
      [0.14, -0.25],
      [0.62, 0.18], // wing tip (back-swept)
      [0.62, 0.32],
      [0.16, 0.26],
      [0.3, 0.62], // tail fin
      [0.3, 0.74],
      [0.07, 0.66],
      [0, 0.8],
    ];
    const pts: number[] = [];
    for (const [px, py] of half) pts.push(px * r, py * r);
    for (let i = half.length - 2; i >= 1; i--) pts.push(-half[i][0] * r, half[i][1] * r);
    jet.poly(pts).fill(BOT_COLORS[index]);
    jet.ellipse(0, -r * 0.3, r * 0.11, r * 0.19).fill({ color: 0x0e0c26, alpha: 0.9 }); // cockpit
    c.addChild(jet);

    const label = new Text({
      text: name,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 12,
        fill: index === 0 ? COLORS.cyan : COLORS.inkDim,
        letterSpacing: 1,
      },
    });
    label.anchor.set(0.5);
    label.y = r + 13;
    c.addChild(label);
    return c;
  }

  async roundStart(round: number): Promise<void> {
    if (this.destroyed) return;
    await this.gate();
    if (this.state) this.state.round = round;
    this.drawRoundBar();
    play('roundStart');
    // brief, skippable beat — input unlocks when this resolves (Q40)
    this.awaitingBeat = true;
    await new Promise<void>((resolve) => {
      this.beatWaiters.push(resolve);
      gsap.delayedCall(dur(0.5), () => this.endBeat());
    });
    this.awaitingBeat = false;
  }

  private endBeat(): void {
    const waiters = this.beatWaiters;
    this.beatWaiters = [];
    for (const w of waiters) w();
  }

  private onBackgroundClick(): void {
    if (this.awaitingBeat) {
      this.endBeat();
      return;
    }
    if (this.paused) return;
    // clicking empty table cancels a pending selection; only clicking the
    // selected card again plays it
    if (this.selected !== null && this.cb.canInput() && !this.busy && this.guideCard === null) {
      this.selected = null;
      this.setRowHighlight(null);
      play('uiClick');
      this.layoutHand(true);
    }
  }

  // -------------------------------------------------------- hand input

  private attachHandCard(view: CardView, value: number): void {
    const c = view.container;
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointerover', () => {
      if (!this.cb.canInput() || this.busy) return;
      if (this.guideCard !== null && value !== this.guideCard) return;
      this.hovered = value;
      this.previewTarget(value);
      if (motionFull()) {
        gsap.to(c.scale, { x: 1.05, y: 1.05, duration: dur(0.12), overwrite: 'auto' });
      }
    });
    c.on('pointerout', () => {
      if (this.hovered === value) {
        this.hovered = null;
        if (this.selected === null) this.setRowHighlight(null);
        else this.previewTarget(this.selected);
      }
      if (this.selected !== value) {
        gsap.to(c.scale, { x: 1, y: 1, duration: dur(0.12), overwrite: 'auto' });
      }
    });
    c.on('pointerdown', (e) => {
      e.stopPropagation();
      if (!this.cb.canInput() || this.busy || this.paused) return;
      if (this.guideCard !== null && value !== this.guideCard) return;
      if (this.selected === value) void this.confirmSelection();
      else this.select(value);
    });
  }

  /**
   * Tutorial guide: highlight/lock the hand to one card (null clears).
   * The guided card is selected so its target row shows immediately.
   */
  guideSelect(value: number | null): void {
    this.guideCard = value;
    if (value === null) {
      this.selected = null;
      this.setRowHighlight(null);
      this.layoutHand(true);
      return;
    }
    this.select(value);
  }

  private previewTarget(card: number): void {
    if (!this.state) return;
    this.setRowHighlight(findTargetRow(card, this.state.rows)); // no what-if (Q9-D)
  }

  private select(value: number): void {
    this.selected = value;
    play('uiClick');
    this.layoutHand(true);
    this.previewTarget(value);
  }

  private async confirmSelection(): Promise<void> {
    if (this.selected === null || this.busy) return;
    const card = this.selected;
    this.busy = true;
    this.selected = null;
    this.setRowHighlight(null);
    this.layoutHand(true);
    play('cardPlay');

    // fly the human's card face-down to the staging slot (your pick first)
    const L = this.layout;
    const view = this.handCards.get(card);
    if (view) {
      this.handCards.delete(card);
      this.handOrder = this.handOrder.filter((v) => v !== card);
      view.container.eventMode = 'none';
      this.staged[0] = { view, value: card };
      void flipCard(view, false); // face-down for the shared reveal
      const p = L.staging[0];
      await flyArc(view.container, p.x, p.y, 0.4, { arc: 60, rotation: -0.06 });
      view.container.rotation = 0;
      this.layoutHand(true);
    }

    await this.cb.onPlay(card);
    this.busy = false;
  }

  async botCommit(player: number, card: number): Promise<void> {
    if (this.destroyed) return;
    await this.gate();
    const L = this.layout;
    const view = createCard(card, L.handCard);
    view.showBack();
    this.cardLayer.addChild(view.container);

    const stack = this.stacks[player];
    const from = stack
      ? { x: stack.x, y: stack.y }
      : { x: L.seats[player].x, y: L.seats[player].y };
    view.container.x = from.x;
    view.container.y = from.y;
    view.container.rotation = (Math.random() - 0.5) * 0.2;
    this.staged[player] = { view, value: card };
    play('cardSlide');

    // hand shrank by one
    this.rebuildStack(player, (this.state?.players[player].hand.length ?? 1));

    const p = L.staging[player];
    const delay = BOT_CADENCE[player] ?? 0.1;
    const flight = 0.42 + (player % 3) * 0.05; // distinct rhythm per bot
    await new Promise<void>((resolve) => {
      gsap.to(view.container, {
        x: p.x,
        y: p.y,
        rotation: 0,
        duration: dur(flight),
        delay: dur(delay),
        ease: 'power2.inOut',
        onComplete: resolve,
      });
    });
  }

  async reveal(plays: readonly { player: number; card: number }[]): Promise<void> {
    if (this.destroyed) return;
    await this.gate();
    play('cardFlip');
    const staged = plays
      .map((p) => this.staged[p.player])
      .filter((s): s is Staged => s !== null);

    await Promise.all(staged.map((s) => flipCard(s.view, true)));
    // simultaneous pop so the reveal lands
    await Promise.all(
      staged.map((s) =>
        gsap.fromTo(
          s.view.container.scale,
          { x: 1.14, y: 1.14 },
          { x: 1, y: 1, duration: dur(0.2), ease: 'back.out(3)' },
        ),
      ),
    );
  }

  async resolve(events: readonly EngineEvent[], player: number, _card: number): Promise<void> {
    if (this.destroyed) return;
    await this.gate();
    const L = this.layout;
    const staged = this.staged[player];
    this.staged[player] = null;
    if (!staged) return;

    const placed = events.find((e) => e.type === 'cardPlaced');
    const taken = events.find((e) => e.type === 'rowTaken');
    const chosen = events.find((e) => e.type === 'rowChosen');
    if (!placed || placed.type !== 'cardPlaced') return;

    const row = placed.row;
    if (chosen && player !== 0) this.flashRow(row, COLORS.yellow);

    // fly the card into its row slot (arc, slight rotation, settle overshoot)
    const targetIndex = this.rowCards[row].length;
    const x = L.rowOriginX + targetIndex * (L.rowCard.w + L.rowGapX) + L.rowCard.w / 2;
    const y = L.rowY(row) + L.rowCard.h / 2;
    play('cardSlide');
    await flyArc(staged.view.container, x, y, 0.38, {
      arc: 46,
      rotation: (Math.random() - 0.5) * 0.12,
    });
    staged.view.container.rotation = 0;
    this.tableLayer.addChild(staged.view.container);
    this.rowCards[row].push(staged.view);
    settle(staged.view.container);

    if (taken && taken.type === 'rowTaken') {
      await this.animateTake(row, player, taken.damage, taken.taken.length);
    }
  }

  private async animateTake(
    row: number,
    player: number,
    damageAmount: number,
    takenCount: number,
  ): Promise<void> {
    const L = this.layout;
    const cards = this.rowCards[row];
    const taken = cards.slice(0, takenCount);
    const survivor = cards[takenCount];

    play('rowTake', { intensity: damageAmount });

    // penalty flash on the gathered cards
    for (const c of taken) {
      gsap.fromTo(
        c.container,
        { alpha: 0.35 },
        { alpha: 1, duration: dur(0.1), yoyo: true, repeat: 3 },
      );
    }

    // fly the gathered cards to the taker's badge
    const badge = L.badges[player];
    const flights = taken.map((c, i) =>
      flyArc(c.container, badge.x, badge.y, 0.5, { arc: 70 + i * 8, ease: 'power2.in' }).then(
        () => c.container.destroy({ children: true }),
      ),
    );
    // big floating damage number: pops up from the row, arcs into the taker
    const damage = this.showDamageNumber(row, player, damageAmount);
    if (damageAmount >= 10) {
      shake(this.root, 10);
      burst(this.fxLayer, L.rowOriginX + L.rowCard.w * 3, L.rowY(row) + L.rowCard.h / 2, COLORS.danger, {
        count: 16,
        spread: 110,
      });
      play('bigPenalty');
    } else {
      burst(this.fxLayer, badge.x, badge.y, COLORS.magenta, { count: 8, spread: 60 });
    }
    await Promise.all([Promise.all(flights), damage]);

    // survivor slides to the row's start
    this.rowCards[row] = survivor ? [survivor] : [];
    if (survivor) {
      const x = L.rowOriginX + L.rowCard.w / 2;
      await gsap.to(survivor.container, { x, duration: dur(0.3), ease: 'power2.inOut' });
      this.placeRowCard(survivor, row, 0);
    }

    this.bumpBadge(player, this.state?.players[player].score ?? 0);
  }

  /**
   * Big floating damage number: pops up from the row, hovers for a beat,
   * then arcs smoothly into the taker's score badge (which counts up on
   * arrival). Size and color scale with the damage taken.
   */
  private async showDamageNumber(row: number, player: number, amount: number): Promise<void> {
    const L = this.layout;
    const k = Math.min(1.6, Math.max(0.7, L.rowCard.h / 120));
    let size: number;
    let color: number;
    if (amount >= 17) {
      size = 66;
      color = COLORS.danger;
    } else if (amount >= 10) {
      size = 52;
      color = 0xff8a4d;
    } else if (amount >= 5) {
      size = 40;
      color = COLORS.yellow;
    } else {
      size = 30;
      color = COLORS.ink;
    }

    const text = new Text({
      text: String(amount),
      style: {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: Math.round(size * k),
        fontWeight: '900',
        fill: color,
        dropShadow: { color: 0x000000, alpha: 0.65, distance: 3, blur: 4 },
      },
    });
    text.anchor.set(0.5);
    const startX = L.rowOriginX + (ROW_SLOTS * L.rowCard.w + (ROW_SLOTS - 1) * L.rowGapX) / 2;
    const startY = L.rowY(row) + L.rowCard.h / 2;
    text.x = startX;
    text.y = startY;
    text.scale.set(0.15);
    text.alpha = 0;
    this.fxLayer.addChild(text);

    const badge = L.badges[player];

    // pop in + rise out of the row
    await Promise.all([
      gsap.to(text, { alpha: 1, duration: dur(0.12) }),
      gsap.to(text.scale, { x: 1, y: 1, duration: dur(0.42), ease: 'back.out(3)' }),
      gsap.to(text, { y: startY - 58 * k, duration: dur(0.5), ease: 'power2.out' }),
    ]);
    // brief hover beat so the number reads before it flies off
    await gsap.to(text, { y: startY - 68 * k, duration: dur(0.28), ease: 'sine.inOut' });

    // arc into the taker's badge, shrinking as it goes
    await Promise.all([
      flyArc(text, badge.x, badge.y, 0.6, { arc: 46, ease: 'power2.inOut' }),
      gsap.to(text.scale, { x: 0.5, y: 0.5, duration: dur(0.6), ease: 'power2.in' }),
    ]);
    await gsap.to(text, { alpha: 0, duration: dur(0.14) });
    text.destroy();
  }

  /** Hit landed: HP slides down to the new value (the bar visibly shrinks). */
  private bumpBadge(player: number, toDamage: number): void {
    const to = Math.max(0, 100 - toDamage);
    const from = this.hpValues[player];
    const obj = { v: from };
    gsap.to(obj, {
      v: to,
      duration: dur(0.6),
      ease: 'power1.out',
      onUpdate: () => {
        this.hpValues[player] = obj.v;
        this.paintBadge(player);
      },
      onComplete: () => {
        this.hpValues[player] = to;
        this.paintBadge(player);
      },
    });
    const box = this.badgeBoxes[player];
    gsap.fromTo(box, { alpha: 0.35 }, { alpha: 1, duration: dur(0.5), ease: 'power2.out' });
  }

  private flashRow(row: number, color: number): void {
    const r = this.rowRect(row);
    const g = new Graphics();
    g.roundRect(r.x, r.y, r.w, r.h, 10);
    g.stroke({ width: 3, color, alpha: 0.95 });
    g.alpha = 0;
    this.fxLayer.addChild(g);
    gsap.to(g, {
      alpha: 1,
      duration: dur(0.12),
      yoyo: true,
      repeat: 1,
      onComplete: () => g.destroy(),
    });
  }

  async askRowChoice(card: number): Promise<number> {
    if (this.destroyed) return 0;
    await this.gate();
    this.rowChoiceActive = true;
    this.rowHitAreas.forEach((h) => (h.eventMode = 'static'));
    this.promptCard = card;
    this.rowPrompt.text = t('game.rowPrompt', { c: card });
    this.rowPrompt.visible = true;
    gsap.fromTo(this.rowPrompt, { alpha: 0 }, { alpha: 1, duration: dur(0.2) });
    play('uiClick');
    const row = await new Promise<number>((resolve) => {
      this.rowChoiceResolve = resolve;
    });
    this.rowChoiceActive = false;
    this.rowHitAreas.forEach((h) => (h.eventMode = 'none'));
    this.rowPrompt.visible = false;
    this.rowChoiceResolve = null;
    this.promptCard = null;
    this.setRowHighlight(null);
    return row;
  }

  private chooseRow(row: number): void {
    if (!this.rowChoiceResolve) return;
    const resolve = this.rowChoiceResolve;
    this.flashRow(row, COLORS.cyan);
    resolve(row);
  }

  async handEnd(state: MatchState): Promise<void> {
    if (this.destroyed) return;
    await this.gate();
    play('handEnd');
    // floating "+N" over each badge for what they took this hand
    for (let i = 0; i < 5; i++) {
      const hs = state.players[i].handScore;
      if (hs <= 0) continue;
      const pos = this.layout.badges[i];
      const t = new Text({
        text: `−${hs}`,
        style: {
          fontFamily: 'Arial Black, sans-serif',
          fontSize: 20,
          fontWeight: '900',
          fill: COLORS.danger,
        },
      });
      t.anchor.set(0.5);
      t.x = pos.x;
      t.y = pos.y - 20;
      this.fxLayer.addChild(t);
      gsap.to(t, {
        y: pos.y - 54,
        alpha: 0,
        duration: dur(1.1),
        ease: 'power1.out',
        onComplete: () => t.destroy(),
      });
    }
    await wait(0.9);
  }

  // ------------------------------------------------------------ lifecycle

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) {
      const waiters = this.pauseWaiters;
      this.pauseWaiters = [];
      for (const w of waiters) w();
    }
  }

  /** Pause gate: hooks wait here so pausing lands between beats (Q31). */
  private async gate(): Promise<void> {
    while (this.paused) {
      await new Promise<void>((resolve) => this.pauseWaiters.push(resolve));
    }
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('resize', this.onWindowResize);
    gsap.globalTimeline.getChildren().forEach((t) => t.kill());
    this.root.destroy({ children: true });
  }

  /** Dev/test aid: render one frame and read it back (works while hidden). */
  grabFrame(): string {
    this.app.renderer.render(this.app.stage);
    return (this.app.canvas as HTMLCanvasElement).toDataURL('image/png');
  }

  /** Dev/test aid: inspect hover + highlight state. */
  debugState(): unknown {
    return {
      hovered: this.hovered,
      selected: this.selected,
      highlight: this.highlightRow,
      rows: this.state?.rows,
      hand: this.state?.players[0].hand,
      staged: this.staged.map((s) =>
        s
          ? {
              v: s.value,
              x: Math.round(s.view.container.x),
              y: Math.round(s.view.container.y),
              sx: Number(s.view.container.scale.x.toFixed(3)),
              a: Number(s.view.container.alpha.toFixed(2)),
              vis: s.view.container.visible,
              parent: s.view.container.parent ? s.view.container.parent.label : 'none',
            }
          : null,
      ),
      rowVisuals: this.rowCards.map((r) => r.map((c) => (c.container.parent ? 'y' : 'n'))),
      rowVisualCounts: this.rowCards.map((r) => r.length),
      cardLayerChildren: this.cardLayer.children.length,
      tableLayerChildren: this.tableLayer.children.length,
      stacksVisible: this.stacks.map((s) => (s ? { x: Math.round(s.x), y: Math.round(s.y), alpha: s.alpha } : null)),
      phase: undefined,
    };
  }
}
