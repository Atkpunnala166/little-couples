// Pure Web Audio API sound effects & ambient Lofi Love Music synthesizer
// Zero external audio asset dependencies so sounds always work offline and in PWA mode.

class SoundEngine {
  private ctx: AudioContext | null = null;
  private lofiRunning = false;
  private lofiTimer: number | null = null;
  private lofiMasterGain: GainNode | null = null;
  private ringtoneTimer: number | null = null;

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  public playNotification(muted = false) {
    if (muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [659.25, 880, 1046.5]; // E5, A5, C6 romantic bell
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.065 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.38);
    });
  }

  public playHeartPop(muted = false) {
    if (muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.09);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playMissYou(muted = false) {
    if (muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 987.77]; // Cmaj7 warm swell
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.09 + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.95);
    });
  }

  public playWin(muted = false) {
    if (muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.48);
    });
  }

  public startRingtone(muted = false) {
    this.stopRingtone();
    if (muted || typeof window === 'undefined') return;
    const pulse = () => {
      const ctx = this.getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      [587.33, 739.99, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.11);
        gain.gain.setValueAtTime(0.0001, now + i * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.11 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.11);
        osc.stop(now + i * 0.11 + 0.42);
      });
    };
    pulse();
    this.ringtoneTimer = window.setInterval(pulse, 2200);
  }

  public stopRingtone() {
    if (this.ringtoneTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.ringtoneTimer);
      this.ringtoneTimer = null;
    }
  }

  public toggleLofi(enabled: boolean) {
    if (enabled) {
      this.startLofi();
    } else {
      this.stopLofi();
    }
  }

  private startLofi() {
    if (this.lofiRunning || typeof window === 'undefined') return;
    const ctx = this.getCtx();
    if (!ctx) return;

    this.lofiRunning = true;
    const master = ctx.createGain();
    master.gain.value = 0.055;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    filter.connect(master);
    master.connect(ctx.destination);
    this.lofiMasterGain = master;

    // Warm romantic progression: Fmaj7 -> Em7 -> Dm7 -> Cmaj7
    const chords = [
      [174.61, 220.0, 261.63, 329.63],
      [164.81, 196.0, 246.94, 293.66],
      [146.83, 174.61, 220.0, 261.63],
      [130.81, 164.81, 196.0, 246.94],
    ];
    let step = 0;

    const playChord = () => {
      if (!this.lofiRunning || !this.ctx || !this.lofiMasterGain) return;
      const now = this.ctx.currentTime;
      const notes = chords[step % chords.length];
      step += 1;

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        // Subtle detune for analog tape warmth
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime((idx - 1.5) * 4, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.28 / notes.length, now + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
        osc.connect(g);
        g.connect(filter);
        osc.start(now + idx * 0.04);
        osc.stop(now + 3.5);
      });
    };

    playChord();
    this.lofiTimer = window.setInterval(playChord, 3200);
  }

  private stopLofi() {
    this.lofiRunning = false;
    if (this.lofiTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.lofiTimer);
      this.lofiTimer = null;
    }
    if (this.lofiMasterGain) {
      try {
        this.lofiMasterGain.disconnect();
      } catch {
        // ignore
      }
      this.lofiMasterGain = null;
    }
  }
}

export const soundEngine = new SoundEngine();

export function vibrateDevice(pattern: number | number[] = [40, 30, 40]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore unsupported
    }
  }
}

