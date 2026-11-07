/** Arcade-neon palette and layout constants (locked decisions Q12/Q27). */

export const COLORS = {
  bg: 0x12102a,
  bgDeep: 0x0b0a1e,
  grid: 0x2a2660,
  felt: 0x1a1740,
  feltEdge: 0x252158,
  ink: 0xe8e6ff,
  inkDim: 0x9a94d6,
  cyan: 0x4df3ff,
  magenta: 0xff4dd8,
  yellow: 0xffd84d,
  danger: 0xff4d6d,
  cardFace: 0xf4f3ff,
  cardFaceHi: 0xffffff,
  cardBack: 0x241f55,
  cardBackLine: 0x4df3ff,
  shadow: 0x000000,
  seatGlow: 0x4df3ff,
} as const;

/** Seats: 0 = human (bottom), 1-2 = left side, 3-4 = right side. */
export const SEAT_SIDE: ('bottom' | 'left' | 'right')[] = ['bottom', 'left', 'left', 'right', 'right'];

export interface CardMetrics {
  w: number;
  h: number;
  radius: number;
}

/** Safe-area insets (notch / home indicator); zeros on plain desktop. */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Compute card size + row/hand geometry for the current screen. */
export interface Layout {
  screenW: number;
  screenH: number;
  /** Vertical phone layout: opponents in a 2×2 grid above the board and the
   *  hand in two rows of five at the bottom (portrait phones only). */
  portrait: boolean;
  /** Cards in the four central rows. */
  rowCard: CardMetrics;
  rowGapX: number;
  rowGapY: number;
  rowOriginX: number;
  rowOriginY: number;
  rowY: (index: number) => number;
  /** Y anchor for the forced-choice row prompt. */
  rowPromptY: number;
  /** Human hand cards. */
  handCard: CardMetrics;
  handY: number;
  /** Center position of hand card i when holding n cards (2×5 in portrait). */
  handSlot: (i: number, n: number) => { x: number; y: number };
  /** Lift applied to the selected hand card. */
  handLift: number;
  /** Staging slots where played cards land face-down before reveal. */
  staging: { x: number; y: number }[];
  /** Seat anchors (avatar + stack + score badge). */
  seats: { x: number; y: number }[];
  /** Opponent card-pile anchors (outer edge of each side seat). */
  piles: { x: number; y: number }[];
  /** Score badge anchors (per seat). */
  badges: { x: number; y: number }[];
  /** Uniform scales for seat furniture (portrait compacts them). */
  badgeScale: number;
  seatScale: number;
  roundLine: { x: number; y: number; w: number };
}

export const ROW_SLOTS = 6; // max visible in a row (5 + incoming)

/** Portrait layout for phone-sized portrait windows; landscape everywhere else. */
export function isPortraitLayout(w: number, h: number): boolean {
  return h > w && w <= 560;
}

export function computeLayout(
  w: number,
  h: number,
  insets: SafeAreaInsets = NO_INSETS,
): Layout {
  if (isPortraitLayout(w, h)) return computePortraitLayout(w, h, insets);
  return computeLandscapeLayout(w, h);
}

function computeLandscapeLayout(w: number, h: number): Layout {
  const pad = Math.max(12, w * 0.015);
  const topMargin = 46;
  const bottomStrip = 44; // round line + breathing room under the hand

  // One shared card size for rows and hand (hand never overlaps): the
  // vertical budget covers rows band + staging band + hand band. The
  // width term keeps the hand clear of the bottom-right corner stack
  // (YOU avatar + score badge).
  const rowCardH = Math.min(
    (h - topMargin - bottomStrip) / 6.7,
    (w / 2 - pad - 83) / 3.925,
    (w * 0.92) / 7.85,
    h * 0.17,
  );
  const rowCard: CardMetrics = {
    h: rowCardH,
    w: rowCardH * 0.72,
    radius: Math.max(4, rowCardH * 0.08),
  };
  const rowGapX = rowCard.w * 0.1;
  const rowGapY = rowCard.h * 0.14;

  const rowsW = ROW_SLOTS * rowCard.w + (ROW_SLOTS - 1) * rowGapX;
  const rowsH = 4 * rowCard.h + 3 * rowGapY;
  const rowOriginX = (w - rowsW) / 2;
  const rowOriginY = topMargin;
  const rowY = (i: number) => rowOriginY + i * (rowCard.h + rowGapY);
  const rowsBottom = rowOriginY + rowsH;

  // Hand: same size as the row cards, spaced with the same gap — no overlap.
  const handCard = rowCard;
  const handY = h - bottomStrip - rowCard.h;

  // Seats: each side seat is a column reading outward-in:
  //   [card pile] → [avatar + name] → [staging] → [rows]
  // so piles never overlap the icon/name and commits fly behind them.
  const pileHalf = rowCard.w * 0.57; // visual width incl. back-stack offset
  const avatarHalf = 26;
  const leftPileX = pad + pileHalf + 4;
  const leftAvatarX = leftPileX + pileHalf + 14 + avatarHalf;
  const sideY = [rowOriginY + rowsH * 0.28, rowOriginY + rowsH * 0.72];
  // YOU sits in the bottom-right corner: avatar + name above the badge.
  const cornerX = w - pad - 42;
  const avatarY = h - 90;
  const seats: { x: number; y: number }[] = [{ x: cornerX, y: avatarY }];
  seats.push({ x: leftAvatarX, y: sideY[0] });
  seats.push({ x: leftAvatarX, y: sideY[1] });
  seats.push({ x: w - leftAvatarX, y: sideY[0] });
  seats.push({ x: w - leftAvatarX, y: sideY[1] });

  const piles: { x: number; y: number }[] = [{ x: w / 2, y: avatarY }];
  piles.push({ x: leftPileX, y: sideY[0] });
  piles.push({ x: leftPileX, y: sideY[1] });
  piles.push({ x: w - leftPileX, y: sideY[0] });
  piles.push({ x: w - leftPileX, y: sideY[1] });

  // Staging sits midway between the avatar group and the rows so cards
  // never collide with either. Your card rises to the band above the hand.
  const staging: { x: number; y: number }[] = [
    { x: w / 2, y: rowsBottom + rowGapY + rowCard.h / 2 },
  ];
  const leftStagingX = (leftAvatarX + avatarHalf + rowOriginX) / 2;
  staging.push({ x: leftStagingX, y: sideY[0] });
  staging.push({ x: leftStagingX, y: sideY[1] });
  staging.push({ x: w - leftStagingX, y: sideY[0] });
  staging.push({ x: w - leftStagingX, y: sideY[1] });
  // Staging order must match seat ids: [0]=bottom, [1][2]=left, [3][4]=right.

  // Opponent score badges sit directly under their card piles; YOU's badge
  // sits in the bottom-right corner under the avatar.
  const badges = seats.map((s, i) =>
    i === 0
      ? { x: cornerX, y: h - 26 }
      : { x: piles[i].x, y: s.y + rowCard.h * 0.5 + 24 },
  );

  const roundLine = {
    x: pad + 14,
    y: h - 18,
    w: Math.min(200, w * 0.16),
  };

  // Hand: cards side by side with a gap; extreme widths shrink the gap,
  // overlapping only as a last resort (moved here from TableRenderer).
  const handStep = (n: number): number => {
    const gap = rowCard.w * 0.1;
    const ideal = rowCard.w + gap;
    const total = rowCard.w + (n - 1) * ideal;
    if (total <= w * 0.94) return ideal;
    return Math.max(rowCard.w * 0.6, (w * 0.94 - rowCard.w) / Math.max(1, n - 1));
  };
  const handSlot = (i: number, n: number): { x: number; y: number } => {
    const step = handStep(n);
    const total = rowCard.w + (n - 1) * step;
    return {
      x: (w - total) / 2 + rowCard.w / 2 + i * step,
      y: handY + rowCard.h / 2,
    };
  };

  return {
    screenW: w,
    screenH: h,
    portrait: false,
    rowCard,
    rowGapX,
    rowGapY,
    rowOriginX,
    rowOriginY,
    rowY,
    rowPromptY: Math.max(30, rowOriginY - 26),
    handCard,
    handY,
    handSlot,
    handLift: 18,
    staging,
    seats,
    piles,
    badges,
    badgeScale: 1,
    seatScale: 1,
    roundLine,
  };
}

/**
 * Portrait phone table (bottom → top): round line in the top strip between
 * the DOM HUD buttons, a 2×2 opponent grid, the four horizontal board rows,
 * and the hand in two rows of five at the bottom. The YOU readout (avatar +
 * HP badge) sits in the right margin beside the hand; each opponent's staged
 * card lands on their own grid cell, YOUR staged card on the YOU readout —
 * so no separate staging band eats vertical space.
 */
function computePortraitLayout(
  w: number,
  h: number,
  insets: SafeAreaInsets,
): Layout {
  const topInset = insets.top;
  const bottomInset = insets.bottom;
  const pad = Math.max(10, Math.round(w * 0.03));
  const topStrip = 52; // DOM ×2 / pause buttons occupy the top corners
  const bottomMargin = 8;
  const seatScale = 0.7;
  const badgeScale = 0.7;
  const avatarR = 24;
  const gridGapY = 6;
  // Avatar (scaled) plus the name label hanging below it.
  const cellH = avatarR * 2 * seatScale + 17;
  const gridH = 2 * cellH + gridGapY;
  const gapGRBase = 10; // grid → rows (hosts the forced-choice prompt)
  const gapRHBase = 8; // rows → hand

  // Vertical budget: rows are 4.42 card-heights, the two-row hand 2.1.
  const fixedV =
    topInset + topStrip + gridH + gapGRBase + gapRHBase + bottomMargin + bottomInset;
  const rowsCap = (w - 2 * pad) / 4.68; // 6 cards + 5 gaps across the width
  const badgeW = 58 * badgeScale;
  const handCap = (w - 2 * pad - 2 * badgeW) / 3.888; // keep the YOU badge column clear
  const verticalCap = (h - fixedV) / 6.52;
  const rowCardH = Math.max(30, Math.min(rowsCap, handCap, verticalCap));
  const rowCard: CardMetrics = {
    h: rowCardH,
    w: rowCardH * 0.72,
    radius: Math.max(4, rowCardH * 0.08),
  };
  const rowGapX = rowCard.w * 0.1;
  const rowGapY = rowCard.h * 0.14;

  // Leftover height becomes breathing room: below the buttons, in the
  // grid→rows gap (prompt space), and between rows and hand.
  const slack = Math.max(0, h - fixedV - 6.52 * rowCardH);
  const extraTop = slack * 0.5;
  const gapGR = gapGRBase + slack * 0.3;
  const gapRH = gapRHBase + slack * 0.2;

  const gridTop = topInset + topStrip + extraTop;
  const gridBottom = gridTop + gridH;
  const rowsW = ROW_SLOTS * rowCard.w + (ROW_SLOTS - 1) * rowGapX;
  const rowsH = 4 * rowCard.h + 3 * rowGapY;
  const rowOriginX = (w - rowsW) / 2;
  const rowOriginY = gridBottom + gapGR;
  const rowY = (i: number): number => rowOriginY + i * (rowCard.h + rowGapY);
  const rowsBottom = rowOriginY + rowsH;

  // Hand: two rows of five — first five cards in the bottom row.
  const handTop = rowsBottom + gapRH;
  const handGapY = rowCard.h * 0.1;
  const handBandH = 2 * rowCard.h + handGapY;
  const topRowY = handTop + rowCard.h / 2;
  const bottomRowY = handTop + rowCard.h + handGapY + rowCard.h / 2;
  const handCenterY = handTop + handBandH / 2;
  const handGapX = rowCard.w * 0.1;
  const handSlot = (i: number, n: number): { x: number; y: number } => {
    const bottomN = Math.min(n, 5);
    const onBottom = i < bottomN;
    const count = onBottom ? bottomN : n - bottomN;
    const col = onBottom ? i : i - bottomN;
    const rowW = count * rowCard.w + (count - 1) * handGapX;
    return {
      x: (w - rowW) / 2 + rowCard.w / 2 + col * (rowCard.w + handGapX),
      y: onBottom ? bottomRowY : topRowY,
    };
  };

  // Opponent grid: left-column seats mirrored right-column seats so the
  // card stack always hugs the outer edge: [stack][avatar][badge] ←→.
  const stackW = rowCard.w * 1.14;
  const innerGap = 4;
  const avatarHalfW = avatarR * seatScale;
  const rowYs = [gridTop + cellH / 2, gridTop + cellH + gridGapY + cellH / 2];
  const cellX = (col: 0 | 1): { stack: number; avatar: number; badge: number } => {
    if (col === 0) {
      const cellL = pad;
      const stack = cellL + stackW / 2;
      const avatar = cellL + stackW + innerGap + avatarHalfW;
      return { stack, avatar, badge: avatar + avatarHalfW + innerGap + badgeW / 2 };
    }
    const cellR = w - pad;
    const stack = cellR - stackW / 2;
    const avatar = cellR - stackW - innerGap - avatarHalfW;
    return { stack, avatar, badge: avatar - avatarHalfW - innerGap - badgeW / 2 };
  };
  const left = cellX(0);
  const right = cellX(1);

  const seats: { x: number; y: number }[] = [];
  const piles: { x: number; y: number }[] = [];
  const badges: { x: number; y: number }[] = [];
  const staging: { x: number; y: number }[] = [];

  // Seat 0 = YOU: avatar above badge, right of the hand; staged card lands here.
  const youX = w - pad - badgeW / 2;
  seats.push({ x: youX, y: handCenterY - 30 });
  piles.push({ x: youX, y: handCenterY });
  badges.push({ x: youX, y: handCenterY + 18 });
  staging.push({ x: youX, y: handCenterY });

  // Opponents 1-4: col0 = former left seats, col1 = former right seats.
  const cells: { x: typeof left; row: number }[] = [
    { x: left, row: 0 },
    { x: left, row: 1 },
    { x: right, row: 0 },
    { x: right, row: 1 },
  ];
  for (const cell of cells) {
    const y = rowYs[cell.row];
    seats.push({ x: cell.x.avatar, y });
    piles.push({ x: cell.x.stack, y });
    badges.push({ x: cell.x.badge, y });
    staging.push({ x: cell.x.avatar, y }); // staged card covers the cell's avatar
  }

  const lineW = Math.min(150, w * 0.36);
  const roundLine = { x: (w - lineW) / 2, y: topInset + 30, w: lineW };

  return {
    screenW: w,
    screenH: h,
    portrait: true,
    rowCard,
    rowGapX,
    rowGapY,
    rowOriginX,
    rowOriginY,
    rowY,
    rowPromptY: rowOriginY - gapGR / 2,
    handCard: rowCard,
    handY: handTop,
    handSlot,
    handLift: 10,
    staging,
    seats,
    piles,
    badges,
    badgeScale,
    seatScale,
    roundLine,
  };
}
