/**
 * Audio: ambient music + physical card SFX (Q38).
 *
 * Music: bundled locally (src/audio/) and looped through the volume
 * slider. Drop a new .mp3/.ogg in that folder and point the import below
 * at it to change the track. Ambient music pauses with the tab.
 *
 * SFX are synthesized with Web Audio (no assets) and respect the SFX
 * volume setting live. Both start on the first user gesture (autoplay
 * policy).
 */

import loopUrl from './upbeat.mp3';
import { getSettings, onSettingsChange } from '../state/settingsStore';
import type { SfxName } from './names';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private music: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicRunning = false;

  /** Create/resume the audio contexts. Safe to call often. */
  ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      const ctx = this.ctx;

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = getSettings().sfx;
      this.sfxGain.connect(ctx.destination);

      // shared white-noise buffer for SFX
      const len = Math.floor(ctx.sampleRate * 2);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // singleton lives for the app's lifetime — listener stays registered
      onSettingsChange((s) => {
        if (this.musicGain) {
          this.musicGain.gain.setTargetAtTime(s.music * MUSIC_LEVEL, ctx.currentTime, 0.05);
        } else if (this.music) {
          this.music.volume = s.music * MUSIC_LEVEL; // fallback (no Web Audio graph)
        }
        this.sfxGain?.gain.setTargetAtTime(s.sfx, ctx.currentTime, 0.05);
      });

      document.addEventListener('visibilitychange', () => {
        if (!this.music || !this.musicRunning) return;
        if (document.hidden) this.music.pause();
        else void this.music.play().catch(() => undefined);
      });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Start the ambient loop (idempotent). */
  startMusic(): void {
    if (this.musicRunning) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.music) {
      this.music = new Audio(loopUrl);
      this.music.loop = true;
      this.music.preload = 'auto';
      // iOS ignores HTMLMediaElement.volume, so element volume stays at 1
      // and the real level control is the musicGain node below.
      this.music.volume = 1;
      this.connectMusicGraph(ctx);
    }
    this.musicRunning = true;
    void this.music.play().catch(() => {
      // autoplay refused — will retry on the next user gesture
      this.musicRunning = false;
    });
  }

  /**
   * Route the music element through a GainNode. iOS Safari treats
   * element.volume as read-only (always 100%), so without this the slider
   * can neither lower the music nor change it. Falls back to element
   * volume where Web Audio routing is unavailable.
   */
  private connectMusicGraph(ctx: AudioContext): void {
    if (!this.music || this.musicSource) return;
    try {
      this.musicSource = ctx.createMediaElementSource(this.music);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = getSettings().music * MUSIC_LEVEL;
      this.musicSource.connect(this.musicGain);
      this.musicGain.connect(ctx.destination);
    } catch {
      this.musicSource = null;
      this.musicGain = null;
      this.music.volume = getSettings().music * MUSIC_LEVEL;
    }
  }

  // ------------------------------------------------------------ SFX utils

  private noiseBurst(
    ctx: AudioContext,
    t: number,
    dur: number,
    freq: number,
    type: BiquadFilterType,
    gain: number,
    dest: AudioNode,
    sweepTo?: number,
  ): void {
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.4, dur * 0.3);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + dur + 0.3);
  }

  private tone(
    ctx: AudioContext,
    t: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    dest: AudioNode,
    glideTo?: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.5, dur * 0.35);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.3);
  }

  // ------------------------------------------------------------- playback

  play(name: SfxName, opts: { intensity?: number } = {}): void {
    const ctx = this.ensure();
    const dest = this.sfxGain;
    if (!ctx || !dest) return;
    const t = ctx.currentTime + 0.01;

    switch (name) {
      case 'cardSlide':
        this.noiseBurst(ctx, t, 0.16, 500, 'bandpass', 0.22, dest, 1400);
        break;
      case 'cardPlay':
        this.noiseBurst(ctx, t, 0.2, 380, 'bandpass', 0.28, dest, 1600);
        this.tone(ctx, t, 180, 0.1, 'sine', 0.1, dest, 90);
        break;
      case 'cardFlip':
        this.noiseBurst(ctx, t, 0.05, 2200, 'highpass', 0.2, dest);
        this.noiseBurst(ctx, t + 0.07, 0.05, 2600, 'highpass', 0.16, dest);
        break;
      case 'rowTake': {
        const power = Math.min(1, (opts.intensity ?? 3) / 15);
        this.noiseBurst(ctx, t, 0.35, 900, 'lowpass', 0.3 + power * 0.2, dest, 220);
        this.tone(ctx, t, 220 + power * 60, 0.28, 'triangle', 0.16 + power * 0.1, dest, 70);
        break;
      }
      case 'bigPenalty':
        this.tone(ctx, t, 160, 0.5, 'sawtooth', 0.16, dest, 55);
        this.noiseBurst(ctx, t, 0.5, 700, 'lowpass', 0.3, dest, 150);
        break;
      case 'uiClick':
        this.tone(ctx, t, 760, 0.06, 'square', 0.06, dest, 620);
        break;
      case 'uiHover':
        this.tone(ctx, t, 1100, 0.03, 'sine', 0.03, dest);
        break;
      case 'roundStart':
        this.tone(ctx, t, 660, 0.12, 'sine', 0.07, dest);
        this.tone(ctx, t + 0.09, 880, 0.16, 'sine', 0.07, dest);
        break;
      case 'handEnd':
        [523.25, 659.25, 783.99].forEach((f, i) =>
          this.tone(ctx, t + i * 0.09, f, 0.2, 'triangle', 0.08, dest),
        );
        break;
      case 'victory':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(ctx, t + i * 0.12, f, 0.3, 'triangle', 0.1, dest),
        );
        break;
      case 'defeat':
        [392, 349.23, 293.66, 233.08].forEach((f, i) =>
          this.tone(ctx, t + i * 0.14, f, 0.32, 'triangle', 0.09, dest),
        );
        break;
    }
  }

  /** Diagnostics for tests/UI. */
  state(): {
    hasContext: boolean;
    musicRunning: boolean;
    musicPlaying: boolean;
    ctxState: string | null;
    musicGain: number | null;
  } {
    return {
      hasContext: this.ctx !== null,
      musicRunning: this.musicRunning,
      musicPlaying: !!this.music && !this.music.paused,
      ctxState: this.ctx?.state ?? null,
      musicGain: this.musicGain ? Number(this.musicGain.gain.value.toFixed(4)) : null,
    };
  }
}

/** Keep ambient music well under the SFX layer. */
const MUSIC_LEVEL = 0.55;

export const audio = new AudioEngine();

/** Call once on the first user gesture. */
export function initAudio(): void {
  audio.ensure();
  audio.startMusic();
}
