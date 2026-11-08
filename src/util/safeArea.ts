/**
 * Safe-area insets (notch / home indicator) via env(safe-area-inset-*).
 * env() can't be read from JS directly, so a hidden probe element with
 * env() paddings is measured through getComputedStyle.
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

let probe: HTMLDivElement | null = null;

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function safeAreaInsets(): Insets {
  if (typeof document === 'undefined' || !document.body) return ZERO;
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position:fixed',
      'visibility:hidden',
      'pointer-events:none',
      'width:0',
      'height:0',
      'padding-top:env(safe-area-inset-top)',
      'padding-right:env(safe-area-inset-right)',
      'padding-bottom:env(safe-area-inset-bottom)',
      'padding-left:env(safe-area-inset-left)',
    ].join(';');
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
}
