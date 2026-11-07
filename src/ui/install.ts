/** PWA install capture + platform detection for the Settings guidance row. */

import type { StringKey } from '../i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

/** Capture the browser's deferred install prompt (Android/desktop Chrome). */
export function initInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

/** True when running from the Home Screen / installed window. */
export function isStandalone(): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  // iOS Safari exposes its own flag instead of display-mode.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function promptInstall(): void {
  const d = deferred;
  deferred = null;
  void d?.prompt().catch(() => undefined);
}

/** Fallback instructions when no install prompt event is available. */
export function installHintKey(): StringKey {
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'settings.install.ios';
  if (/Android/.test(ua)) return 'settings.install.android';
  return 'settings.install.desktop';
}
