/** Settings modal: music/SFX sliders, speed, motion, language (Q15). */

import { t } from '../i18n';
import { getSettings, updateSettings } from '../state/settingsStore';
import { el, onEscape, uiRoot } from './dom';

export function openSettings(onClose: () => void): void {
  const root = uiRoot();

  const overlay = el('div', 'overlay settings-overlay');
  const panel = el('div', 'panel settings-panel');

  const render = (): void => {
    const s = getSettings();
    panel.innerHTML = '';

    panel.appendChild(el('div', 'panel-title', t('settings.title')));

    const slider = (labelKey: 'settings.music' | 'settings.sfx', field: 'music' | 'sfx'): void => {
      const row = el('label', 'setting-row');
      row.appendChild(el('span', '', t(labelKey)));
      const input = el('input') as HTMLInputElement;
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(s[field] * 100));
      input.addEventListener('input', () => updateSettings({ [field]: Number(input.value) / 100 }));
      row.appendChild(input);
      panel.appendChild(row);
    };
    slider('settings.music', 'music');
    slider('settings.sfx', 'sfx');

    // speed: ×1 / ×2
    const speedRow = el('div', 'setting-row');
    speedRow.appendChild(el('span', '', t('settings.speed')));
    const speedBtns = el('div', 'seg');
    for (const v of [1, 2] as const) {
      const b = el('button', `seg-btn${s.speed === v ? ' on' : ''}`, v === 1 ? '×1' : '×2');
      b.addEventListener('click', () => {
        updateSettings({ speed: v });
        render();
      });
      speedBtns.appendChild(b);
    }
    speedRow.appendChild(speedBtns);
    panel.appendChild(speedRow);

    // motion
    const motionRow = el('div', 'setting-row');
    motionRow.appendChild(el('span', '', t('settings.motion')));
    const motionBtns = el('div', 'seg');
    for (const v of ['full', 'reduced'] as const) {
      const b = el(
        'button',
        `seg-btn${s.motion === v ? ' on' : ''}`,
        t(v === 'full' ? 'settings.motion.full' : 'settings.motion.reduced'),
      );
      b.addEventListener('click', () => {
        updateSettings({ motion: v });
        render();
      });
      motionBtns.appendChild(b);
    }
    motionRow.appendChild(motionBtns);
    panel.appendChild(motionRow);

    // language
    const langRow = el('div', 'setting-row');
    langRow.appendChild(el('span', '', t('settings.language')));
    const langBtns = el('div', 'seg');
    for (const v of ['en', 'th'] as const) {
      const b = el('button', `seg-btn${s.language === v ? ' on' : ''}`, v === 'en' ? 'EN' : 'ไทย');
      b.addEventListener('click', () => {
        updateSettings({ language: v });
        render();
      });
      langBtns.appendChild(b);
    }
    langRow.appendChild(langBtns);
    panel.appendChild(langRow);

    const close = el('button', 'arcade-btn primary', t('settings.close'));
    close.addEventListener('click', done);
    panel.appendChild(close);
  };

  const offEscape = onEscape(() => done());
  const done = (): void => {
    offEscape();
    overlay.remove();
    onClose();
  };

  render();
  overlay.appendChild(panel);
  root.appendChild(overlay);
}
