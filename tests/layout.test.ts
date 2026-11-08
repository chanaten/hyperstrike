import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  isPortraitLayout,
  type Layout,
  type SafeAreaInsets,
} from '../src/render/theme';

const insets = (top: number, bottom: number): SafeAreaInsets => ({ top, right: 0, bottom, left: 0 });

function expectInside(layout: Layout, w: number, h: number): void {
  const points = [
    ...layout.seats,
    ...layout.badges,
    ...layout.staging,
    layout.youLabel,
    ...layout.botCells.map((c) => ({ x: c.nameX, y: c.nameY })),
    ...layout.botCells.map((c) => ({ x: c.pillX, y: c.pillY })),
  ];
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(w);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(h);
  }
  const rowsRight = layout.rowOriginX + 6 * layout.rowCard.w + 5 * layout.rowGapX;
  expect(layout.rowOriginX).toBeGreaterThanOrEqual(0);
  expect(rowsRight).toBeLessThanOrEqual(w + 0.01);
}

describe('portrait layout classification', () => {
  it('uses the vertical table on phone-sized portrait windows only', () => {
    expect(isPortraitLayout(320, 568)).toBe(true);
    expect(isPortraitLayout(390, 844)).toBe(true);
    expect(isPortraitLayout(430, 932)).toBe(true);
    expect(isPortraitLayout(844, 390)).toBe(false); // phone landscape
    expect(isPortraitLayout(1280, 720)).toBe(false); // desktop
    expect(isPortraitLayout(700, 1000)).toBe(false); // tablet portrait keeps the table
    expect(isPortraitLayout(560, 1000)).toBe(true);
  });
});

describe('portrait phone layout', () => {
  const cases = [
    { name: 'compact phone 320x568', w: 320, h: 568, top: 0, bottom: 0 },
    { name: 'notched phone 390x844', w: 390, h: 844, top: 47, bottom: 34 },
  ];

  for (const c of cases) {
    describe(c.name, () => {
      const L = computeLayout(c.w, c.h, insets(c.top, c.bottom));

      it('is portrait with anchors inside the screen', () => {
        expect(L.portrait).toBe(true);
        expectInside(L, c.w, c.h);
      });

      it('sizes cards as touch targets and fits six slots per row', () => {
        // 390px+ phones keep ≥44px; the 320×568 floor lands just under it
        // so staged cards can stay near field size.
        expect(L.rowCard.w).toBeGreaterThanOrEqual(c.w >= 360 ? 44 : 42);
        expect(L.rowCard.h).toBeGreaterThan(L.rowCard.w);
        const rowsRight = L.rowOriginX + 6 * L.rowCard.w + 5 * L.rowGapX;
        expect(rowsRight).toBeLessThanOrEqual(c.w + 0.01);
      });

      it('stacks the four rows above the hand with no overlap', () => {
        for (let r = 1; r < 4; r++) expect(L.rowY(r)).toBeGreaterThan(L.rowY(r - 1));
        const rowsBottom = L.rowY(3) + L.rowCard.h;
        const handTop = Math.min(...Array.from({ length: 10 }, (_, i) => L.handSlot(i, 10).y)) -
          L.handCard.h / 2;
        expect(handTop).toBeGreaterThan(rowsBottom);
        expect(rowsBottom).toBeLessThanOrEqual(c.h - c.bottom);
      });

      it('splits the hand into two rows of five, bottom row first', () => {
        const slots = Array.from({ length: 10 }, (_, i) => L.handSlot(i, 10));
        const bottomY = slots[0].y;
        const topY = slots[5].y;
        expect(bottomY).toBeGreaterThan(topY); // bottom row sits lower
        for (let i = 0; i < 5; i++) expect(slots[i].y).toBeCloseTo(bottomY, 5);
        for (let i = 5; i < 10; i++) expect(slots[i].y).toBeCloseTo(topY, 5);
        // cards in a row run left→right, and the whole hand fits
        for (let i = 1; i < 5; i++) expect(slots[i].x).toBeGreaterThan(slots[i - 1].x);
        const right = slots[4].x + L.handCard.w / 2;
        expect(right).toBeLessThanOrEqual(c.w + 0.01);
        // five or fewer cards collapse into the bottom row
        const five = Array.from({ length: 5 }, (_, i) => L.handSlot(i, 5));
        expect(new Set(five.map((s) => Math.round(s.y))).size).toBe(1);
        // bottom of the hand respects the safe area
        expect(slots[0].y + L.handCard.h / 2).toBeLessThanOrEqual(c.h - c.bottom + 0.01);
      });

      it('keeps the YOU readout clear of the hand', () => {
        const handRight = L.handSlot(4, 10).x + L.handCard.w / 2;
        const pillLeft = L.badges[0].x - (58 * L.badgeScale) / 2;
        expect(pillLeft).toBeGreaterThanOrEqual(handRight - 0.01);
        expect(L.seats[0].x).toBeGreaterThan(handRight);
        expect(L.youLabel.x).toBeGreaterThan(handRight);
      });

      it('puts the bots strip under the buttons and above the board', () => {
        expect(L.botCells).toHaveLength(4);
        for (let k = 1; k < 4; k++) {
          expect(L.botCells[k].pillX).toBeGreaterThan(L.botCells[k - 1].pillX);
        }
        for (const cell of L.botCells) {
          expect(cell.nameY).toBeGreaterThanOrEqual(c.top + 62); // clear of the HUD buttons
          expect(cell.pillY).toBeLessThan(L.rowOriginY);
          // HP pill hangs clear below the callsign text (no overlap)
          expect(cell.pillY - (26 * L.badgeScale) / 2).toBeGreaterThan(cell.nameY + 6);
        }
        // names + pills are the enlarged size
        expect(L.badgeScale).toBeGreaterThanOrEqual(0.75);
        // avatars/piles are omitted in portrait
        expect(L.staging).toHaveLength(5);
        expect(L.badgeScale).toBeLessThan(1);
      });

      it('zooms the selected card large enough to read', () => {
        expect(L.selectedScale).toBeGreaterThanOrEqual(1.5);
      });

      it('keeps the round indicator centered in the top band', () => {
        expect(L.roundAnchor).toBe(0.5);
        const center = L.roundLine.x + L.roundLine.w / 2;
        expect(center).toBeCloseTo(c.w / 2, 1);
        expect(L.roundLine.y).toBeLessThan(L.botCells[0].nameY);
        expect(L.roundTextY).toBeLessThan(L.botCells[0].nameY);
      });

      it('stages each face-down play under its owner', () => {
        // staged cards are nearly the size of field cards
        expect(L.stagingScale).toBeGreaterThanOrEqual(0.85);
        expect(L.stagingScale).toBeLessThan(1);
        // YOURS: above your readout, level with the top hand row
        expect(L.staging[0].x).toBeCloseTo(L.youLabel.x, 5);
        expect(L.staging[0].y).toBeGreaterThan(L.rowY(3) + L.rowCard.h);
        expect(L.staging[0].y).toBeLessThan(L.youLabel.y);
        // bots: directly under their own strip cells
        for (let i = 1; i < L.staging.length; i++) {
          const cell = L.botCells[i - 1];
          expect(L.staging[i].x).toBeCloseTo(cell.pillX, 5);
          expect(L.staging[i].y).toBeGreaterThan(cell.pillY);
          expect(L.staging[i].y).toBeLessThan(L.rowOriginY);
        }
      });

      it('levels the YOU readout with the bottom hand row', () => {
        const bottomY = L.handSlot(0, 10).y;
        expect(L.badges[0].y).toBeGreaterThan(L.youLabel.y);
        expect(Math.abs(L.youLabel.y - bottomY)).toBeLessThan(L.handCard.h / 2);
        expect(Math.abs(L.badges[0].y - bottomY)).toBeLessThan(L.handCard.h / 2);
      });
    });
  }
});

describe('landscape layout (regression)', () => {
  const L = computeLayout(1280, 720);

  it('stays landscape with full-size staged cards and single-row hand', () => {
    expect(L.portrait).toBe(false);
    expect(L.stagingScale).toBe(1);
    expect(L.badgeScale).toBe(1);
    expect(L.handLift).toBe(18);
    expect(L.botCells).toHaveLength(0);
    const slots = Array.from({ length: 10 }, (_, i) => L.handSlot(i, 10));
    expect(new Set(slots.map((s) => Math.round(s.y))).size).toBe(1);
    for (let i = 1; i < slots.length; i++) expect(slots[i].x).toBeGreaterThan(slots[i - 1].x);
    expectInside(L, 1280, 720);
  });

  it('keeps side opponents on the flanks', () => {
    expect(L.seats[1].x).toBeLessThan(L.seats[3].x);
    expect(L.seats[1].y).toBeLessThan(L.seats[2].y);
  });
});
