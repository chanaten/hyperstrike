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

/** Bot strip cell: callsign label above its HP pill. */
export interface StripCell {
  nameX: number;
  nameY: number;
  pillX: number;
  pillY: number;
}

/** Compute card size + row/hand geometry for the current screen. */
export interface Layout {
  screenW: number;
  screenH: number;
  /** Vertical phone layout (portrait, narrow): no avatars/piles, bots in a
   *  top strip, hand in two rows of five clear of the player readout. */
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
  /** Center of hand card i when holding n cards (two rows in portrait). */
  handSlot: (i: number, n: number) => { x: number; y: number };
  /** Lift applied to the selected hand card. */
  handLift: number;
  /** Scale of face-down staged cards before the reveal. */
  stagingScale: number;
  /** Scale of the HP pills (compacted in the portrait strip). */
  badgeScale: number;
  /** Staging slots where played cards land face-down before reveal. */
  staging: { x: number; y: number }[];
  /** Seat anchors (avatar in landscape; strip cell in portrait). */
  seats: { x: number; y: number }[];
  /** Opponent card-pile anchors (landscape only). */
  piles: { x: number; y: number }[];
  /** Score badge anchors (per seat). */
  badges: { x: number; y: number }[];
  /** Portrait bots strip (4 cells, left→right); empty in landscape. */
  botCells: StripCell[];
  /** Portrait player readout (name + badge) beside the hand. */
  youLabel: { x: number; y: number };
  roundLine: { x: number; y: number; w: number };
  /** Scale of a selected hand card (zoomed for readability on phones). */
  selectedScale: number;
  /** Round text anchor (0 = left-aligned landscape, 0.5 = centered strip). */
  roundAnchor: number;
  roundTextY: number;
}

export const ROW_SLOTS = 6; // max visible in a row (5 + incoming)

/** Vertical phone layout for portrait windows; landscape everywhere else. */
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
  const handStep = (n: number): number => {
    const gap = handCard.w * 0.1;
    const ideal = handCard.w + gap;
    const total = handCard.w + (n - 1) * ideal;
    if (total <= w * 0.94) return ideal;
    // extreme window: shrink the gap first, overlap only as a last resort
    return Math.max(handCard.w * 0.6, (w * 0.94 - handCard.w) / Math.max(1, n - 1));
  };
  const handSlot = (i: number, n: number): { x: number; y: number } => {
    const step = handStep(n);
    const total = handCard.w + (n - 1) * step;
    return { x: (w - total) / 2 + handCard.w / 2 + i * step, y: handY + handCard.h / 2 };
  };

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
    stagingScale: 1,
    badgeScale: 1,
    staging,
    seats,
    piles,
    badges,
    botCells: [],
    youLabel: { x: cornerX, y: avatarY - 30 },
    roundLine,
    roundAnchor: 0,
    roundTextY: roundLine.y - 14,
    selectedScale: 1.06,
  };
}

/**
 * Portrait phone table, top → bottom: round indicator between the DOM HUD
 * buttons, a strip of four bot cells (callsign + HP pill), a compact staging
 * band for face-down plays, the four horizontal lanes centered in the
 * remaining space, and the hand in two rows of five with the YOU readout in
 * a slim right column. No avatars or opponent card piles.
 */
function computePortraitLayout(w: number, h: number, insets: SafeAreaInsets): Layout {
  const { top, bottom } = insets;
  const pad = Math.max(10, Math.round(w * 0.03));
  const topBand = 56; // DOM ×1 / pause buttons (12 top + 44 tall)
  const stripH = 39; // callsign + HP pill (spaced clear of each other)
  const badgeScale = 0.77;
  const stagingScale = 0.9; // staged cards almost field size
  const bandPad = 5;
  const bottomMargin = 5;
  const youColW = 54; // fits the near-full-size staged card beside the hand

  // Card size: six slots + five gaps across the width; the hand (5 cards)
  // must also clear the YOU column; the height cap keeps 320×568 fitting
  // with a minimum 20px of breathing room around the board.
  const widthCap = (w - 2 * pad) / 6.5;
  const handCap = (w - 2 * pad - youColW) / 5.4;
  const fixedH =
    top + topBand + 6 + stripH + 3 + bandPad + bottomMargin + bottom;
  const heightCap = (h - fixedH - 16) / (stagingScale + 4.36 + 2.1);
  const rowCardH = Math.max(30, Math.min(widthCap / 0.72, handCap / 0.72, heightCap));
  const rowCard: CardMetrics = {
    h: rowCardH,
    w: rowCardH * 0.72,
    radius: Math.max(4, rowCardH * 0.08),
  };
  const rowGapX = rowCard.w * 0.1;
  const rowGapY = rowCard.h * 0.12;

  const rowsW = ROW_SLOTS * rowCard.w + (ROW_SLOTS - 1) * rowGapX;
  const rowsH = 4 * rowCard.h + 3 * rowGapY;
  const rowOriginX = (w - rowsW) / 2;

  // Bots strip below the button band: names sit clear of the buttons and
  // the HP pill sits clear below the name (no overlap).
  const stripTop = top + topBand + 6;
  const cellW = (w - 2 * pad) / 4;
  const botCells: StripCell[] = [];
  for (let k = 0; k < 4; k++) {
    const cx = pad + cellW * (k + 0.5);
    botCells.push({ nameX: cx, nameY: stripTop + 8, pillX: cx, pillY: stripTop + 27 });
  }

  // Staging: each bot's face-down card waits under its own strip cell, so
  // it is obvious whose card is whose. Yours waits above your readout.
  const bandH = rowCard.h * stagingScale + bandPad;
  const bandTop = stripTop + stripH + 3;
  const bandCenterY = bandTop + bandH / 2;

  // Hand pinned to the bottom; the board is centered in the space between
  // the staging band and the hand (slack splits evenly above/below).
  const handGapY = rowCard.h * 0.1;
  const handH = 2 * rowCard.h + handGapY;
  const handTop = h - bottom - bottomMargin - handH;
  const handTopRowY = handTop + rowCard.h / 2;
  const handBottomRowY = handTop + rowCard.h + handGapY + rowCard.h / 2;
  const handGapX = rowCard.w * 0.1;
  const handSlot = (i: number, n: number): { x: number; y: number } => {
    const bottomN = Math.min(n, 5); // bottom row fills first (thumb reach)
    const onBottom = i < bottomN;
    const col = onBottom ? i : i - bottomN;
    return {
      x: pad + rowCard.w / 2 + col * (rowCard.w + handGapX),
      y: onBottom ? handBottomRowY : handTopRowY,
    };
  };

  const bandBottom = bandTop + bandH;
  const slack = Math.max(0, handTop - bandBottom - rowsH);
  const gapUp = slack / 2;
  const rowOriginY = bandBottom + gapUp;
  const rowY = (i: number): number => rowOriginY + i * (rowCard.h + rowGapY);

  const youX = w - pad - youColW / 2;
  const seats: { x: number; y: number }[] = [
    { x: youX, y: handBottomRowY },
    ...botCells.map((c) => ({ x: c.pillX, y: c.pillY })),
  ];
  const piles = seats.slice(); // no piles in portrait — anchors unused
  // YOUR readout sits level with the bottom hand row; the staged card sits
  // directly above it, level with the top hand row.
  const badges: { x: number; y: number }[] = [
    { x: youX, y: handBottomRowY + 10 },
    ...botCells.map((c) => ({ x: c.pillX, y: c.pillY })),
  ];
  const staging: { x: number; y: number }[] = [
    { x: youX, y: handTopRowY },
    ...botCells.map((c) => ({ x: c.pillX, y: bandCenterY })),
  ];

  const lineW = Math.min(140, w * 0.4);
  const roundLine = { x: (w - lineW) / 2, y: top + 36, w: lineW };

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
    rowPromptY: rowOriginY + rowsH / 2,
    handCard: rowCard,
    handY: handTop,
    handSlot,
    handLift: 26,
    stagingScale,
    badgeScale,
    staging,
    seats,
    piles,
    badges,
    botCells,
    youLabel: { x: youX, y: handBottomRowY - 12 },
    roundLine,
    roundAnchor: 0.5,
    roundTextY: top + 26,
    selectedScale: 1.5,
  };
}
