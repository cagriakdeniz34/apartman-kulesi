"use strict";

// =====================================================================
// Crane: pendulum swing, drop, and drawing (flat-top tower crane)
// The crane lives in screen space; it never scrolls.
// =====================================================================

function updateSwing(dt) {
  const s = game.swing, c = CONFIG.crane, d = game.diff;
  const speed = c.swingSpeed * d.swingSpeedMul;
  s.phase += speed * dt; // phase accumulation keeps speed changes smooth
  s.amp += (d.maxAngleDeg * DEG - s.amp) * (1 - Math.exp(-c.amplitudeRate * dt));
  s.wind += (s.windTarget - s.wind) * (1 - Math.exp(-CONFIG.difficulty.windRate * dt));
  s.angle = s.wind + s.amp * Math.sin(s.phase);
  s.angVel = s.amp * speed * Math.cos(s.phase);
}

// Rope end (hook bowl) + hanging block pose, screen space
function hangingPose() {
  const c = CONFIG.crane;
  const a = game.swing.angle;
  const L = game.crane.ropeLen;
  const ex = c.pivotX + L * Math.sin(a);
  const ey = PIVOT_Y_SCREEN + L * Math.cos(a);
  const r = a * c.blockRotationFactor;
  const d = c.hookOffset + BH / 2;
  return { a, ex, ey, r, cx: ex + Math.sin(r) * d, cy: ey + Math.cos(r) * d, rot: -r };
}

function requestSpawn(delay) {
  const cr = game.crane;
  cr.block = null;
  cr.pending = true;
  cr.spawnTimer = delay;
}

function updateCrane(dt) {
  const cr = game.crane, c = CONFIG.crane;
  if (cr.pending && game.state === State.PLAYING) {
    cr.spawnTimer -= dt;
    if (cr.spawnTimer <= 0) {
      cr.pending = false;
      cr.block = makeBlock(chooseBlockType());
      cr.fadeT = 0;
    }
  }
  if (cr.block && cr.fadeT < 1) cr.fadeT = Math.min(1, cr.fadeT + dt / c.fadeInTime);
  const target = cr.block ? c.ropeLength : c.ropeRetractedLength;
  cr.ropeLen += (target - cr.ropeLen) * (1 - Math.exp(-c.ropeRate * dt));

  // the hook turns a little against the swing and wobbles
  const tw = clamp(-game.swing.angVel * c.hookTwistFactor, -c.hookTwistMax, c.hookTwistMax) +
    c.hookWobble * Math.sin(game.time * 3.1);
  cr.hookTwist += (tw - cr.hookTwist) * (1 - Math.exp(-6 * dt));
}

function tryDrop() {
  const cr = game.crane;
  if (!cr.block || cr.fadeT < 1 || game.falling) return; // ignore taps while a block falls
  const p = hangingPose();
  game.falling = {
    block: cr.block,
    x: toWorldX(p.cx),
    y: toWorldY(p.cy),
    vx: cr.ropeLen * Math.cos(p.a) * game.swing.angVel,
    vy: 0,
    rot: p.rot,
  };
  cr.block = null;
}

// =====================================================================
// Drawing helpers: shaded steel members
// =====================================================================

// A tube: dark shadow below-right, yellow body, light highlight above-left
function drawMember(g, x1, y1, x2, y2, w) {
  const col = CONFIG.colors;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1 + 0.5, y1 + 0.7); g.lineTo(x2 + 0.5, y2 + 0.7);
  g.strokeStyle = col.craneShadow; g.lineWidth = w + 0.8; g.stroke();
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.strokeStyle = col.craneYellow; g.lineWidth = w; g.stroke();
  g.beginPath(); g.moveTo(x1 - w * 0.18, y1 - w * 0.22); g.lineTo(x2 - w * 0.18, y2 - w * 0.22);
  g.strokeStyle = col.craneHighlight; g.lineWidth = Math.max(0.5, w * 0.32); g.stroke();
  g.lineCap = 'butt';
}

// Chord / plate with a light and a dark side
function drawChord(g, x, y, w, h, vertical) {
  const col = CONFIG.colors;
  const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, col.craneHighlight);
  gr.addColorStop(0.35, col.craneYellow);
  gr.addColorStop(1, col.craneShadow);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.lineWidth = 0.7;
  g.strokeStyle = col.craneShadow;
  g.strokeRect(x, y, w, h);
}

function steelGradient(g, x0, y0, x1, y1, light, dark) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, light);
  gr.addColorStop(1, dark);
  return gr;
}

// =====================================================================
// Static crane parts (cached): jib, counter-jib, counterweight, cabin
// =====================================================================
function drawCraneStatic(g) {
  const c = CONFIG.crane, col = CONFIG.colors;
  const top = c.jibTop, bot = c.jibTop + c.jibHeight;
  const xs = c.backEndX, xe = c.tipX;

  // jib lattice: verticals + cross bracing behind the chords
  for (let x = xs; x < xe; x += c.panelWidth) {
    const x2 = Math.min(x + c.panelWidth, xe);
    drawMember(g, x, top + 2, x2, bot - 2, 1.2);
    drawMember(g, x, bot - 2, x2, top + 2, 1.2);
    drawMember(g, x, top + 2, x, bot - 2, 1.4);
  }
  drawMember(g, xe, top + 2, xe, bot - 2, 1.4);
  drawChord(g, xs, top, xe - xs, 3.5, false);
  drawChord(g, xs, bot - 3.5, xe - xs, 3.5, false);

  // jib tip plate and back end plate
  g.fillStyle = steelGradient(g, xe - 2, 0, xe + 3, 0, col.craneSteel, col.craneDark);
  g.fillRect(xe - 1, top - 1, 4, c.jibHeight + 2);
  g.fillStyle = steelGradient(g, xs, 0, xs + 4, 0, col.craneSteel, col.craneDark);
  g.fillRect(xs - 1, top - 1, 4, c.jibHeight + 2);

  // slewing unit on top of the mast
  const mx = c.mastX, mw = c.mastWidth;
  g.fillStyle = steelGradient(g, 0, bot, 0, bot + 8, col.craneSteel, col.craneDark);
  g.fillRect(mx - mw / 2 - 4, bot, mw + 8, 8);
  g.lineWidth = 1;
  g.strokeStyle = col.ink;
  g.strokeRect(mx - mw / 2 - 4, bot, mw + 8, 8);
  g.fillStyle = col.craneDark;
  g.fillRect(mx - mw / 2 - 2, bot + 8, mw + 4, 2);

  // counterweight slabs on the counter-jib
  const cw = c.counterweight;
  const cwTop = top - cw.h;
  const slab = cw.w / 3;
  for (let i = 0; i < 3; i++) {
    const x = cw.x + i * slab;
    g.fillStyle = steelGradient(g, x, cwTop, x + slab, top, col.concrete, col.concreteDark);
    g.fillRect(x, cwTop, slab, cw.h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x + 0.5, cwTop + 0.5, 1.2, cw.h - 1);
    g.lineWidth = 0.9;
    g.strokeStyle = col.ink;
    g.strokeRect(x, cwTop, slab, cw.h);
  }
  hazardRect(g, cw.x, cwTop + cw.h - 6, cw.w, 6, 4);

  // operator cabin on the jib
  const cb = c.cabin;
  const cy = top - cb.h;
  g.fillStyle = steelGradient(g, cb.x, cy, cb.x + cb.w, top, col.craneLight, col.craneShadow);
  roundRectPath(g, cb.x, cy, cb.w, cb.h, 3);
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = col.ink;
  g.stroke();
  // roof
  g.fillStyle = steelGradient(g, 0, cy - 3, 0, cy + 1, col.craneSteel, col.craneDark);
  g.fillRect(cb.x - 1.5, cy - 2.5, cb.w + 3, 3.5);
  // window with operator silhouette
  const wx = cb.x + cb.w - 16, wy = cy + 3.5, ww = 13, wh = 10;
  const glass = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  glass.addColorStop(0, '#CFEAF6');
  glass.addColorStop(1, '#6FA8C7');
  g.fillStyle = glass;
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = col.operator;
  g.beginPath();
  g.arc(wx + 6, wy + 4.2, 2.1, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(wx + 2, wy + wh);
  g.quadraticCurveTo(wx + 6, wy + 5, wx + 10, wy + wh);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(wx + ww - 4, wy + 1);
  g.lineTo(wx + ww - 1, wy + 4);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = col.ink;
  g.strokeRect(wx, wy, ww, wh);
  // small side window
  g.fillStyle = '#8DBCD4';
  g.fillRect(cb.x + 3, cy + 4, 5, 7);
  g.strokeRect(cb.x + 3, cy + 4, 5, 7);

  // trolley
  const tx = c.pivotX;
  hazardRect(g, tx - 15, bot - 1, 30, c.trolleyDrop - 1, 4);
  for (const wxp of [tx - 9, tx + 9]) {
    g.fillStyle = col.craneDark;
    g.beginPath();
    g.arc(wxp, bot - 2, 2.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col.craneSteel;
    g.beginPath();
    g.arc(wxp, bot - 2, 1, 0, Math.PI * 2);
    g.fill();
  }
  // trolley sheaves (where the ropes leave)
  g.fillStyle = col.craneDark;
  g.beginPath();
  g.arc(tx - 3.5, PIVOT_Y_SCREEN - 1, 2.2, 0, Math.PI * 2);
  g.arc(tx + 3.5, PIVOT_Y_SCREEN - 1, 2.2, 0, Math.PI * 2);
  g.fill();

  // warning light housing at the tip (the lamp itself is drawn per frame)
  g.fillStyle = col.craneDark;
  g.fillRect(xe - 2, top - 5, 5, 5);
}

// One repeating tile of the lattice mast
function drawMastTile(g, w, panel, panels) {
  const pad = 2;
  const l = pad, r = pad + w;
  for (let i = 0; i < panels; i++) {
    const y0 = i * panel, y1 = y0 + panel;
    drawMember(g, l + 2, y0 + 1, r - 2, y1 - 1, 1.3);
    drawMember(g, r - 2, y0 + 1, l + 2, y1 - 1, 1.3);
    drawMember(g, l + 2, y0, r - 2, y0, 1.4);
  }
  drawChord(g, l, 0, 4, panel * panels, true);
  drawChord(g, r - 4, 0, 4, panel * panels, true);
  // darker right side for depth
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(r - 4, 0, 4, panel * panels);
}

function buildCraneCaches() {
  const c = CONFIG.crane;
  const vw = view.x1 - view.x0;
  const h = c.jibTop + c.jibHeight + 12;
  caches.crane = makeCache(vw, h, (g) => {
    g.translate(-view.x0, 0);
    drawCraneStatic(g);
  });
  caches.craneH = h;
  const panels = 4;
  caches.mastTileH = c.mastPanel * panels;
  caches.mastTileW = c.mastWidth + 4;
  caches.mast = makeCache(caches.mastTileW, caches.mastTileH, (g) => drawMastTile(g, c.mastWidth, c.mastPanel, panels));
}

// =====================================================================
// Per-frame crane drawing
// =====================================================================

// Mast goes from the slewing unit to the bottom of the screen (behind the tower)
function drawMast() {
  if (!caches.mast) return;
  const c = CONFIG.crane;
  const x = c.mastX - caches.mastTileW / 2;
  const y0 = c.jibTop + c.jibHeight + 10;
  for (let y = y0; y < view.y1 + 12; y += caches.mastTileH) { // margin for screen shake
    ctx.drawImage(caches.mast, x, y, caches.mastTileW, caches.mastTileH);
  }
}

function drawWarningLight() {
  const c = CONFIG.crane, col = CONFIG.colors;
  const x = c.tipX + 0.5, y = c.jibTop - 7;
  const night = nightFactor();
  const on = night > 0.3 && mod(game.time, c.lightBlinkPeriod) < c.lightBlinkPeriod * 0.45;
  if (on) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
    glow.addColorStop(0, 'rgba(255, 59, 48, 0.65)');
    glow.addColorStop(1, 'rgba(255, 59, 48, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 14, y - 14, 28, 28);
  }
  ctx.fillStyle = night > 0.3 ? (on ? col.warnLight : col.warnLightOff) : col.warnLightDay;
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(x - 0.8, y - 0.9, 0.8, 0, Math.PI * 2);
  ctx.fill();
}

// Rope-frame point (qx along rope-normal, qy along the rope) -> screen
function ropeToScreen(p, qx, qy) {
  const ca = Math.cos(p.a), sa = Math.sin(p.a);
  return { x: p.ex + qx * ca + qy * sa, y: p.ey - qx * sa + qy * ca };
}

function drawHookGear(p) {
  const c = CONFIG.crane, col = CONFIG.colors;
  const twist = game.crane.hookTwist;

  // hook bowl point, after the twist around the swivel (0, -8)
  const ct = Math.cos(twist), st = Math.sin(twist);
  const bx = -3, by = 3 + 8; // bowl relative to swivel
  const bowl = ropeToScreen(p, bx * ct - by * st, -8 + bx * st + by * ct);

  // ropes from the trolley sheaves to the pulley block
  const ropeL = ropeToScreen(p, -3.5, -24), ropeR = ropeToScreen(p, 3.5, -24);
  ctx.strokeStyle = col.rope;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(c.pivotX - 3.5, PIVOT_Y_SCREEN);
  ctx.lineTo(ropeL.x, ropeL.y);
  ctx.moveTo(c.pivotX + 3.5, PIVOT_Y_SCREEN);
  ctx.lineTo(ropeR.x, ropeR.y);
  ctx.stroke();

  // slings from the hook to the lugs on the block top
  const blk = game.crane.block;
  if (blk) {
    const r = p.r;
    const tx = p.ex + Math.sin(r) * c.hookOffset, ty = p.ey + Math.cos(r) * c.hookOffset;
    const lug = Math.min(c.slingLugX, blk.width / 2 - 6);
    ctx.globalAlpha = game.crane.fadeT;
    ctx.strokeStyle = col.rope;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(bowl.x, bowl.y);
    ctx.lineTo(tx - lug * Math.cos(r), ty + lug * Math.sin(r));
    ctx.moveTo(bowl.x, bowl.y);
    ctx.lineTo(tx + lug * Math.cos(r), ty - lug * Math.sin(r));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(p.ex, p.ey);
  ctx.rotate(-p.a); // local +y = down the rope

  // pulley block: side plate, two sheaves, warning stripes
  ctx.fillStyle = steelGradient(ctx, -9, -26, 9, -12, col.craneLight, col.craneShadow);
  roundRectPath(ctx, -9, -26, 18, 14, 3);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = col.ink;
  ctx.stroke();
  for (const sx of [-3.5, 3.5]) {
    ctx.fillStyle = col.craneDark;
    ctx.beginPath();
    ctx.arc(sx, -21, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col.craneSteel;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = col.craneHighlight;
    ctx.beginPath();
    ctx.arc(sx, -21, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  hazardRect(ctx, -9, -16, 18, 4, 3);

  // swivel + hook (turns around the swivel)
  ctx.fillStyle = steelGradient(ctx, -2.5, 0, 2.5, 0, col.craneSteel, col.craneDark);
  ctx.fillRect(-2.5, -12, 5, 4);
  ctx.translate(0, -8);
  ctx.rotate(twist);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 7);
  ctx.arc(-3, 8, 3, 0, Math.PI, false);
  ctx.lineTo(-6, 6.5);
  ctx.strokeStyle = col.craneDark;
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.strokeStyle = col.craneSteel;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.5);
  ctx.lineTo(-0.6, 7);
  ctx.stroke();
  // safety latch
  ctx.strokeStyle = col.craneYellow;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, 6.5);
  ctx.lineTo(-0.5, 3.5);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.restore();
}

function drawWindFlag() {
  const s = game.swing;
  const strength = s.wind / (CONFIG.difficulty.windAngleDeg * DEG);
  if (Math.abs(strength) < 0.05) return;
  const c = CONFIG.crane;
  const x = c.flagX, y0 = c.jibTop, y1 = c.jibTop - 26;
  ctx.strokeStyle = CONFIG.colors.craneDark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  const len = 20 * Math.min(1, Math.abs(strength) + 0.2) * Math.sign(strength);
  const wave = Math.sin(game.time * 9) * 2;
  ctx.fillStyle = CONFIG.colors.button;
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.quadraticCurveTo(x + len * 0.5, y1 + 2 + wave, x + len, y1 + 5 + wave * 0.5);
  ctx.quadraticCurveTo(x + len * 0.5, y1 + 8 - wave, x, y1 + 11);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = CONFIG.colors.ink;
  ctx.stroke();
}

// Jib, hook and hanging block (in front of everything in the world)
function drawCrane() {
  if (caches.crane) ctx.drawImage(caches.crane, view.x0, 0, view.x1 - view.x0, caches.craneH);
  drawWarningLight();
  drawWindFlag();
  const p = hangingPose();
  drawHookGear(p);
  const blk = game.crane.block;
  if (blk) {
    drawBlockAt(blk, p.cx, p.cy, p.rot, game.crane.fadeT);
    if (blk.type === 'kacak') drawKacakTag(p, game.crane.fadeT);
  }
}

// Red paper tag tied to the corner of a hanging kaçak floor
function drawKacakTag(p, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.cx, p.cy);
  ctx.rotate(p.rot);
  ctx.translate(BW / 2 - 14, -BH / 2 - 2);
  ctx.rotate(0.12);
  roundRectPath(ctx, -17, -6, 34, 12, 3);
  ctx.fillStyle = CONFIG.colors.signRed;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = CONFIG.colors.ink;
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 8px ${CONFIG.ui.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(TEXT.kacakTag, 0, 0.5);
  ctx.restore();
}
