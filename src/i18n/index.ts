/**
 * i18n: English + Thai strings, one table from day one (Q34).
 * HYPERSTRIKE! voice: pilots, lanes, damage, HP — quantity = "damage",
 * card art/story = "lasers", rows = "lanes". `t('key', params)` reads the
 * current language from settings.
 */

import { getSettings, onSettingsChange } from '../state/settingsStore';

type Lang = 'en' | 'th';

const en = {
  'menu.play': 'PLAY',
  'menu.tutorial': 'TUTORIAL',
  'menu.rules': 'RULES',
  'menu.resume': 'RESUME MATCH',
  'menu.settings': 'Settings',
  'menu.subtitle': 'A GALACTIC WAR CARD GAME',

  'settings.title': 'SETTINGS',
  'settings.music': 'Ambient music',
  'settings.sfx': 'Sound effects',
  'settings.speed': 'Game speed',
  'settings.motion': 'Motion intensity',
  'settings.motion.full': 'Full',
  'settings.motion.reduced': 'Reduced',
  'settings.language': 'Language',
  'settings.close': 'CLOSE',

  'pause.title': 'PAUSED',
  'pause.resume': 'RESUME',
  'pause.settings': 'SETTINGS',
  'pause.menu': 'MAIN MENU',
  'pause.leaveConfirm': 'Leave the sortie? Progress is saved each round.',
  'pause.leaveYes': 'LEAVE',
  'pause.leaveNo': 'STAY',

  'rules.title': 'PILOT BRIEFING',
  'rules.goal':
    'Goal: finish with the LEAST damage. Your HP starts at 100 — when any pilot reaches 0 HP the sortie ends, and the pilot with the most HP remaining wins.',
  'rules.deal':
    'Each pilot gets 10 cards. Every round, everyone fires one card at the same time.',
  'rules.place':
    'Fired cards land lowest-first in the LANE whose last card is the nearest lower number — your card always joins the nearest lane below it.',
  'rules.take':
    'A lane holds 5 cards. If your card would be the 6th, you absorb that lane: take all 5 cards as damage, and your card starts the lane again.',
  'rules.low':
    'If your card is lower than every lane, you must choose a lane to absorb — pick the one with the least damage. Your card then starts that lane.',
  'rules.points':
    'Damage: card 55 fires 7 lasers (7 damage) · multiples of 11 fire 5 · multiples of 10 fire 3 · other multiples of 5 fire 2 · the rest fire 1.',
  'rules.back': 'BACK',

  'game.round': 'ROUND {n} / 10',
  'game.speed2': '×2',
  'game.pause': 'II',
  'game.rowPrompt': 'CARD {c} IS LOWER THAN EVERY LANE — CHOOSE A LANE TO ABSORB!',
  'game.you': 'YOU',

  'score.title': 'HAND COMPLETE',
  'score.continue': 'NEXT HAND →',
  'score.results': 'RESULTS →',
  'score.hint': 'click or press space',
  'score.peekHint': 'release Tab to hide',

  'end.win': 'VICTORY!',
  'end.lose': 'HULL BREACHED!',
  'end.draw': 'STALEMATE!',
  'end.rematch': 'REMATCH',
  'end.menu': 'MAIN MENU',

  'tut.step1.title': 'YOUR FIRST SHOT',
  'tut.step1.body':
    'Every round, everyone fires one card at once — lowest first. A card lands in the LANE whose LAST card is the nearest lower number. Fire the glowing 65!',
  'tut.land.title': 'NEAREST LANE WINS',
  'tut.land.body':
    'Your 65 landed in the lane ending in 50 — the nearest lower number, not the lane ending in 11. The lane grew one card.',
  'tut.step2.title': 'SMALL CARDS TOO',
  'tut.step2.body':
    'Fire the glowing 13. Small cards are safe as long as they find a lane to land in.',
  'tut.fill.title': 'LANES FILL UP',
  'tut.fill.body':
    'A lane holds 5 cards. This one now has 4 — the next card landing there is the 6th, and that pilot absorbs the whole lane as damage!',
  'tut.step3.title': 'TRIGGER THE TAKE',
  'tut.step3.body': 'Fire the glowing 15 to fill the lane. Watch what the next card does…',
  'tut.take.title': 'SIX CARDS = ABSORB IT!',
  'tut.take.body':
    'The 6th card forces its pilot to ABSORB the lane — every laser hit becomes their damage. Nyx just took 10 damage!',
  'tut.step4.title': 'LOWER THAN EVERY LANE',
  'tut.step4.body':
    'Fire the glowing 4. It is lower than every lane — you will have to choose a lane to absorb.',
  'tut.done.title': 'FORCED CHOICE',
  'tut.done.body':
    'When your card beats every lane, you must absorb one — usually the lane with the least damage. Your card then starts that lane again.',
  'tut.finish.title': 'YOU ARE READY, PILOT!',
  'tut.finish.body':
    'That is the whole war: dodge damage, bait rivals into absorbing lanes, and end the sortie with the most HP. Good luck, pilot!',
  'tut.next': 'NEXT',
  'tut.leave': 'LEAVE',
  'tut.finish': 'DONE',

  'rotate.rotate': 'Rotate your device to landscape',
} as const;

export type StringKey = keyof typeof en;

const th: Record<StringKey, string> = {
  'menu.play': 'เล่น',
  'menu.tutorial': 'สอนเล่น',
  'menu.rules': 'กติกา',
  'menu.resume': 'เล่นต่อ',
  'menu.settings': 'ตั้งค่า',
  'menu.subtitle': 'เกมการ์ดสงครามกาแล็กซี',

  'settings.title': 'ตั้งค่า',
  'settings.music': 'เพลงบรรเลง',
  'settings.sfx': 'เอฟเฟกต์เสียง',
  'settings.speed': 'ความเร็วเกม',
  'settings.motion': 'ระดับแอนิเมชัน',
  'settings.motion.full': 'เต็ม',
  'settings.motion.reduced': 'ลดลง',
  'settings.language': 'ภาษา',
  'settings.close': 'ปิด',

  'pause.title': 'หยุดชั่วคราว',
  'pause.resume': 'เล่นต่อ',
  'pause.settings': 'ตั้งค่า',
  'pause.menu': 'หน้าหลัก',
  'pause.leaveConfirm': 'ออกจากภารกิจ? ความคืบหน้าจะบันทึกทุกตา',
  'pause.leaveYes': 'ออก',
  'pause.leaveNo': 'อยู่ต่อ',

  'rules.title': 'คู่มือนักบิน',
  'rules.goal':
    'เป้าหมาย: รับความเสียหายน้อยที่สุด HP เริ่มที่ 100 — เมื่อนักบินคนใดเหลือ HP 0 การรบจะจบลง และนักบินที่เหลือ HP มากที่สุดชนะ',
  'rules.deal': 'นักบินแต่ละคนได้การ์ด 10 ใบ ทุกตาทุกคนยิงการ์ดพร้อมกัน',
  'rules.place':
    'การ์ดที่ยิงจะถูกจัดจากน้อยไปมากใน "เลน" ที่เลขท้ายใกล้เคียงน้อยกว่าที่สุด — การ์ดของคุณจะลงเลนที่ต่ำกว่าและใกล้ที่สุดเสมอ',
  'rules.take':
    'เลนหนึ่งจุได้ 5 ใบ ถ้าการ์ดของคุณเป็นใบที่ 6 คุณต้องรับเลนนั้น: เก็บไพ่ทั้ง 5 ใบเป็นความเสียหาย และการ์ดของคุณเริ่มเลนนั้นใหม่',
  'rules.low':
    'ถ้าการ์ดของคุณน้อยกว่าทุกเลน คุณต้องเลือกรับหนึ่งเลน — เลือกที่เสียหายน้อยที่สุด แล้วการ์ดของคุณจะเริ่มเลนนั้น',
  'rules.points':
    'ความเสียหาย: ไพ่ 55 ยิงเลเซอร์ 7 นัด (7 ความเสียหาย) · ไพ่ที่หาร 11 ลงตัวยิง 5 · หาร 10 ลงตัวยิง 3 · หาร 5 ลงตัวอื่นยิง 2 · ที่เหลือยิง 1',
  'rules.back': 'กลับ',

  'game.round': 'รอบที่ {n} / 10',
  'game.speed2': '×2',
  'game.pause': 'II',
  'game.rowPrompt': 'การ์ด {c} ต่ำกว่าทุกเลน — เลือกเลนที่จะรับ!',
  'game.you': 'คุณ',

  'score.title': 'จบตาแล้ว',
  'score.continue': 'ตาต่อไป →',
  'score.results': 'ผลลัพธ์ →',
  'score.hint': 'คลิกหรือกด space',
  'score.peekHint': 'ปล่อย Tab เพื่อซ่อน',

  'end.win': 'ชัยชนะ!',
  'end.lose': 'ตัวเรือแตก!',
  'end.draw': 'เสมอกัน!',
  'end.rematch': 'เล่นอีกครั้ง',
  'end.menu': 'หน้าหลัก',

  'tut.step1.title': 'ยิงนัดแรกของคุณ',
  'tut.step1.body':
    'ทุกตาทุกคนยิงการ์ดพร้อมกัน — จากน้อยไปมาก การ์ดจะลงเลนที่เลขท้ายใกล้เคียงน้อยกว่าที่สุด ยิงไพ่ 65 ที่เรืองแสงเลย!',
  'tut.land.title': 'เลนที่ใกล้ที่สุดชนะ',
  'tut.land.body':
    'ไพ่ 65 ของคุณลงเลนที่จบด้วย 50 — ใกล้เคียงที่สุด ไม่ใช่เลนที่จบด้วย 11 เลนใหญ่ขึ้นหนึ่งใบ',
  'tut.step2.title': 'ไพ่เล็กก็สำคัญ',
  'tut.step2.body': 'ยิงไพ่ 13 ที่เรืองแสง ไพ่เล็กปลอดภัยเสมอเมื่อมีเลนให้ลง',
  'tut.fill.title': 'เลนเริ่มเต็ม',
  'tut.fill.body':
    'เลนหนึ่งมีได้ 5 ใบ ตอนนี้เหลือ 4 — ไพ่ถัดไปที่ลงเลนนี้จะเป็นใบที่ 6 และนักบินคนนั้นต้องรับเลนทั้งเลนเป็นความเสียหาย!',
  'tut.step3.title': 'จุดชนวนการรับเลน',
  'tut.step3.body': 'ยิงไพ่ 15 เพื่อเติมเลน ดูว่าไพ่ใบถัดไปจะเกิดอะไรขึ้น…',
  'tut.take.title': 'หกใบ = รับเลย!',
  'tut.take.body':
    'ไพ่ใบที่ 6 ทำให้นักบินนั้นรับเลนทั้งเลน — ลำแสงทุกนัดกลายเป็นความเสียหายของพวกเขา ไนซ์เพิ่งรับไป 10!',
  'tut.step4.title': 'น้อยกว่าทุกเลน',
  'tut.step4.body':
    'ยิงไพ่ 4 ที่เรืองแสง มันน้อยกว่าทุกเลน — คุณจะต้องเลือกรับหนึ่งเลน',
  'tut.done.title': 'บังคับเลือกเลน',
  'tut.done.body':
    'เมื่อการ์ดของคุณน้อยกว่าทุกเลน คุณต้องรับหนึ่งเลน — มักเลือกเลนที่เสียหายน้อยที่สุด แล้วการ์ดของคุณจะเริ่มเลนนั้นใหม่',
  'tut.finish.title': 'พร้อมแล้วนักบิน!',
  'tut.finish.body':
    'นี่คือทั้งสงคราม: หลบความเสียหาย หลอกให้คู่แข่งรับเลน และจบการรบด้วย HP มากที่สุด ขอให้โชคดี!',
  'tut.next': 'ถัดไป',
  'tut.leave': 'ออกจากบทเรียน',
  'tut.finish': 'เสร็จสิ้น',

  'rotate.rotate': 'หมุนอุปกรณ์เป็นแนวนอน',
};

const dicts: Record<Lang, Record<StringKey, string>> = { en, th };

/** Translate a key with {param} substitution. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  let s = dicts[getSettings().language][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}

const listeners = new Set<() => void>();

/** Re-render callback subscription (screens re-render on language change). */
export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

onSettingsChange((s) => {
  if (s.language === 'en' || s.language === 'th') {
    for (const fn of listeners) fn();
  }
});
