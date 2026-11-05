"use strict";

// =====================================================================
// Sound — Web Audio, every sound generated in code
//
// Mobile notes:
// - Browsers only start/resume an AudioContext inside a "user activation"
//   event. On touch screens pointerdown/touchstart do NOT count; pointerup,
//   touchend, click and keydown do. unlock() is wired to those.
// - On first unlock a 1-sample silent buffer is played to wake the output.
// - iOS mutes Web Audio when the ring/silent switch is on. Setting
//   navigator.audioSession.type = 'playback' (Safari 16.4+) fixes that;
//   on older iOS a looping silent <audio> element switches the audio
//   session to "playback" as a fallback.
// =====================================================================
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Tiny silent 8-bit mono WAV, generated in code (no files)
function silentWavDataUri(seconds, rate) {
  const n = Math.max(1, Math.floor(seconds * rate));
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, 'data'); dv.setUint32(40, n, true);
  bytes.fill(128, 44);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
}

const Sound = {
  ctx: null,
  master: null,
  noiseBuf: null,
  primed: false,
  sessionAudio: null,
  quakeNodes: null,
  muted: Storage.get(CONFIG.storage.muted, '0') === '1',

  // Call from user-activation events (pointerup / touchend / click / keydown)
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : CONFIG.audio.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.setupAudioSession();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (!this.primed) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.ctx.createBuffer(1, 1, 22050);
        src.connect(this.ctx.destination);
        src.start(0);
        this.primed = true;
      } catch (e) { /* try again on the next gesture */ }
    }
    if (this.sessionAudio && this.sessionAudio.paused && !document.hidden) {
      const p = this.sessionAudio.play();
      if (p && p.catch) p.catch(() => {});
    }
  },

  // Let sound play even with the iOS silent switch on
  setupAudioSession() {
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = 'playback';
        return;
      }
    } catch (e) { /* not supported */ }
    if (IS_IOS) {
      const a = document.createElement('audio');
      a.src = silentWavDataUri(0.5, 8000);
      a.loop = true;
      a.setAttribute('playsinline', '');
      a.setAttribute('x-webkit-airplay', 'deny');
      a.preload = 'auto';
      this.sessionAudio = a;
    }
  },

  // Re-activate after the tab comes back (contexts get suspended/interrupted)
  resume() {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
    if (this.sessionAudio && this.sessionAudio.paused) {
      const p = this.sessionAudio.play();
      if (p && p.catch) p.catch(() => {});
    }
  },
  suspend() {
    this.stopQuake();
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    if (this.sessionAudio) this.sessionAudio.pause();
  },
  toggleMute() {
    this.muted = !this.muted;
    Storage.set(CONFIG.storage.muted, this.muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : CONFIG.audio.volume, this.ctx.currentTime, 0.02);
  },
  ready() { return this.ctx && !this.muted && this.ctx.state === 'running'; },

  tone(f0, f1, dur, type, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  },
  noise(dur, vol, freq, freqEnd, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  },

  land() {
    if (!this.ready()) return;
    this.tone(180, 70, 0.13, 'sine', 0.7);
    this.noise(0.07, 0.35, 2200, 400);
  },
  perfect(combo) {
    if (!this.ready()) return;
    const f = 880 * Math.pow(2, Math.min(combo - 1, 12) / 12); // pitch rises with combo
    this.tone(160, 80, 0.1, 'sine', 0.4);
    this.tone(f, f, 0.5, 'sine', 0.32);
    this.tone(f * 2, f * 2, 0.3, 'triangle', 0.1, 0.01);
    this.tone(f * 1.5, f * 1.5, 0.4, 'sine', 0.12, 0.06);
  },
  bonus() {
    if (!this.ready()) return;
    [660, 830, 990, 1320].forEach((f, i) => this.tone(f, f, 0.3, 'triangle', 0.18, i * 0.08));
  },
  miss() {
    if (!this.ready()) return;
    this.tone(620, 130, 0.5, 'triangle', 0.25);
    this.noise(0.3, 0.08, 1200, 200, 0.05);
  },
  creak() {
    if (!this.ready()) return;
    this.tone(130, 85, 0.55, 'sawtooth', 0.06);
    this.tone(70, 50, 0.55, 'sine', 0.3);
  },
  crash() {
    if (!this.ready()) return;
    this.stopQuake();
    this.noise(1.4, 0.6, 1400, 120);
    this.tone(95, 35, 1.1, 'sine', 0.6);
    for (let k = 0; k < 5; k++) this.tone(170 - k * 15, 60, 0.14, 'sine', 0.45, 0.08 + k * 0.11 + Math.random() * 0.05);
  },
  // Low rumble for the whole earthquake
  quake(duration) {
    if (!this.ready()) return;
    this.stopQuake();
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.4);
    g.gain.setValueAtTime(0.9, t + duration - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
    this.tone(55, 40, duration, 'sine', 0.35);
    this.quakeNodes = { src, g };
  },
  stopQuake() {
    if (!this.quakeNodes || !this.ctx) return;
    const { src, g } = this.quakeNodes;
    try {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.05);
      src.stop(t + 0.3);
    } catch (e) { /* already stopped */ }
    this.quakeNodes = null;
  },
};
