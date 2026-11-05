"use strict";

// =====================================================================
// Tower: floors, tilt, sway, landing, collapse, earthquake
// World space: y points up, ground surface at y = 0.
// =====================================================================

function difficultyAt(floors) {
  const d = { swingSpeedMul: 1, maxAngleDeg: CONFIG.crane.maxAngleDeg, towerSway: false, wind: false, night: false };
  for (const row of CONFIG.difficulty.table) {
    if (floors < row.floors) break;
    if (row.swingSpeedMul) d.swingSpeedMul *= row.swingSpeedMul;
    if (row.maxAngleDeg) d.maxAngleDeg = row.maxAngleDeg;
    if (row.towerSway) d.towerSway = true;
    if (row.wind) d.wind = true;
    if (row.night) d.night = true;
  }
  return d;
}

// ---------------------------------------------------------------------
// Blocks: shape + details are rolled once at creation
// ---------------------------------------------------------------------
function chooseBlockType() {
  const S = CONFIG.shapes;
  const n = game.floors + 1; // floor number this block would become
  if (n % S.roof.every === 0) return 'roof';
  const r = Math.random();
  if (n >= S.narrow.minFloors && r < S.narrow.chance) return 'narrow';
  if (n >= S.balcony.minFloors && r < S.narrow.chance + S.balcony.chance) return 'balcony';
  return 'normal';
}

function rollWindow() {
  const b = CONFIG.block;
  const x = Math.random();
  const type = x < b.curtainChance ? 'curtain' : x < b.curtainChance + b.litChance ? 'lit' : 'glass';
  return {
    type,
    curtain: pick(CONFIG.colors.curtains),
    nightLit: type === 'lit' || Math.random() < b.nightLitChance,
  };
}

function rollItem() {
  const r = Math.random();
  return r < 0.35 ? 'plant' : r < 0.6 ? 'laundry' : null;
}

function rollClothes() {
  const clothes = [];
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) clothes.push({ color: pick(CONFIG.colors.laundry), w: rand(4, 7), h: rand(5, 8) });
  return clothes;
}

function makeBlock(type) {
  type = type || 'normal';
  const b = CONFIG.block, S = CONFIG.shapes;
  const pal = CONFIG.colors.blocks;
  const blk = {
    type,
    color: pal[(game.blockSeq++) % pal.length],
    width: type === 'narrow' ? Math.round(BW * S.narrow.widthRatio) : BW,
    cols: type === 'narrow' ? S.narrow.windowCols : b.windowCols,
    rows: type === 'roof' ? S.roof.windowRowsRatio : b.windowRowsRatio,
    windows: [],
    dormers: [],
    balcony: null,      // small front balcony
    sides: null,        // side balconies (balcony floor)
    cx: 0,
    index: -1,
    cache: null,
    cacheKey: '',
    flash: 0,
  };
  for (let i = 0; i < blk.rows.length * blk.cols.length; i++) blk.windows.push(rollWindow());

  if (type === 'roof') {
    for (let i = 0; i < S.roof.dormerCols.length; i++) blk.dormers.push(rollWindow());
  } else if (type === 'balcony') {
    blk.sides = {
      left: { item: rollItem(), clothes: rollClothes() },
      right: { item: rollItem(), clothes: rollClothes() },
    };
  } else if (Math.random() < b.balconyChance) {
    const span = blk.cols.length >= 2 && Math.random() < 0.5 ? 2 : 1;
    const start = Math.floor(Math.random() * (blk.cols.length - span + 1));
    let item = null;
    if (Math.random() < b.balconyItemChance) item = span === 2 && Math.random() < 0.55 ? 'laundry' : 'plant';
    blk.balcony = { start, span, item, plantPos: Math.random(), clothes: rollClothes() };
  }
  return blk;
}

// Half of the drawn width (side balconies / roof eaves stick out)
function blockVisualHalf(blk) {
  if (blk.type === 'balcony') return blk.width / 2 + CONFIG.shapes.balcony.depth;
  if (blk.type === 'roof') return blk.width / 2 + 3;
  return blk.width / 2;
}

// ---------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------
function towerToWorld(lx, ly) {
  const c = Math.cos(game.angle), s = Math.sin(game.angle);
  return { x: PIVOT_X + lx * c + ly * s, y: PIVOT_Y - lx * s + ly * c };
}

function towerTop() {
  const n = game.tower.length;
  const top = n ? game.tower[n - 1] : null;
  const lx = top ? top.cx : 0;
  const p = towerToWorld(lx, n * BH);
  return { lx, x: p.x, y: p.y, halfWidth: top ? top.width / 2 : BW / 2 };
}

function visibleTowerRange() {
  const n = game.tower.length;
  if (!n) return [0, -1];
  const step = BH * Math.cos(game.angle);
  const lo = Math.max(0, Math.floor((toWorldY(view.y1) - PIVOT_Y) / step) - 3);
  const hi = Math.min(n - 1, Math.ceil((toWorldY(view.y0) - PIVOT_Y) / step) + 3);
  return [lo, hi];
}

// ---------------------------------------------------------------------
// Sway (30+ floors) and earthquake shaking feed into game.angle
// ---------------------------------------------------------------------
function updateTowerSway(dt) {
  if (game.collapsing) return;
  const d = CONFIG.difficulty;
  game.swayPhase += d.towerSwaySpeed * dt;
  const target = game.diff.towerSway ? 1 : 0;
  game.swayRamp += (target - game.swayRamp) * (1 - Math.exp(-d.towerSwayRamp * dt));
  game.sway = game.tilt * d.towerSwayRatio * Math.sin(game.swayPhase) * game.swayRamp;
  game.angle = game.tilt + game.sway + game.quake.offset;
}

// ---------------------------------------------------------------------
// Falling & landing
// ---------------------------------------------------------------------
function updateFalling(dt) {
  const f = game.falling;
  if (!f) return;
  f.vy -= CONFIG.physics.gravity * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.rot *= Math.exp(-CONFIG.crane.releaseRotationDamping * dt);

  // height of the (tilted, possibly swaying) top surface under the block's center
  const top = towerTop();
  const surfaceY = top.y - (f.x - top.x) * Math.tan(game.angle);
  if (f.y - BH / 2 <= surfaceY) resolveLanding(f, surfaceY, top);
}

function resolveLanding(f, surfaceY, top) {
  game.falling = null;
  const th = game.angle;
  const dx = f.x - PIVOT_X;
  const dy = surfaceY - PIVOT_Y;
  const lx = dx * Math.cos(th) - dy * Math.sin(th);
  let offset = lx - top.lx;

  // Miss: the block's center is not over the floor below
  if (Math.abs(offset) > top.halfWidth) {
    const dir = Math.sign(offset) || 1;
    game.missed.push({
      block: f.block, x: f.x, y: f.y,
      vx: f.vx + dir * CONFIG.miss.pushSpeed, vy: f.vy,
      rot: 0, av: dir * CONFIG.miss.spinSpeed,
    });
    game.lives -= 1;
    game.combo = 0;
    Sound.miss();
    if (game.lives <= 0) endGame('lives', CONFIG.miss.gameOverDelay);
    else requestSpawn(CONFIG.miss.nextSpawnDelay);
    return;
  }

  const t = CONFIG.tower;
  const perfect = Math.abs(offset) <= BW * t.perfectThresholdRatio;
  if (perfect) {
    offset = 0;
    game.score += CONFIG.score.perfectBase + game.combo * CONFIG.score.perfectComboBonus;
    game.combo += 1;
    game.tilt *= 1 - t.perfectTiltReduction;
  } else {
    game.score += CONFIG.score.normal;
    game.combo = 0;
    game.tilt += (offset / BW) * t.tiltFactorDeg * DEG;
  }

  const blk = f.block;
  const shapeBonus = CONFIG.shapes[blk.type] ? CONFIG.shapes[blk.type].bonus : 0;
  game.score += shapeBonus;

  blk.cx = top.lx + offset;
  blk.index = game.tower.length;
  game.tower.push(blk);
  game.floors = game.tower.length;
  onFloorsChanged();
  game.angle = game.tilt + game.sway + game.quake.offset;

  const nt = towerTop();
  if (perfect) {
    blk.flash = CONFIG.effects.flashTime;
    spawnSparkles(nt.x, nt.y, blk.width);
    const text = game.combo >= 2 ? `${TEXT.perfect} x${game.combo}` : TEXT.perfect;
    addPopup(text, nt.x, nt.y + 16);
    Sound.perfect(game.combo);
  } else {
    const base = towerToWorld(blk.cx, blk.index * BH);
    spawnDust(base.x, base.y, blk.width);
    Sound.land();
  }
  if (blk.type === 'roof') {
    addPopup(`${TEXT.roof} +${shapeBonus}`, nt.x, nt.y + 50);
    Sound.bonus();
  }

  if (Math.abs(game.tilt) > t.maxTiltDeg * DEG) {
    startCollapse();
  } else {
    requestSpawn(CONFIG.crane.spawnDelay);
    maybeScheduleQuake();
  }
}

function onFloorsChanged() {
  const prev = game.diff;
  game.diff = difficultyAt(game.floors);
  game.nightOn = game.diff.night;
  const d = CONFIG.difficulty;
  if (game.diff.wind) {
    if (!prev.wind || game.floors % d.windChangeEvery === 0) {
      game.swing.windTarget = (Math.random() < 0.5 ? -1 : 1) * d.windAngleDeg * DEG * rand(0.6, 1);
    }
  } else {
    game.swing.windTarget = 0;
  }
}

// ---------------------------------------------------------------------
// Earthquake: everything shakes for a few seconds and the tilt is pushed
// outward. Survive it (no collapse) for a big bonus.
// ---------------------------------------------------------------------
function resetQuake() {
  game.quake = { active: false, pending: -1, t: 0, dir: 1, offset: 0, nextFloor: CONFIG.quake.minFloors };
}

function maybeScheduleQuake() {
  const q = game.quake, Q = CONFIG.quake;
  if (q.active || q.pending >= 0 || game.floors < q.nextFloor) return;
  if (Math.random() < Q.chance) q.pending = Q.startDelay;
}

function updateQuake(dt) {
  const q = game.quake, Q = CONFIG.quake;
  if (game.state !== State.PLAYING) {
    if (q.active || q.pending >= 0) { q.active = false; q.pending = -1; q.offset = 0; Sound.stopQuake(); }
    return;
  }
  if (q.pending >= 0) {
    q.pending -= dt;
    if (q.pending < 0) {
      q.active = true;
      q.t = 0;
      q.dir = Math.sign(game.tilt) || (Math.random() < 0.5 ? -1 : 1);
      addPopup(TEXT.quake, 0, 0, { screen: true, y: 200, size: 34, color: CONFIG.colors.quake, duration: 1.4 });
      Sound.quake(Q.duration);
    }
  }
  if (!q.active) return;

  q.t += dt;
  const env = Math.sin(Math.PI * clamp01(q.t / Q.duration)); // ramps in and out
  q.offset = Q.swayDeg * DEG * env * Math.sin(q.t * Q.swayFreq);
  game.tilt += q.dir * Q.tiltPushDeg * DEG * env * dt;
  game.shake = Math.max(game.shake, Q.shake * env);

  if (Math.abs(game.tilt) > CONFIG.tower.maxTiltDeg * DEG) {
    q.active = false;
    q.offset = 0;
    startCollapse();
    return;
  }
  if (q.t >= Q.duration) {
    q.active = false;
    q.offset = 0;
    q.nextFloor = game.floors + Q.cooldownFloors;
    game.score += Q.bonus;
    addPopup(`${TEXT.quakeSurvived} +${Q.bonus}`, 0, 0, { screen: true, y: 230, size: 22, duration: 1.6 });
    Sound.bonus();
  }
}

// ---------------------------------------------------------------------
// Collapse, missed blocks, debris
// ---------------------------------------------------------------------
function startCollapse() {
  game.tilt = game.angle;
  game.collapsing = { t: 0, angVel: (Math.sign(game.angle) || 1) * CONFIG.collapse.toppleStartSpeed };
  endGame('collapse', CONFIG.collapse.gameOverDelay);
  Sound.creak();
}

function updateCollapse(dt) {
  const c = game.collapsing;
  if (!c) return;
  c.angVel += Math.sign(c.angVel) * CONFIG.collapse.toppleAccel * dt;
  game.tilt += c.angVel * dt;
  game.angle = game.tilt;
  c.t += dt;
  if (c.t >= CONFIG.collapse.toppleTime) breakApart();
}

function breakApart() {
  const C = CONFIG.collapse;
  const w = game.collapsing.angVel;
  const [lo, hi] = visibleTowerRange();
  if (hi >= lo) {
    const base = towerToWorld(0, lo * BH);
    for (let i = lo; i <= hi; i++) {
      const b = game.tower[i];
      const p = towerToWorld(b.cx, (i + 0.5) * BH);
      // rigid-body velocity of the toppling tower (clockwise w > 0), capped
      let vx = w * (p.y - base.y);
      let vy = -w * (p.x - base.x);
      const sp = Math.hypot(vx, vy);
      if (sp > C.maxSpeed) { vx *= C.maxSpeed / sp; vy *= C.maxSpeed / sp; }
      game.debris.push({
        block: b, x: p.x, y: p.y,
        vx: vx + rand(-1, 1) * C.randomSpeed,
        vy: vy + rand(0, 1) * C.randomSpeed,
        rot: game.angle,
        av: w * rand(0.6, 1.4) + rand(-1, 1) * C.spinRandom,
      });
    }
  }
  game.tower = [];
  game.collapsing = null;
  game.shake = C.shake;
  Sound.crash();
}

function updateMissed(dt) {
  const g = CONFIG.physics.gravity;
  for (let i = game.missed.length - 1; i >= 0; i--) {
    const m = game.missed[i];
    m.vy -= g * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.rot += m.av * dt;
    if (toScreenY(m.y) > view.y1 + BH * 2 || m.y < -BH * 2) game.missed.splice(i, 1);
  }
}

function updateDebris(dt) {
  const g = CONFIG.physics.gravity, c = CONFIG.collapse;
  for (let i = game.debris.length - 1; i >= 0; i--) {
    const d = game.debris[i];
    d.vy -= g * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rot += d.av * dt;
    if (d.y < BH / 2) { // simple fake ground contact
      d.y = BH / 2;
      if (d.vy < 0) d.vy = -d.vy * c.groundBounce;
      d.vx *= c.groundFriction;
      d.av *= c.groundFriction;
    }
    if (toScreenY(d.y) > view.y1 + BH * 3) game.debris.splice(i, 1);
  }
}

// ---------------------------------------------------------------------
// Landing effects
// ---------------------------------------------------------------------
function spawnSparkles(x, y, width) {
  const e = CONFIG.effects;
  for (let i = 0; i < e.sparkleCount; i++) {
    const a = rand(0.15, Math.PI - 0.15);
    const sp = e.sparkleSpeed * rand(0.4, 1);
    game.particles.push({
      kind: 'spark', x: x + rand(-width / 2, width / 2), y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      t: 0, life: e.sparkleLife * rand(0.6, 1), size: rand(2.5, 5),
    });
  }
}

function spawnDust(x, y, width) {
  const e = CONFIG.effects;
  for (let i = 0; i < e.dustCount; i++) {
    const side = i % 2 ? 1 : -1;
    game.particles.push({
      kind: 'dust', x: x + side * width / 2, y,
      vx: side * rand(20, 60), vy: rand(5, 30),
      t: 0, life: e.dustLife * rand(0.7, 1), size: rand(3, 6),
    });
  }
}

function addPopup(text, x, y, opts) {
  const o = opts || {};
  game.popups.push({
    text, x, y, t: 0,
    screen: !!o.screen,
    sy: o.y || 0,
    size: o.size || 24,
    color: o.color || null,
    duration: o.duration || CONFIG.effects.popupDuration,
  });
}
