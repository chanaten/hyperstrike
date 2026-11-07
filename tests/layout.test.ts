import { describe, expect, it } from 'vitest';
import { computeLayout, isPortraitLayout, type Layout, type SafeAreaInsets } from '../src/render/theme';

const insets = (top: number, bottom: number): SafeAreaInsets => ({ top, right: 0, bottom, left: 0 });

function expectInside(layout: Layout, w: number, h: number): void {
  for (const p of [...layout.seats, ...layout.piles, ...layout.badges, ...layout.staging]) {
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
  it('uses the portrait table on phone-sized portrait windows only', () => {
    expect(isPortraitLayout(320, 568)).toBe(true);
    expect(isPortraitLayout(390, 844)).toBe(true);
    expect(isPortraitLayout(430, 932)).toBe(true);
    expect(isPortraitLayout(844, 390)).toBe(false); // phone landscape
    expect(isPortraitLayout(1280, 720)).toBe(false); // desktop
    expect(isPortraitLayout(700, 1000)).toBe(false); // tablet portrait keeps landscape table
    expect(isPortraitLayout(560, 1000)).toBe(true); // narrow window rule (≤560 wide)
  });
});

describe('portrait phone layout', () => {
  const cases = [
    { name: 'compact phone 320x568', w: 320, h: 568, top: 20, bottom: 0 },
    { name: 'modern iPhone 390x844', w: 390, h: 844, top: 47, bottom: 34 },
  ];

  for (const c of cases) {
    describe(c.name, () => {
      const L = computeLayout(c.w, c.h, insets(c.top, c.bottom));

      it('is portrait and keeps every anchor inside the screen', () => {
        expect(L.portrait).toBe(true);
        expectInside(L, c.w, c.h);
      });

      it('sizes cards for touch', () => {
        expect(L.rowCard.w).toBeGreaterThanOrEqual(34);
        expect(L.rowCard.h).toBeGreaterThanOrEqual(44);
      });

      it('deals the hand as two rows of five', () => {
        const slots = Array.from({ length: 10 }, (_, i) => L.handSlot(i, 10));
        expect(new Set(slots.map((s) => Math.round(s.y))).size).toBe(2);
        for (const s of slots) {
          expect(s.x - L.handCard.w / 2).toBeGreaterThanOrEqual(-0.01);
          expect(s.x + L.handCard.w / 2).toBeLessThanOrEqual(c.w + 0.01);
          expect(s.y + L.handCard.h / 2).toBeLessThanOrEqual(c.h - c.bottom + 0.01);
        }
        // hand sits below the board rows
        const rowsBottom = L.rowY(3) + L.rowCard.h;
        const topRowTop = Math.min(...slots.map((s) => s.y)) - L.handCard.h / 2;
        expect(topRowTop).toBeGreaterThan(rowsBottom);
        // fewer than five cards collapses into the bottom row
        const three = Array.from({ length: 3 }, (_, i) => L.handSlot(i, 3));
        expect(new Set(three.map((s) => Math.round(s.y))).size).toBe(1);
      });

      it('keeps the YOU badge column clear of the hand', () => {
        const bottomRight = L.handSlot(4, 10);
        const handRight = bottomRight.x + L.handCard.w / 2;
        const badgeLeft = L.badges[0].x - (58 * L.badgeScale) / 2;
        expect(badgeLeft).toBeGreaterThanOrEqual(handRight - 0.01);
      });

      it('puts opponents above the board and the round line in the top strip', () => {
        const rowsTop = L.rowOriginY;
        for (let i = 1; i < 5; i++) expect(L.seats[i].y).toBeLessThan(rowsTop);
        expect(L.rowPromptY).toBeGreaterThan(0);
        expect(L.rowPromptY).toBeLessThan(rowsTop);
        expect(L.roundLine.x + L.roundLine.w / 2).toBeCloseTo(c.w / 2, 1);
        expect(L.roundLine.y).toBeLessThan(rowsTop);
        // compact seat furniture
        expect(L.badgeScale).toBeLessThan(1);
        expect(L.seatScale).toBeLessThan(1);
      });

      it('stages all five plays', () => {
        expect(L.staging).toHaveLength(5);
      });
    });
  }
});

describe('landscape layout (regression)', () => {
  const L = computeLayout(1280, 720);

  it('stays landscape with unscaled seat furniture', () => {
    expect(L.portrait).toBe(false);
    expect(L.badgeScale).toBe(1);
    expect(L.seatScale).toBe(1);
    expect(L.handLift).toBe(18);
  });

  it('keeps the hand on a single bottom row', () => {
    const slots = Array.from({ length: 10 }, (_, i) => L.handSlot(i, 10));
    expect(new Set(slots.map((s) => Math.round(s.y))).size).toBe(1);
    for (let i = 1; i < slots.length; i++) expect(slots[i].x).toBeGreaterThan(slots[i - 1].x);
    for (const s of slots) {
      expect(s.x - L.handCard.w / 2).toBeGreaterThanOrEqual(0);
      expect(s.x + L.handCard.w / 2).toBeLessThanOrEqual(1280);
    }
    expect(slots[0].y).toBeCloseTo(720 - 44 - L.handCard.h / 2, 1);
  });

  it('keeps side opponents on the flanks', () => {
    expect(L.seats[1].x).toBeLessThan(L.seats[3].x);
    expect(L.seats[1].y).toBeLessThan(L.seats[2].y);
    expectInside(L, 1280, 720);
  });
});
