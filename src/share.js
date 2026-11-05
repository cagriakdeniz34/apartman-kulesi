"use strict";

// =====================================================================
// Sharing (stage 7)
//
// 1) Picture: a 9:16 card of the tower at its peak (floors, score, title,
//    address). Rendered once when the game-over panel has faded in, so the
//    share button can call navigator.share() straight inside the tap
//    (Safari rejects it after an async gap). Falls back to a download.
//
// 2) Collapse video: nothing is recorded live. While playing, a small ring
//    buffer keeps ~30 state samples per second (camera, angles, moving
//    blocks, particles, sound events). Only when the player asks for the
//    video is that log replayed into an offscreen 720x1280 canvas with the
//    normal drawing functions and recorded with MediaRecorder (+ the game
//    sounds through a MediaStreamDestination). The game is already over by
//    then, so gameplay never pays for it.
// =====================================================================

// ---------------------------------------------------------------------
// State log for the replay
// ---------------------------------------------------------------------
const Replay = {
  samples: [],
  sounds: [],
  simTime: 0,
  nextSample: 0,
  collapseAt: null,
  frozen: false,
  replaying: false,   // sound calls coming from the replay are not logged

  reset() {
    this.samples = [];
    this.sounds = [];
    this.simTime = 0;
    this.nextSample = 0;
    this.collapseAt = null;
    this.frozen = false;
  },

  active() {
    if (this.frozen) return false;
    if (game.state === State.PLAYING) return true;
    return game.state === State.GAME_OVER && this.collapseAt !== null &&
      this.simTime < this.collapseAt + CONFIG.share.video.postRoll;
  },

  // called at the end of every fixed physics step
  tick(dt) {
    if (!this.active()) return;
    const V = CONFIG.share.video;
    this.simTime += dt;
    if (this.simTime >= this.nextSample) {
      const slow = this.collapseAt !== null && this.simTime < this.collapseAt + V.slowLen;
      this.samples.push(this.capture());
      this.nextSample = this.simTime + 1 / (slow ? V.slowSampleRate : V.sampleRate);
    }
    // keep only the last few seconds until a collapse happens
    if (this.collapseAt === null) {
      const keep = this.simTime - V.preRoll - 0.3;
      let cut = 0;
      while (cut < this.samples.length && this.samples[cut].t < keep) cut++;
      if (cut > 0) this.samples.splice(0, cut);
      cut = 0;
      while (cut < this.sounds.length && this.sounds[cut].t < keep) cut++;
      if (cut > 0) this.sounds.splice(0, cut);
    }
  },

  markCollapse() { this.collapseAt = this.simTime; },

  logSound(name, args) {
    if (this.replaying || !this.active()) return;
    this.sounds.push({ t: this.simTime, name, args });
  },

  capture() {
    const f = game.falling;
    return {
      t: this.simTime,
      camX: game.cam.x, camY: game.cam.y,
      angle: game.angle, shake: game.shake, skyAlt: game.skyAlt, time: game.time,
      swingAngle: game.swing.angle, wind: game.swing.wind,
      ropeLen: game.crane.ropeLen, hookTwist: game.crane.hookTwist,
      craneBlock: game.crane.block, fadeT: game.crane.fadeT,
      tower: game.tower, n: game.tower.length,
      floors: game.floors, score: game.score, lives: game.lives, combo: game.combo,
      falling: f ? { block: f.block, x: f.x, y: f.y, rot: f.rot } : null,
      missed: game.missed.length ? game.missed.map((m) => ({ block: m.block, x: m.x, y: m.y, rot: m.rot })) : [],
      debris: game.debris.length ? game.debris.map((d) => ({ block: d.block, x: d.x, y: d.y, rot: d.rot })) : [],
      particles: game.particles.length ? game.particles.map((p) => ({ kind: p.kind, x: p.x, y: p.y, t: p.t, life: p.life, size: p.size })) : [],
      popups: game.popups.length ? game.popups.map((p) => Object.assign({}, p)) : [],
      birds: game.birds.length ? game.birds.map((b) => ({ x: b.x, y: b.y, phase: b.phase })) : [],
      clouds: game.clouds.map((c) => c.x),
    };
  },

  // Put a sample into `game` for drawing; returns what to restore afterwards
  apply(s) {
    const saved = {
      cam: game.cam, angle: game.angle, shake: game.shake, skyAlt: game.skyAlt, time: game.time,
      swing: game.swing, crane: game.crane, tower: game.tower, floors: game.floors, score: game.score,
      lives: game.lives, combo: game.combo, falling: game.falling, missed: game.missed, debris: game.debris,
      particles: game.particles, popups: game.popups, birds: game.birds, clouds: game.clouds,
    };
    game.cam = { x: s.camX, y: s.camY };
    game.angle = s.angle;
    game.shake = s.shake;
    game.skyAlt = s.skyAlt;
    game.time = s.time;
    game.swing = Object.assign({}, saved.swing, { angle: s.swingAngle, wind: s.wind });
    game.crane = Object.assign({}, saved.crane, { ropeLen: s.ropeLen, hookTwist: s.hookTwist, block: s.craneBlock, fadeT: s.fadeT });
    game.tower = s.tower.slice(0, s.n);
    game.floors = s.floors;
    game.score = s.score;
    game.lives = s.lives;
    game.combo = s.combo;
    game.falling = s.falling;
    game.missed = s.missed;
    game.debris = s.debris;
    game.particles = s.particles;
    game.popups = s.popups;
    game.birds = s.birds;
    game.clouds = saved.clouds.map((c, i) => Object.assign({}, c, { x: s.clouds[i] !== undefined ? s.clouds[i] : c.x }));
    return saved;
  },
  restore(saved) { Object.assign(game, saved); },
};

// Log every game sound so the replay can play it again
['land', 'perfect', 'bonus', 'miss', 'creak', 'crash', 'quake'].forEach((name) => {
  const original = Sound[name];
  Sound[name] = function (...args) {
    Replay.logSound(name, args);
    return original.apply(this, args);
  };
});

// ---------------------------------------------------------------------
// Share picture
// ---------------------------------------------------------------------
// makeCache() renders at view.dpr * view.scale; borrow that for other resolutions
function withPixelRatio(pr, fn) {
  const d = view.dpr, s = view.scale;
  view.dpr = pr;
  view.scale = 1;
  try { return fn(); } finally { view.dpr = d; view.scale = s; }
}

function cardBlockImage(blk, night, pr, memo) {
  if (memo.has(blk)) return memo.get(blk);
  const pad = CONFIG.block.cachePad;
  const half = blockVisualHalf(blk);
  const img = withPixelRatio(pr, () => makeCache(half * 2 + pad * 2, BH + pad * 2, (g) => {
    g.translate(half + pad, BH / 2 + pad);
    drawFacade(g, blk, night);
  }));
  memo.set(blk, img);
  return img;
}

// Tower corners relative to the pivot (screen axes: +y down)
function towerBounds(tower, angle, from) {
  const c = Math.cos(angle), s = Math.sin(angle);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = from; i < tower.length; i++) {
    const b = tower[i], half = blockVisualHalf(b);
    for (const lx of [b.cx - half, b.cx + half]) {
      for (const ly of [i * BH, (i + 1) * BH]) {
        const x = lx * c + ly * s, y = -(-lx * s + ly * c);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, x1, y0, y1 };
}

function cardText(g, text, x, y, size, fill, stroke, lw) {
  g.font = font(size);
  g.lineJoin = 'round';
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.strokeText(text, x, y);
  }
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function drawCardTower(g, snap, pivotX, pivotY, k, from, night, pr, memo) {
  const pad = CONFIG.block.cachePad;
  g.save();
  g.translate(pivotX, pivotY);
  g.scale(k, k);
  g.rotate(snap.angle);
  for (let i = from; i < snap.tower.length; i++) {
    const b = snap.tower[i], half = blockVisualHalf(b);
    g.drawImage(cardBlockImage(b, night, pr, memo), b.cx - half - pad, -(i + 1) * BH - pad, half * 2 + pad * 2, BH + pad * 2);
  }
  const top = snap.tower[snap.tower.length - 1];
  if (top && top.type !== 'roof' && (top.era === 'gecekondu' || (top.era === 'kacak' && !top.legal))) {
    drawRebars(g, top, top.cx, -snap.tower.length * BH);
  }
  g.restore();
}

function drawCardSkyline(g, sky, groundY, scale) {
  const layers = CONFIG.skyline.layers, tile = CONFIG.skyline.tileWidth;
  const th = SKYLINE_TILE_H * scale, tw = tile * scale;
  for (let li = 0; li < layers.length; li++) {
    const baseY = groundY - li * 4 * scale;
    const shift = -((li * 97) % tile) * scale;
    for (let x = shift; x < W; x += tw) {
      g.drawImage(caches.skyline[li][sky.vA], x, baseY - th, tw, th);
      if (sky.vB !== sky.vA && sky.t > 0) {
        g.globalAlpha = sky.t;
        g.drawImage(caches.skyline[li][sky.vB], x, baseY - th, tw, th);
        g.globalAlpha = 1;
      }
    }
  }
}

function buildShareCard(snap) {
  const C = CONFIG.share.card, col = CONFIG.colors, S = CONFIG.sky;
  const cv = document.createElement('canvas');
  cv.width = W * C.scale;
  cv.height = H * C.scale;
  const g = cv.getContext('2d');
  g.scale(C.scale, C.scale);
  const n = snap.tower.length;
  const night = snap.nightOn;
  const sky = skyState(snap.floors);
  const nightK = clamp01((snap.floors - S.starsFrom) / (S.starsFull - S.starsFrom));

  // sky
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, sky.top);
  gr.addColorStop(1, sky.bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  if (nightK > 0) {
    const r = seededRandom(snap.floors * 31 + 7);
    g.fillStyle = col.star;
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = nightK * (0.4 + r() * 0.6);
      g.beginPath();
      g.arc(r() * W, r() * 420, r() < 0.15 ? 1.3 : 0.7, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  const crop = n > C.fullMaxFloors;
  const from = crop ? n - C.cropFloors : 0;
  const regionTop = 108, groundY = 466;
  const bb = towerBounds(snap.tower, snap.angle, from);
  const fh = CONFIG.foundation.height, fw = CONFIG.foundation.width;
  let k, pivotX, pivotY;
  if (!crop) {
    const hgt = -bb.y0 + fh;
    const wid = Math.max(bb.x1, fw / 2) - Math.min(bb.x0, -fw / 2);
    k = Math.min(1.25, 320 / wid, (groundY - regionTop) / hgt);
    pivotX = W / 2 - k * (Math.max(bb.x1, fw / 2) + Math.min(bb.x0, -fw / 2)) / 2;
    pivotY = groundY - k * fh;
  } else {
    k = Math.min(1.25, 250 / (bb.x1 - bb.x0), (groundY - 10 - regionTop) / (bb.y1 - bb.y0));
    const side = snap.angle >= 0 ? 1 : -1; // leave room for the inset on the other side
    pivotX = W / 2 + side * 30 - k * (bb.x0 + bb.x1) / 2;
    pivotY = regionTop - k * bb.y0;
  }
  const pr = Math.max(1, k * C.scale);
  const memo = new Map();

  if (!crop) {
    // skyline, ground, foundation, then the whole tower
    drawCardSkyline(g, sky, groundY, clamp(k * 1.2, 0.55, 1));
    g.fillStyle = mixColor(col.ground, col.groundNight, nightK);
    g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle = mixColor(col.groundEdge, col.groundNight, nightK * 0.7);
    g.fillRect(0, groundY, W, 4);
    const fx = pivotX - k * fw / 2;
    g.fillStyle = col.foundation;
    g.fillRect(fx, pivotY, k * fw, k * fh);
    g.lineWidth = 1.5;
    g.strokeStyle = col.ink;
    g.strokeRect(fx, pivotY, k * fw, k * fh);
    drawCardTower(g, snap, pivotX, pivotY, k, 0, night, pr, memo);
  } else {
    // a few clouds high up, the top floors, faded towards the ground
    const insetLeft = snap.angle >= 0; // see drawCardInset
    for (let i = 0; i < 3; i++) {
      const cl = caches.clouds[i % caches.clouds.length];
      if (!cl) break;
      const cx = [20, 230, 120][i], cy = [140, 210, 330][i];
      if (insetLeft ? cx < 100 : cx + cl.w * 0.9 > W - 100) continue; // keep clear of the inset
      g.globalAlpha = lerp(0.9, 0.25, nightK);
      g.drawImage(cl.img, cx, cy, cl.w * 0.9, cl.h * 0.9);
    }
    g.globalAlpha = 1;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, groundY);
    g.clip();
    drawCardTower(g, snap, pivotX, pivotY, k, Math.max(0, from - 2), night, pr, memo);
    g.restore();
    const fade = g.createLinearGradient(0, groundY - 80, 0, groundY);
    const b = hexToRgb(sky.bottom.startsWith('#') ? sky.bottom : '#000000');
    fade.addColorStop(0, sky.bottom.startsWith('#') ? `rgba(${b[0]},${b[1]},${b[2]},0)` : sky.bottom.replace('rgb(', 'rgba(').replace(')', ',0)'));
    fade.addColorStop(1, sky.bottom);
    g.fillStyle = fade;
    g.fillRect(0, groundY - 80, W, 80 + (H - groundY));
    drawCardInset(g, snap, nightK);
  }

  // title
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const dark = nightK > 0.35 || sky.vA >= 1 && sky.t > 0.6; // light text on dusk / night skies
  const fg = dark ? col.nightText : col.ink;
  const outline = dark ? col.nightOutline : col.light;
  cardText(g, TEXT.title, W / 2, 46, 32, fg, outline, 7);
  cardText(g, snap.reason === 'collapse' ? TEXT.overCollapse : TEXT.overLives, W / 2, 80, 16, fg, outline, 5);

  // info panel
  roundRectPath(g, 24, 480, 312, 146, 16);
  g.fillStyle = 'rgba(255, 253, 247, 0.94)';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = col.ink;
  g.stroke();
  g.fillStyle = col.ink;
  const num = String(snap.floors);
  g.font = font(50);
  const nw = g.measureText(num).width;
  g.font = font(20);
  const lw = g.measureText(' ' + TEXT.floorsShort).width;
  const x0 = W / 2 - (nw + lw) / 2;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  cardText(g, num, x0, 536, 50, col.ink);
  cardText(g, ' ' + TEXT.floorsShort, x0 + nw, 536, 20, col.ink);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  cardText(g, `${TEXT.score}: ${snap.score}`, W / 2, 560, 19, col.ink);
  const order = ['elite', 'teyze', 'family', 'student'];
  const parts = order.filter((t) => snap.tenants[t] > 0).map((t) => `${snap.tenants[t]} ${TEXT.tenantNames[t]}`);
  if (parts.length) cardText(g, parts.join(' · '), W / 2, 584, 13, mixColor(col.ink, '#FFFFFF', 0.3));
  cardText(g, CONFIG.share.url, W / 2, 608, 13, col.button);

  if (snap.newRecord) {
    g.save();
    g.translate(282, 484);
    g.rotate(0.14);
    roundRectPath(g, -52, -15, 104, 30, 15);
    g.fillStyle = col.record;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = col.ink;
    g.stroke();
    cardText(g, TEXT.newRecord, 0, 1, 14, col.buttonText);
    g.restore();
  }
  return cv;
}

// Full-height silhouette next to a cropped tall tower
function drawCardInset(g, snap, nightK) {
  const col = CONFIG.colors;
  const side = snap.angle >= 0 ? -1 : 1;
  const bw = 74, bh = 250, bx = side < 0 ? 14 : W - 14 - bw, by = 150;
  roundRectPath(g, bx, by, bw, bh, 10);
  g.fillStyle = nightK > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.5)';
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = mixColor(col.ink, col.nightText, nightK);
  g.stroke();
  const bb = towerBounds(snap.tower, snap.angle, 0);
  const fw = CONFIG.foundation.width;
  const wid = Math.max(bb.x1, fw / 2) - Math.min(bb.x0, -fw / 2);
  const k = Math.min((bw - 12) / wid, (bh - 34) / -bb.y0);
  const gy = by + bh - 20;
  const px = bx + bw / 2 - k * (Math.max(bb.x1, fw / 2) + Math.min(bb.x0, -fw / 2)) / 2;
  g.fillStyle = mixColor(col.groundEdge, col.groundNight, nightK);
  g.fillRect(bx + 6, gy, bw - 12, 2);
  g.save();
  g.translate(px, gy);
  g.scale(k, k);
  g.rotate(snap.angle);
  for (let i = 0; i < snap.tower.length; i++) {
    const b = snap.tower[i];
    g.fillStyle = b.era === 'kacak' && !b.legal ? col.briket : b.color;
    g.fillRect(b.cx - b.width / 2, -(i + 1) * BH, b.width, BH + 0.5);
  }
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  cardText(g, TEXT.fullHeight, bx + bw / 2, by + bh - 9, 10, nightK > 0.5 ? col.nightText : col.ink);
}

// ---------------------------------------------------------------------
// Video: replay the state log into an offscreen canvas and record it
// ---------------------------------------------------------------------
function pickVideoMime(withAudio) {
  if (typeof window.MediaRecorder !== 'function') return null;
  const list = withAudio
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* ignore */ }
  }
  return null;
}

function drawReplayScene(sample, title) {
  const sky = drawSky();
  const s = view.dpr * view.scale;
  let sx = 0, sy = 0;
  if (game.shake > 0) { sx = rand(-1, 1) * game.shake; sy = rand(-1, 1) * game.shake; }
  ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
  drawStars();
  drawClouds();
  drawSkyline(sky);
  drawBirds();
  drawMast();
  drawTower();
  drawMovingBlocks();
  drawGround();
  drawParticles();
  drawCrane();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const k = nightFactor();
  const fg = mixColor(CONFIG.colors.ink, CONFIG.colors.nightText, k);
  const outline = mixColor(CONFIG.colors.light, CONFIG.colors.nightOutline, k);
  drawPopups(fg, outline);
  drawHUD(fg, outline);
  if (title > 0) {
    ctx.globalAlpha = title;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(36);
    outlinedText(TEXT.overCollapse, W / 2, 300, fg, outline, 7);
    ctx.globalAlpha = 1;
  }
  // address band
  ctx.fillStyle = 'rgba(27, 29, 46, 0.72)';
  ctx.fillRect(0, 612, W, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(11);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${TEXT.title} · ${CONFIG.share.url}`, W / 2, 626);
}

// ---------------------------------------------------------------------
// Share controller
// ---------------------------------------------------------------------
const Share = {
  snap: null,
  card: null,       // canvas
  cardFile: null,   // File (pre-rendered blob)
  cardBusy: false,
  toast: null,
  ui: null,         // video overlay: null | 'recording' | 'ready' | 'failed'
  rec: null,
  videoFile: null,
  resizePending: false,

  get recording() { return this.ui === 'recording'; },

  onGameStart() {
    Replay.reset();
    this.snap = null;
    this.card = null;
    this.cardFile = null;
    this.videoFile = null;
    this.toast = null;
  },

  // called from endGame(): the tower is still standing
  onGameEnd(reason) {
    if (reason === 'collapse') Replay.markCollapse();
    this.snap = {
      tower: game.tower.slice(), angle: game.angle, floors: game.floors, score: game.score,
      newRecord: game.score > game.best, reason, nightOn: game.nightOn,
      tenants: Object.assign({}, game.tenantCounts),
    };
  },

  canShareImage() { return !!this.snap && this.snap.floors >= CONFIG.share.minFloors; },

  videoSupported() {
    if (Storage.get(CONFIG.storage.videoFail, '0') === '1') return false;
    if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false;
    return pickVideoMime(false) !== null;
  },
  canShareVideo() {
    return this.canShareImage() && this.snap.reason === 'collapse' && Replay.collapseAt !== null &&
      Replay.samples.length > 10 && this.videoSupported();
  },

  // per frame from the main loop (cheap unless there is work to do)
  update(dt) {
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t > 1.8) this.toast = null;
    }
    if (game.state === State.GAME_OVER && !this.card && this.canShareImage() &&
        game.over.timer >= CONFIG.share.card.prepareAt) this.prepareCard();
  },

  prepareCard() {
    if (this.card) return;
    this.card = buildShareCard(this.snap);
    const name = `${CONFIG.share.fileName}-${this.snap.floors}-kat.png`;
    if (this.card.toBlob) {
      this.cardBusy = true;
      const card = this.card;
      card.toBlob((blob) => {
        this.cardBusy = false;
        if (blob && this.card === card) this.cardFile = new File([blob], name, { type: 'image/png' });
      }, 'image/png');
    }
  },

  // synchronous fallback when the tap comes before toBlob finished
  cardFileNow() {
    if (this.cardFile) return this.cardFile;
    this.prepareCard();
    const url = this.card.toDataURL('image/png');
    const bin = atob(url.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    this.cardFile = new File([bytes], `${CONFIG.share.fileName}-${this.snap.floors}-kat.png`, { type: 'image/png' });
    return this.cardFile;
  },

  // must run inside a user-activation event (touchend / pointerup / keydown)
  shareFile(file, savedText) {
    const data = { files: [file], title: TEXT.title, text: `${TEXT.shareText(this.snap.floors)} ${CONFIG.share.url}` };
    let ok = false;
    try { ok = !!navigator.share && !!navigator.canShare && navigator.canShare({ files: [file] }); } catch (e) { ok = false; }
    if (ok) {
      navigator.share(data).catch((err) => {
        if (err && err.name === 'AbortError') return; // the player closed the share sheet
        this.download(file, savedText);
      });
    } else {
      this.download(file, savedText);
    }
  },

  download(file, savedText) {
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      this.showToast(savedText);
    } catch (e) { /* nothing else we can do */ }
  },

  shareImage() {
    if (!this.canShareImage()) return;
    this.shareFile(this.cardFileNow(), TEXT.imageSaved);
  },

  showToast(text) { this.toast = { text, t: 0 }; },

  drawToast(y) {
    const t = this.toast;
    if (!t) return;
    y = y || 588;
    ctx.globalAlpha = t.t < 1.4 ? 1 : Math.max(0, 1 - (t.t - 1.4) / 0.4);
    ctx.font = font(15);
    const w = ctx.measureText(t.text).width + 32;
    roundRectPath(ctx, W / 2 - w / 2, y, w, 32, 16);
    ctx.fillStyle = CONFIG.colors.ink;
    ctx.fill();
    ctx.fillStyle = CONFIG.colors.light;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.text, W / 2, y + 17);
    ctx.globalAlpha = 1;
  },

  // ----- video -----
  buildTimeline() {
    const V = CONFIG.share.video, S = Replay.samples, ca = Replay.collapseAt;
    const t0 = Math.max(S[0].t, ca - V.preRoll), t1 = S[S.length - 1].t;
    const frames = [];
    let tau = t0, idx = 0, si = 0;
    const sounds = Replay.sounds;
    while (si < sounds.length && sounds[si].t < t0) si++;
    while (tau <= t1) {
      while (idx + 1 < S.length && S[idx + 1].t <= tau) idx++;
      const fire = [];
      while (si < sounds.length && sounds[si].t <= tau) fire.push(sounds[si++]);
      const title = clamp01((tau - ca - V.titleAt) / 0.3);
      frames.push({ idx, fire, title });
      const speed = tau >= ca && tau < ca + V.slowLen ? V.slowSpeed : 1;
      tau += speed / V.fps;
    }
    const cardFrames = Math.round(V.endCard * V.fps);
    return { frames, total: frames.length + cardFrames };
  },

  startVideo() {
    if (!this.canShareVideo() || this.ui) return;
    if (this.videoFile) { this.ui = 'ready'; return; }
    const V = CONFIG.share.video;
    Replay.frozen = true;
    this.prepareCard();

    const cv = document.createElement('canvas');
    cv.width = V.width;
    cv.height = V.height;
    const rctx = cv.getContext('2d');
    const recView = { dpr: 1, scale: V.width / W, offX: 0, offY: 0, x0: 0, x1: W, y0: 0, y1: H, version: -(Date.now() % 1e9) };
    const mainView = Object.assign({}, view);
    const mainCaches = Object.assign({}, caches);
    // static caches for the 9:16 recording view
    Object.assign(view, recView);
    buildStaticCaches();
    const recCaches = Object.assign({}, caches);
    Object.assign(view, mainView);
    Object.assign(caches, mainCaches);

    let audioDest = null;
    if (Sound.ctx && !Sound.muted && Sound.master && Sound.ctx.createMediaStreamDestination) {
      try {
        audioDest = Sound.ctx.createMediaStreamDestination();
        Sound.master.connect(audioDest);
      } catch (e) { audioDest = null; }
    }
    const mime = pickVideoMime(!!audioDest);
    const opts = { videoBitsPerSecond: V.bitrate };
    if (mime) opts.mimeType = mime;
    let stream, warm;
    try {
      stream = cv.captureStream(V.fps);
      if (audioDest) audioDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      // Warm-up: the first recording in a session can drop ~2 s of frames while
      // the encoder starts. A throwaway recorder absorbs that, then the real one starts.
      warm = new MediaRecorder(stream, opts);
    } catch (e) {
      this.cleanupAudio(audioDest);
      this.fail(true);
      return;
    }
    const rec = {
      cv, rctx, recView, mainView, recCaches, mainCaches, stream, audioDest, mime, opts,
      recorder: warm, warm: true, warmReady: false, warmStart: performance.now(),
      timeline: this.buildTimeline(), drawn: -1, start: 0, cancelled: false, error: false, stopping: false,
    };
    warm.ondataavailable = (e) => { if (e.data && e.data.size) rec.warmReady = true; };
    this.rec = rec;
    this.ui = 'recording';
    this.drawRecFrame(0, true); // never start on an empty canvas
    try { warm.start(100); } catch (e) { this.endRecording(); this.fail(true); }
  },

  // warm-up done: start the real recorder and the replay clock
  beginRecording() {
    const rec = this.rec;
    try { rec.recorder.ondataavailable = null; rec.recorder.stop(); } catch (e) { /* ignore */ }
    let recorder;
    try { recorder = new MediaRecorder(rec.stream, rec.opts); } catch (e) { this.endRecording(); this.fail(true); return; }
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { rec.error = true; };
    recorder.onstop = () => this.finishVideo(rec, chunks, recorder.mimeType || rec.mime || 'video/mp4');
    rec.recorder = recorder;
    rec.warm = false;
    this.drawRecFrame(0);
    rec.drawn = 0;
    try { recorder.start(250); } catch (e) { this.endRecording(); this.fail(true); return; }
    rec.start = performance.now();
  },

  // draw video frame i into the recording canvas (everything swapped and restored)
  drawRecFrame(i, silent) {
    const r = this.rec, tl = r.timeline;
    Object.assign(view, r.recView);
    Object.assign(caches, r.recCaches);
    ctx = r.rctx;
    try {
      if (i < tl.frames.length) {
        const fr = tl.frames[i];
        const saved = Replay.apply(Replay.samples[fr.idx]);
        try { drawReplayScene(Replay.samples[fr.idx], fr.title); } finally { Replay.restore(saved); }
        if (!silent) {
          Replay.replaying = true;
          try { for (const ev of fr.fire) Sound[ev.name].apply(Sound, ev.args); } finally { Replay.replaying = false; }
        }
      } else {
        // end card: the share picture fades in over the last scene
        const k = clamp01((i - tl.frames.length) / (CONFIG.share.video.fps * 0.3));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = k;
        ctx.drawImage(this.card, 0, 0, r.cv.width, r.cv.height);
        ctx.globalAlpha = 1;
      }
    } finally {
      ctx = mainCtx;
      Object.assign(view, r.mainView);
      Object.assign(caches, r.mainCaches);
    }
  },

  // main-loop hook while the overlay is open: advance the recording, draw the overlay
  renderUI() {
    const r = this.rec;
    if (this.ui === 'recording' && r && r.warm) {
      const waited = performance.now() - r.warmStart;
      if ((r.warmReady && waited > 300) || waited > 3000) this.beginRecording();
      else this.drawRecFrame(0, true); // keep frames flowing into the encoder
    } else if (this.ui === 'recording' && r && !r.stopping) {
      const tl = r.timeline;
      const target = Math.min(tl.total - 1, Math.floor((performance.now() - r.start) / 1000 * CONFIG.share.video.fps));
      if (target > r.drawn) {
        // sounds of skipped frames still play
        for (let i = r.drawn + 1; i < target; i++) {
          if (i < tl.frames.length) {
            Replay.replaying = true;
            try { for (const ev of tl.frames[i].fire) Sound[ev.name].apply(Sound, ev.args); } finally { Replay.replaying = false; }
          }
        }
        this.drawRecFrame(target);
        r.drawn = target;
      }
      if (r.drawn >= tl.total - 1) {
        r.stopping = true;
        setTimeout(() => this.endRecording(), 150); // let the last frame reach the encoder
      }
    }
    this.drawOverlay();
  },

  endRecording() {
    const r = this.rec;
    if (!r) return;
    try { if (r.recorder.state !== 'inactive') r.recorder.stop(); } catch (e) { /* ignore */ }
    try { r.stream.getTracks().forEach((tr) => tr.stop()); } catch (e) { /* ignore */ }
    this.cleanupAudio(r.audioDest);
    // safety net: some browsers never fire onstop
    setTimeout(() => {
      if (this.rec === r && !r.cancelled) this.fail(true);
    }, 5000);
  },

  releaseRec() {
    this.rec = null;
    if (this.resizePending) { this.resizePending = false; resize(); }
  },

  cleanupAudio(dest) {
    if (dest && Sound.master) { try { Sound.master.disconnect(dest); } catch (e) { /* ignore */ } }
  },

  cancelVideo() {
    const r = this.rec;
    if (r) {
      r.cancelled = true;
      Sound.stopQuake();
      this.endRecording();
      this.releaseRec();
    }
    this.closeOverlay();
  },

  finishVideo(r, chunks, mime) {
    if (r.cancelled || this.rec !== r) return;
    this.releaseRec();
    const type = mime.split(';')[0] || 'video/mp4';
    const blob = new Blob(chunks, { type });
    if (r.error || blob.size < CONFIG.share.video.minBytes) { this.fail(true); return; }
    const ext = type.indexOf('webm') >= 0 ? 'webm' : 'mp4';
    const file = new File([blob], `${CONFIG.share.fileName}-${this.snap.floors}-kat.${ext}`, { type });
    // Some Safari builds produce 0-second files: check the duration when possible
    this.checkDuration(file, (good) => {
      if (this.ui !== 'recording') return;
      if (!good) { this.fail(true); return; }
      this.videoFile = file;
      this.ui = 'ready';
    });
  },

  checkDuration(file, done) {
    let finished = false;
    const end = (ok) => { if (finished) return; finished = true; done(ok); };
    try {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'metadata';
      v.setAttribute('playsinline', '');
      const url = URL.createObjectURL(file);
      v.onloadedmetadata = () => {
        const d = v.duration;
        URL.revokeObjectURL(url);
        end(!(isFinite(d) && d < 1)); // WebM reports Infinity: accept
      };
      v.onerror = () => { URL.revokeObjectURL(url); end(true); }; // cannot tell: trust the size check
      v.src = url;
      setTimeout(() => end(true), 2500);
    } catch (e) { end(true); }
  },

  fail(technical) {
    if (technical) Storage.set(CONFIG.storage.videoFail, '1');
    if (this.rec) this.releaseRec();
    this.ui = 'failed';
  },

  closeOverlay() { this.ui = null; },

  // which share button (if any) is under a game-over tap
  hit(x, y) {
    if (!this.canShareImage()) return null;
    if (this.canShareVideo()) {
      if (inRect(x, y, GO_SHARE_BUTTON)) return 'image';
      if (inRect(x, y, GO_VIDEO_BUTTON)) return 'video';
    } else if (inRect(x, y, GO_SHARE_WIDE)) return 'image';
    return null;
  },

  shareVideo() {
    if (this.videoFile) this.shareFile(this.videoFile, TEXT.videoSaved);
  },

  // taps on the overlay (from a user-activation event)
  overlayTap(x, y) {
    if (this.ui === 'recording') {
      if (inRect(x, y, VIDEO_MAIN_BUTTON)) this.cancelVideo();
    } else if (this.ui === 'ready') {
      if (inRect(x, y, VIDEO_MAIN_BUTTON)) this.shareVideo();
      else if (inRect(x, y, VIDEO_CLOSE_BUTTON)) this.closeOverlay();
    } else if (this.ui === 'failed') {
      if (inRect(x, y, VIDEO_MAIN_BUTTON) || inRect(x, y, VIDEO_CLOSE_BUTTON)) this.closeOverlay();
    }
  },

  drawOverlay() {
    const col = CONFIG.colors;
    const s = view.dpr * view.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = col.videoBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, view.dpr * view.offX, view.dpr * view.offY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col.light;
    ctx.font = font(22);
    const title = this.ui === 'recording' ? TEXT.videoMaking : this.ui === 'ready' ? TEXT.videoReady : TEXT.videoFailed;
    ctx.fillText(title, W / 2, 56);

    const px = 72, py = 86, pw = 216, ph = 384;
    if (this.ui !== 'failed' && (this.rec || this.card)) {
      const src = this.rec ? this.rec.cv : this.card;
      ctx.drawImage(src, px, py, pw, ph);
      ctx.lineWidth = 2;
      ctx.strokeStyle = col.light;
      ctx.strokeRect(px, py, pw, ph);
    } else if (this.ui === 'failed') {
      ctx.font = font(15);
      ctx.fillText(TEXT.videoFailedHint, W / 2, 260);
    }
    if (this.ui === 'recording' && this.rec) {
      const k = clamp01(this.rec.drawn / Math.max(1, this.rec.timeline.total - 1));
      roundRectPath(ctx, px, 484, pw, 10, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      if (k > 0) {
        roundRectPath(ctx, px, 484, Math.max(10, pw * k), 10, 5);
        ctx.fillStyle = col.button3;
        ctx.fill();
      }
      cityButton(VIDEO_MAIN_BUTTON, TEXT.cancel, col.button);
    } else if (this.ui === 'ready') {
      cityButton(VIDEO_MAIN_BUTTON, TEXT.shareVideo, col.button3);
      cityButton(VIDEO_CLOSE_BUTTON, TEXT.close, col.button2);
    } else {
      cityButton(VIDEO_MAIN_BUTTON, TEXT.close, col.button2);
    }
    if (this.toast) this.drawToast(474);
  },
};
