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
// Blocks: shape + structure are rolled at creation; tenants (curtains,
// balcony items, lights) move in when the block lands (see furnishBlock).
// ---------------------------------------------------------------------
function chooseBlockType() {
  const S = CONFIG.shapes;
  const n = game.floors + 1; // floor number this block would become
  if (n % S.roof.every === 0) return 'roof';
  if (n >= S.kacak.minFloors && Math.random() < S.kacak.chance) return 'kacak';
  const r = Math.random();
  if (n >= S.narrow.minFloors && r < S.narrow.chance) return 'narrow';
  if (n >= S.balcony.minFloors && r < S.narrow.chance + S.balcony.chance) return 'balcony';
  return 'normal';
}

// Facade era for floor n; styles mix over a few floors around each boundary
function chooseEra(n) {
  const E = CONFIG.eras;
  let era = E.list[0].id;
  for (let i = 1; i < E.list.length; i++) {
    const from = E.list[i].from;
    const p = clamp01((n - (from - E.blend) + 0.5) / (2 * E.blend));
    if (Math.random() < p) era = E.list[i].id;
  }
  return era;
}

// An empty window, before anyone moves in
function emptyWindow() {
  return { curtain: 'none', curtainColor: '', deco: null, decoColor: '', dayLit: false, nightLit: false };
}

function rollClothes(min, max) {
  const clothes = [];
  const n = min + Math.floor(Math.random() * (max - min + 1));
  for (let i = 0; i < n; i++) clothes.push({ color: pick(CONFIG.colors.laundry), w: rand(4, 7), h: rand(5, 8) });
  return clothes;
}

function makeBlock(type) {
  type = type || 'normal';
  const b = CONFIG.block, S = CONFIG.shapes, E = CONFIG.eras;
  const n = game.floors + 1;
  const era = type === 'kacak' ? 'kacak' : chooseEra(n);
  const pal = era === 'gecekondu' ? CONFIG.colors.gecekondu
    : era === 'gokdelen' ? CONFIG.colors.gokdelen : CONFIG.colors.blocks;
  const seq = game.blockSeq++;
  let cols = type === 'narrow' ? S.narrow.windowCols : b.windowCols;
  if (era === 'gecekondu') cols = type === 'narrow' ? E.gecekondu.narrowWindowCols : E.gecekondu.windowCols;
  const blk = {
    type,
    era,                // 'gecekondu' | 'apartman' | 'gokdelen' | 'kacak'
    legal: false,       // kaçak floors become legal at the next tapu
    tenant: null,
    color: pal[seq % pal.length],
    paint: CONFIG.colors.blocks[seq % CONFIG.colors.blocks.length], // kaçak after tapu
    width: type === 'narrow' ? Math.round(BW * S.narrow.widthRatio) : BW,
    cols,
    rows: type === 'roof' ? S.roof.windowRowsRatio : b.windowRowsRatio,
    windows: [],
    dormers: [],
    balcony: null,      // small front balcony
    sides: null,        // side balconies (balcony floor)
    patches: [],        // gecekondu plaster patches
    pipe: 0,            // gecekondu stove pipe side (-1 / 1)
    dish: null,         // satellite dish position (fractions of width / height)
    ac: 0,              // apartman AC unit side (-1 / 1)
    catColor: '',
    cx: 0,
    index: -1,
    cache: null,
    cacheKey: '',
    flash: 0,
  };
  for (let i = 0; i < blk.rows.length * blk.cols.length; i++) blk.windows.push(emptyWindow());
  if (type === 'roof') for (let i = 0; i < S.roof.dormerCols.length; i++) blk.dormers.push(emptyWindow());

  if (era === 'gecekondu') {
    const G = E.gecekondu;
    for (let i = 0; i < G.patchCount; i++) {
      blk.patches.push({ x: rand(-0.48, 0.3), y: rand(0.05, 0.7), w: rand(0.1, 0.2), h: rand(0.12, 0.25), light: Math.random() < 0.5 });
    }
    if (type !== 'roof' && type !== 'balcony' && Math.random() < G.stovePipeChance) blk.pipe = Math.random() < 0.5 ? -1 : 1;
    if (type !== 'roof' && type !== 'narrow' && Math.random() < G.dishChance) blk.dish = { x: (blk.pipe ? -blk.pipe : Math.random() < 0.5 ? -1 : 1) * 0.42, y: 0.22 };
  } else if (era === 'apartman' && type !== 'roof') {
    const A = E.apartman;
    if (type !== 'narrow' && type !== 'balcony' && Math.random() < A.acChance) blk.ac = Math.random() < 0.5 ? -1 : 1;
    if (type !== 'narrow' && Math.random() < A.dishChance) blk.dish = { x: (blk.ac ? -blk.ac : Math.random() < 0.5 ? -1 : 1) * 0.43, y: 0.36 };
  }

  if (type === 'balcony') {
    blk.sides = { left: { item: null, clothes: rollClothes(2, 4) }, right: { item: null, clothes: rollClothes(2, 4) } };
  } else if (type !== 'roof' && type !== 'kacak') {
    const chance = era === 'gecekondu' ? E.gecekondu.balconyChance
      : era === 'gokdelen' ? E.gokdelen.balconyChance : b.balconyChance;
    if (Math.random() < chance) {
      const span = blk.cols.length >= 2 && Math.random() < 0.5 ? 2 : 1;
      const start = Math.floor(Math.random() * (blk.cols.length - span + 1));
      blk.balcony = { start, span, item: null, itemPos: Math.random(), clothes: rollClothes(2, 4) };
      if (start === 0 || start + span === blk.cols.length) blk.ac = 0; // no room for the AC unit
    }
  }
  return blk;
}

// Which tenant a landing attracts (game.combo already counts this landing)
function tenantFor(offset, perfect) {
  const T = CONFIG.tenants;
  if (perfect) return game.combo >= T.eliteCombo ? 'elite' : 'teyze';
  return Math.abs(offset) / BW > T.studentOffsetRatio ? 'student' : 'family';
}

const TENANT_STYLE = {
  student: { curtains: ['none', 'none', 'sheet'], decos: ['flag', 'flag', 'cat'], items: ['laundry', 'laundry', 'banner'] },
  family: { curtains: ['plain', 'plain', 'none'], decos: ['cat', 'flowers'], items: ['laundry', 'plant', 'laundry'] },
  teyze: { curtains: ['lace', 'lace', 'lace', 'plain'], decos: ['flowers', 'flowers', 'cat'], items: ['geranium', 'peppers', 'cat', 'geranium'] },
  elite: { curtains: ['drape', 'drape', 'none'], decos: ['lamp', 'lamp', 'cat'], items: ['bigplant', 'bigplant', 'cat'] },
};

function furnishWindow(wd, tenant) {
  const t = CONFIG.tenants.types[tenant], st = TENANT_STYLE[tenant], col = CONFIG.colors;
  wd.curtain = pick(st.curtains);
  wd.curtainColor = wd.curtain === 'drape' ? col.drape : pick(col.curtains);
  wd.deco = Math.random() < t.decoChance ? pick(st.decos) : null;
  wd.decoColor = wd.deco === 'cat' ? pick(col.cat) : pick(col.flag);
  wd.nightLit = Math.random() < t.nightLit;
  wd.dayLit = wd.deco === 'lamp' || (tenant === 'student' && Math.random() < 0.2);
}

function furnishBlock(blk, tenant) {
  const t = CONFIG.tenants.types[tenant], st = TENANT_STYLE[tenant];
  blk.tenant = tenant;
  blk.catColor = pick(CONFIG.colors.cat);
  for (const wd of blk.windows) furnishWindow(wd, tenant);
  for (const wd of blk.dormers) furnishWindow(wd, tenant);
  const item = () => (Math.random() < t.itemChance ? pick(st.items) : null);
  if (blk.balcony) {
    blk.balcony.item = item();
    if (blk.balcony.item === 'laundry' && tenant === 'student') blk.balcony.clothes = rollClothes(4, 6);
  }
  if (blk.sides) {
    blk.sides.left.item = item();
    blk.sides.right.item = item();
  }
  blk.cache = null;
}

// Half of the drawn width (side balconies / roof eaves stick out)
function blockVisualHalf(blk) {
  if (blk.type === 'balcony') return blk.width / 2 + CONFIG.shapes.balcony.depth;
  if (blk.pipe) return blk.width / 2 + 8;
  if (blk.era === 'gecekondu') return blk.width / 2 + 4;
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
    const heavy = f.block.type === 'kacak' ? CONFIG.shapes.kacak.tiltMul : 1;
    game.tilt += (offset / BW) * t.tiltFactorDeg * DEG * heavy;
  }

  const blk = f.block;
  const shapeBonus = CONFIG.shapes[blk.type] ? CONFIG.shapes[blk.type].bonus : 0;
  game.score += shapeBonus;

  // tenants move in; rent is a small score bonus (no effect on tilt)
  const tenant = tenantFor(offset, perfect);
  furnishBlock(blk, tenant);
  const rent = CONFIG.tenants.types[tenant].rent;
  game.score += rent;
  game.tenantCounts[tenant] += 1;

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
  if (rent > 0) addPopup(`+${rent} ${TEXT.rent}`, nt.x + 60, nt.y - 8, { size: 14 });
  if (blk.type === 'roof') {
    addPopup(`${TEXT.roof} +${shapeBonus}`, nt.x, nt.y + 50);
    Sound.bonus();
  } else if (blk.type === 'kacak') {
    addPopup(`${TEXT.kacak} +${shapeBonus}`, nt.x, nt.y + 50);
  }
  if (game.floors % CONFIG.tapu.every === 0) grantTapu();

  if (Math.abs(game.tilt) > t.maxTiltDeg * DEG) {
    startCollapse();
  } else {
    requestSpawn(CONFIG.crane.spawnDelay);
    maybeScheduleQuake();
  }
}

// Tapu: every kaçak floor in the tower is legalized (plastered + painted)
function grantTapu() {
  let count = 0;
  for (const b of game.tower) {
    if (b.type === 'kacak' && !b.legal) {
      b.legal = true;
      b.cache = null;
      count++;
    }
  }
  if (!count) return;
  const bonus = count * CONFIG.tapu.bonusPerFloor;
  game.score += bonus;
  addPopup(`${TEXT.tapu} +${bonus}`, 0, 0, { screen: true, y: 250, size: 24, duration: 1.6 });
  Sound.bonus();
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
