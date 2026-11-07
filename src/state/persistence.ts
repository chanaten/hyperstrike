/** Local persistence: match saves (resume) and settings. No accounts, no cloud. */

import type { MatchState } from '../engine/rules';

const MATCH_KEY = 'hyperstrike.match.v1';
const SETTINGS_KEY = 'hyperstrike.settings.v1';
// Legacy keys from before the rebrand: migrated once on first load, then removed.
const LEGACY_MATCH_KEY = 'bullheads.match.v1';
const LEGACY_SETTINGS_KEY = 'bullheads.settings.v1';

/** One-time migration of legacy storage keys to hyperstrike.*. */
function migrateLegacyKeys(): void {
  try {
    if (localStorage.getItem(SETTINGS_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
      if (legacy !== null) {
        localStorage.setItem(SETTINGS_KEY, legacy);
        localStorage.removeItem(LEGACY_SETTINGS_KEY);
      }
    }
    if (localStorage.getItem(MATCH_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_MATCH_KEY);
      if (legacy !== null) {
        localStorage.setItem(MATCH_KEY, legacy);
        localStorage.removeItem(LEGACY_MATCH_KEY);
      }
    }
  } catch {
    // storage unavailable — nothing to migrate
  }
}
migrateLegacyKeys();

export interface SavedMatch {
  version: 1;
  state: MatchState;
  savedAt: number;
}

export interface Settings {
  language: 'en' | 'th';
  /** 0..1 */
  music: number;
  /** 0..1 */
  sfx: number;
  /** 1 or 2 — the ×2 speed toggle. */
  speed: 1 | 2;
  motion: 'full' | 'reduced';
  tutorialSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  music: 0.3,
  sfx: 0.7,
  speed: 1,
  motion: 'full',
  tutorialSeen: false,
};

function isMatchState(v: unknown): v is MatchState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<MatchState>;
  return (
    Array.isArray(s.players) &&
    s.players.length === 5 &&
    s.players.every(
      (p) =>
        typeof p.id === 'number' &&
        Array.isArray(p.hand) &&
        typeof p.score === 'number' &&
        Array.isArray(p.takenCards),
    ) &&
    Array.isArray(s.rows) &&
    s.rows.length === 4 &&
    typeof s.round === 'number'
  );
}

export function saveMatch(state: MatchState): void {
  try {
    const payload: SavedMatch = { version: 1, state, savedAt: Date.now() };
    localStorage.setItem(MATCH_KEY, JSON.stringify(payload));
  } catch {
    // storage full/blocked — resume simply won't be offered
  }
}

/** Returns a validated saved match, or null (missing/corrupt/old). */
export function loadMatch(): SavedMatch | null {
  try {
    const raw = localStorage.getItem(MATCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedMatch;
    if (parsed.version !== 1 || !isMatchState(parsed.state)) return null;
    backfillTiers(parsed.state);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Pre-rebrand saves are match-wide difficulty and have no per-bot tiers —
 * backfill every bot with that difficulty (what the player experienced)
 * or the default composition, and drop the old field.
 */
function backfillTiers(state: MatchState): void {
  const legacy = state as MatchState & { difficulty?: string };
  const missing = state.players.some((p) => p.id > 0 && typeof p.tier !== 'string');
  if (!missing) return;
  const d = legacy.difficulty;
  const pinned: import('../engine/rules').BotTier | null =
    d === 'hard' || d === 'asian' || d === 'normal' ? d : null;
  const composition: import('../engine/rules').BotTier[] = ['normal', 'hard', 'asian', 'random'];
  let ci = 0;
  state.players.forEach((p, i) => {
    if (i === 0) {
      if (p.tier !== null) p.tier = null; // human seat
      return;
    }
    if (typeof p.tier !== 'string') {
      p.tier = pinned ?? composition[ci % composition.length];
      ci++;
    }
  });
  delete legacy.difficulty;
}

export function clearMatch(): void {
  try {
    localStorage.removeItem(MATCH_KEY);
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      speed: parsed.speed === 2 ? 2 : 1,
      motion: parsed.motion === 'reduced' ? 'reduced' : 'full',
      language: parsed.language === 'th' ? 'th' : 'en',
      tutorialSeen: Boolean(parsed.tutorialSeen),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
