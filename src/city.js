"use strict";

// =====================================================================
// Neighborhood meta game (stage 6): every game of 5+ floors becomes a
// building in a persistent street. Titles by total floors unlock a few
// cosmetics (crane color, floor palette). No effect on gameplay.
// =====================================================================

// ---------------------------------------------------------------------
// Persistent data (localStorage, always wrapped by Storage try/catch)
// ---------------------------------------------------------------------
const City = {
  data: null,

  empty() { return { v: 1, total: 0, nextId: 1, buildings: [] }; },

  load() {
    let d = null;
    try { d = JSON.parse(Storage.get(CONFIG.storage.city, '')); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || !Array.isArray(d.buildings)) d = this.empty();
    d.buildings = d.buildings.filter((b) => b && typeof b.p === 'string' && b.p.length >= 1 &&
      /^[sfteSFTE]+$/.test(b.p) && Number.isFinite(b.id));
    for (const b of d.buildings) {
      b.f = b.p.length;
      b.s = Number(b.s) || 0;
      b.d = Number(b.d) || 0;
      b.seed = Number(b.seed) || 1;
    }
    d.total = Math.max(Number(d.total) || 0, d.buildings.reduce((a, b) => a + b.f, 0));
    d.nextId = Math.max(Number(d.nextId) || 1, ...d.buildings.map((b) => b.id + 1), 1);
    this.data = d;
  },

  save() { Storage.set(CONFIG.storage.city, JSON.stringify(this.data)); },
};

const TENANT_CHAR = { student: 's', family: 'f', teyze: 't', elite: 'e' };
const CHAR_TENANT = { s: 'student', f: 'family', t: 'teyze', e: 'elite' };

function titleIndex(total) {
  const T = CONFIG.city.titles;
  let i = 0;
  while (i + 1 < T.length && total >= T[i + 1].floors) i++;
  return i;
}

// Record building (highest score) + the N tallest are never demolished
function protectedIds() {
  const bs = City.data.buildings;
  const ids = new Set();
  let rec = null;
  for (const b of bs) if (!rec || b.s > rec.s) rec = b;
  if (rec) ids.add(rec.id);
  const tall = bs.slice().sort((a, b) => b.f - a.f || b.s - a.s || a.id - b.id);
  for (let i = 0; i < Math.min(CONFIG.city.protectTallest, tall.length); i++) ids.add(tall[i].id);
  return ids;
}

function recordBuildingId() {
  let rec = null;
  for (const b of City.data.buildings) if (!rec || b.s > rec.s) rec = b;
  return rec ? rec.id : -1;
}

// Called by endGame() while the tower is still standing
function recordBuilding() {
  const C = CONFIG.city, d = City.data;
  game.cityEvent = null;
  if (!d || game.tower.length < C.minFloors) return;
  const before = titleIndex(d.total);
  let p = '';
  for (const b of game.tower) {
    const ch = TENANT_CHAR[b.tenant] || 'f';
    p += b.era === 'kacak' && !b.legal ? ch.toUpperCase() : ch;
  }
  const rec = {
    id: d.nextId++,
    p,
    f: p.length,
    s: game.score,
    d: Date.now(),
    r: game.over.reason === 'collapse' ? 'c' : 'l',
    seed: 1 + Math.floor(Math.random() * 100000),
  };
  d.buildings.push(rec);
  d.total += rec.f;

  const ev = { added: rec, demolished: null, titles: [] };
  // kentsel dönüşüm: over the limit, the shortest unprotected building goes
  if (d.buildings.length > C.maxBuildings) {
    const prot = protectedIds();
    let victim = null;
    for (const b of d.buildings) {
      if (prot.has(b.id)) continue;
      if (!victim || b.f < victim.f || (b.f === victim.f && b.id < victim.id)) victim = b;
    }
    if (victim) {
      d.buildings.splice(d.buildings.indexOf(victim), 1);
      ev.demolished = victim;
    }
  }
  const after = titleIndex(d.total);
  for (let i = before + 1; i <= after; i++) ev.titles.push(C.titles[i]);
  City.save();
  game.cityEvent = ev;
}

// ---------------------------------------------------------------------
// Cosmetics
// ---------------------------------------------------------------------
const Look = { crane: 'classic', palette: 'classic' };

function cosmeticTitle(kind, id) {
  return CONFIG.city.titles.find((t) => t.unlock === `${kind}:${id}`) || null;
}

function isUnlocked(kind, id) {
  if (id === 'classic') return true;
  const t = cosmeticTitle(kind, id);
  return !!t && City.data.total >= t.floors;
}

function cosmeticName(unlock) {
  const [kind, id] = unlock.split(':');
  const item = CONFIG.cosmetics[kind].find((c) => c.id === id);
  return `${kind === 'crane' ? TEXT.craneColor : TEXT.blockPalette}: ${item ? item.name : id}`;
}

function loadLook() {
  let l = null;
  try { l = JSON.parse(Storage.get(CONFIG.storage.look, '')); } catch (e) { l = null; }
  for (const kind of ['crane', 'palette']) {
    const id = l && l[kind];
    Look[kind] = CONFIG.cosmetics[kind].some((c) => c.id === id) && isUnlocked(kind, id) ? id : 'classic';
  }
}

function applyLook() {
  const col = CONFIG.colors;
  const cr = CONFIG.cosmetics.crane.find((c) => c.id === Look.crane);
  col.craneYellow = cr.yellow;
  col.craneLight = cr.light;
  col.craneHighlight = cr.highlight;
  col.craneShadow = cr.shadow;
  const pal = CONFIG.cosmetics.palette.find((c) => c.id === Look.palette);
  col.blocks.splice(0, col.blocks.length, ...pal.colors);
  if (caches.crane) buildCraneCaches();
}

function setLook(kind, id) {
  if (!isUnlocked(kind, id)) return false;
  Look[kind] = id;
  Storage.set(CONFIG.storage.look, JSON.stringify(Look));
  applyLook();
  return true;
}

// ---------------------------------------------------------------------
// Screen state, layout
// ---------------------------------------------------------------------
const CITY_BACK = { x: 16, y: 584, w: 120, h: 40 };
const CITY_LOOKS = { x: 224, y: 584, w: 120, h: 40 };
const LOOK_CLOSE = { x: 110, y: 430, w: 140, h: 44 };

const cityView = {
  scroll: 0, vel: 0, target: null,
  drag: null,
  selected: -1,
  panel: false,
  intro: null,          // { id, t } new building rising
  toasts: [],           // { text, sub, t, dur }
  cache: new Map(),
  cacheKey: '',
};

function cityLayout() {
  const C = CONFIG.city;
  const items = [];
  let x = 18;
  const ti = titleIndex(City.data.total);
  for (let i = 1; i <= ti; i++) {
    items.push({ kind: 'landmark', id: C.titles[i].landmark, x });
    x += C.landmarkWidth;
  }
  for (const rec of City.data.buildings) {
    items.push({ kind: 'building', rec, x });
    x += C.lotWidth;
  }
  return { items, width: x + 18 };
}

function cityFloorH() {
  const C = CONFIG.city;
  const maxF = Math.max(10, ...City.data.buildings.map((b) => b.f));
  return clamp((C.groundY - C.topY) / maxF, C.minFloorH, C.maxFloorH);
}

function maxCityScroll(layout) {
  return Math.max(0, layout.width - (view.x1 - view.x0));
}

function enterCity(ev) {
  game.state = State.CITY;
  cityView.panel = false;
  cityView.selected = -1;
  cityView.vel = 0;
  cityView.drag = null;
  cityView.intro = null;
  cityView.toasts = [];
  const layout = cityLayout();
  cityView.scroll = maxCityScroll(layout); // newest buildings are on the right
  cityView.target = null;
  if (!ev) return;
  const toast = (text, sub) => cityView.toasts.push({ text, sub: sub || '', t: 0, dur: 2.2 });
  const stillThere = ev.added && City.data.buildings.includes(ev.added);
  if (stillThere) {
    const it = layout.items.find((i) => i.rec === ev.added);
    cityView.target = clamp(it.x + CONFIG.city.lotWidth / 2 - (view.x1 - view.x0) / 2, 0, maxCityScroll(layout));
    cityView.scroll = cityView.target;
    cityView.intro = { id: ev.added.id, t: 0 };
    cityView.selected = ev.added.id;
    toast(TEXT.newBuilding, `${ev.added.f} ${TEXT.floorsShort}`);
    Sound.land();
  }
  if (ev.demolished) toast(TEXT.renewal, TEXT.renewalLine(ev.demolished.f));
  for (const t of ev.titles) toast(TEXT.newTitle(t.name), t.unlock ? TEXT.unlocked(cosmeticName(t.unlock)) : '');
}

function leaveCity() {
  backToMenu();
}

function updateCity(dt) {
  const v = cityView, C = CONFIG.city;
  const maxS = maxCityScroll(cityLayout());
  if (!v.drag) {
    v.scroll += v.vel * dt;
    v.vel *= Math.exp(-C.friction * dt);
    if (Math.abs(v.vel) < 2) v.vel = 0;
  }
  if (v.scroll < 0) { v.scroll = 0; v.vel = 0; }
  if (v.scroll > maxS) { v.scroll = maxS; v.vel = 0; }
  if (v.intro) {
    v.intro.t += dt;
    if (v.intro.t > C.riseTime + 0.6) v.intro = null;
  }
  if (v.toasts.length) {
    const t = v.toasts[0];
    t.t += dt;
    if (t.t > t.dur) v.toasts.shift();
  }
}

// ---------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------
function cityPointerDown(x, y) {
  cityView.drag = { x0: x, y0: y, lastX: x, lastT: performance.now(), moved: false };
  cityView.vel = 0;
}

function cityPointerMove(x) {
  const d = cityView.drag;
  if (!d || cityView.panel) return;
  const now = performance.now();
  const dx = x - d.lastX;
  if (Math.abs(x - d.x0) > CONFIG.city.tapSlop) d.moved = true;
  if (d.moved) {
    cityView.scroll -= dx;
    clampCityScroll();
    const dtm = Math.max(1, now - d.lastT) / 1000;
    cityView.vel = lerp(cityView.vel, -dx / dtm, 0.5);
  }
  d.lastX = x;
  d.lastT = now;
}

function cityPointerUp(x, y, cancelled) {
  const d = cityView.drag;
  cityView.drag = null;
  if (!d) return;
  if (performance.now() - d.lastT > 80) cityView.vel = 0; // finger stopped before lifting
  if (!d.moved && !cancelled) cityTap(d.x0, d.y0);
}

function clampCityScroll() {
  cityView.scroll = clamp(cityView.scroll, 0, maxCityScroll(cityLayout()));
}

function cityWheel(delta) {
  cityView.scroll += delta;
  cityView.vel = 0;
  clampCityScroll();
}

function cityKey(code) {
  if (code === 'Escape' || code === 'Backspace' || code === 'Space' || code === 'Enter') {
    if (cityView.panel) cityView.panel = false;
    else leaveCity();
  } else if (code === 'ArrowLeft') cityView.vel = -600;
  else if (code === 'ArrowRight') cityView.vel = 600;
}

function lookSwatches() {
  const list = [];
  CONFIG.cosmetics.crane.forEach((c, i) => list.push({ kind: 'crane', item: c, x: 41 + i * 72, y: 222, w: 62, h: 44 }));
  CONFIG.cosmetics.palette.forEach((c, i) => list.push({ kind: 'palette', item: c, x: 48 + i * 92, y: 332, w: 80, h: 44 }));
  return list;
}

function cityTap(x, y) {
  const v = cityView;
  if (v.panel) {
    if (inRect(x, y, LOOK_CLOSE)) { v.panel = false; return; }
    for (const s of lookSwatches()) {
      if (inRect(x, y, s) && setLook(s.kind, s.item.id)) Sound.land();
    }
    return;
  }
  if (inRect(x, y, CITY_BACK)) { leaveCity(); return; }
  if (inRect(x, y, CITY_LOOKS)) { v.panel = true; return; }
  const C = CONFIG.city, fh = cityFloorH();
  for (const it of cityLayout().items) {
    if (it.kind !== 'building') continue;
    const sx = cityItemX(it) - 4;
    const top = C.groundY - it.rec.f * fh - 10;
    if (x >= sx && x <= sx + C.buildingWidth + 8 && y >= top && y <= C.groundY + 4) {
      v.selected = v.selected === it.rec.id ? -1 : it.rec.id;
      return;
    }
  }
  v.selected = -1;
}

function cityItemX(it) {
  const C = CONFIG.city;
  const off = it.kind === 'building' ? (C.lotWidth - C.buildingWidth) / 2 : 0;
  return view.x0 + it.x - cityView.scroll + off;
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
function eraForFloor(n) {
  let id = CONFIG.eras.list[0].id;
  for (const e of CONFIG.eras.list) if (n >= e.from) id = e.id;
  return id;
}

const MINI_WINDOW = { s: '#FFD36B', f: '#A7D3E8', t: '#F4F1EA', e: '#FFE7A8' };

// Mini replica of a recorded tower, bottom-left at (0, h)
function drawMiniBuilding(g, rec, fh, w, h) {
  const col = CONFIG.colors;
  const rnd = seededRandom(rec.seed);
  const cols3 = [0.2, 0.5, 0.8], cols2 = [0.3, 0.7];
  for (let i = 0; i < rec.f; i++) {
    const ch = rec.p[i];
    const kacak = ch !== ch.toLowerCase();
    const era = kacak ? 'kacak' : eraForFloor(i + 1);
    const y = h - (i + 1) * fh;
    const r = rnd();
    let c;
    if (era === 'kacak') c = col.briket;
    else if (era === 'gecekondu') c = col.gecekondu[Math.floor(r * col.gecekondu.length)];
    else if (era === 'gokdelen') c = col.gokdelen[Math.floor(r * col.gokdelen.length)];
    else c = col.blocks[Math.floor(r * col.blocks.length)];
    g.fillStyle = c;
    g.fillRect(0, y, w, fh + 0.3);
    if (fh >= 2) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, y + fh - 0.6, w, 0.6);
    }
    if (fh >= CONFIG.city.windowMinFloorH) {
      const t = ch.toLowerCase();
      const ww = era === 'gokdelen' ? w / 3 - 1 : 5;
      const wh = era === 'gokdelen' ? fh - 1.6 : Math.max(1.5, fh * 0.45);
      const xs = era === 'gecekondu' ? cols2 : cols3;
      for (const fx of xs) {
        const wx = era === 'gokdelen' ? fx * w - ww / 2 : fx * w - ww / 2;
        g.fillStyle = era === 'kacak' && t === 'f' ? '#3B3A38' : MINI_WINDOW[t];
        if (era === 'gokdelen' && t === 'f') g.fillStyle = shade(c, 0.25);
        g.fillRect(wx, y + (fh - wh) / 2 - 0.3, ww, wh);
      }
    } else if (era === 'gokdelen') {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(w * 0.15, y, 1, fh);
    }
  }
  g.lineWidth = 1;
  g.strokeStyle = col.ink;
  g.strokeRect(0, h - rec.f * fh, w, rec.f * fh);

  const topY = h - rec.f * fh;
  const topCh = rec.p[rec.f - 1];
  const topEra = topCh !== topCh.toLowerCase() ? 'kacak' : eraForFloor(rec.f);
  if (topEra === 'gokdelen') { // antenna
    g.fillStyle = col.ink;
    g.fillRect(w * 0.7, topY - 7, 1, 7);
    g.fillStyle = col.warnLight;
    g.fillRect(w * 0.7 - 0.8, topY - 8.5, 2.6, 2);
  } else if (topEra === 'gecekondu' || topEra === 'kacak') { // rebars
    g.strokeStyle = col.rebar;
    g.lineWidth = 0.9;
    g.beginPath();
    for (const fx of [0.2, 0.5, 0.8]) { g.moveTo(w * fx, topY); g.lineTo(w * fx + 0.6, topY - 4); }
    g.stroke();
  }
  if (rec.r === 'c') { // collapsed: crack at the top
    g.strokeStyle = col.ink;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(w * 0.62, topY);
    g.lineTo(w * 0.52, topY + Math.min(5, rec.f * fh * 0.3));
    g.lineTo(w * 0.6, topY + Math.min(9, rec.f * fh * 0.5));
    g.lineTo(w * 0.5, topY + Math.min(13, rec.f * fh * 0.7));
    g.stroke();
  }
}

function miniBuildingImage(rec, fh) {
  const key = `${view.version}|${fh.toFixed(3)}|${Look.palette}`;
  if (cityView.cacheKey !== key) { cityView.cache.clear(); cityView.cacheKey = key; }
  let img = cityView.cache.get(rec.id);
  if (!img) {
    const C = CONFIG.city;
    const h = rec.f * fh + 10;
    img = { h, c: makeCache(C.buildingWidth + 4, h + 2, (g) => { g.translate(2, 1); drawMiniBuilding(g, rec, fh, C.buildingWidth, h); }) };
    cityView.cache.set(rec.id, img);
  }
  return img;
}

function drawLandmark(id, x, gy) {
  const col = CONFIG.colors, c = ctx;
  c.lineWidth = 1;
  c.strokeStyle = col.ink;
  switch (id) {
    case 'cay': // tea garden: two umbrellas and tables
      for (const [ux, uc] of [[x + 18, col.signRed], [x + 46, col.button2]]) {
        c.fillStyle = col.lamp;
        c.fillRect(ux - 0.6, gy - 22, 1.2, 22);
        c.fillStyle = uc;
        c.beginPath();
        c.moveTo(ux - 13, gy - 20);
        c.quadraticCurveTo(ux, gy - 34, ux + 13, gy - 20);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = col.wood;
        c.fillRect(ux - 7, gy - 9, 14, 2);
        c.fillRect(ux - 5, gy - 7, 1.2, 7);
        c.fillRect(ux + 4, gy - 7, 1.2, 7);
        c.fillStyle = '#C0392B';
        c.fillRect(ux - 2, gy - 12, 2, 3); // tea glass
      }
      break;
    case 'park':
      c.fillStyle = col.trunk;
      c.fillRect(x + 15, gy - 16, 3, 16);
      c.fillRect(x + 47, gy - 20, 3, 20);
      c.fillStyle = col.tree;
      c.beginPath();
      c.arc(x + 16.5, gy - 24, 11, 0, Math.PI * 2);
      c.arc(x + 48.5, gy - 30, 13, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = col.wood;
      c.fillRect(x + 24, gy - 8, 18, 2.5);
      c.fillRect(x + 24, gy - 13, 18, 2);
      c.fillRect(x + 25, gy - 6, 1.5, 6);
      c.fillRect(x + 39.5, gy - 6, 1.5, 6);
      break;
    case 'metro':
      c.fillStyle = '#DDE7EE';
      c.fillRect(x + 10, gy - 22, 34, 22);
      c.strokeRect(x + 10, gy - 22, 34, 22);
      c.fillStyle = col.lamp;
      c.fillRect(x + 8, gy - 25, 38, 4);
      c.fillStyle = '#2B2D42';
      c.fillRect(x + 18, gy - 16, 18, 16);
      c.fillStyle = col.lamp;
      c.fillRect(x + 52, gy - 38, 2, 38);
      c.fillStyle = '#C8102E';
      c.fillRect(x + 46, gy - 50, 14, 14);
      c.fillStyle = '#FFFFFF';
      c.font = `bold 10px ${CONFIG.ui.font}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('M', x + 53, gy - 42.5);
      break;
    case 'cami': {
      const fill = '#E8E1D0';
      c.fillStyle = fill;
      c.fillRect(x + 8, gy - 20, 40, 20);
      c.strokeRect(x + 8, gy - 20, 40, 20);
      c.beginPath();
      c.arc(x + 28, gy - 20, 14, Math.PI, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillRect(x + 52, gy - 58, 4, 58);
      c.strokeRect(x + 52, gy - 58, 4, 58);
      c.fillRect(x + 50.5, gy - 44, 7, 2);
      c.fillStyle = '#7D8A99';
      c.beginPath();
      c.moveTo(x + 51.5, gy - 58);
      c.lineTo(x + 54, gy - 70);
      c.lineTo(x + 56.5, gy - 58);
      c.closePath();
      c.fill();
      c.fillStyle = col.ink;
      c.fillRect(x + 27.4, gy - 40, 1.2, 6);
      break;
    }
    case 'saat': // clock tower
      c.fillStyle = '#D9CBB0';
      c.fillRect(x + 22, gy - 62, 20, 62);
      c.strokeRect(x + 22, gy - 62, 20, 62);
      c.fillStyle = '#B5523B';
      c.beginPath();
      c.moveTo(x + 20, gy - 62);
      c.lineTo(x + 32, gy - 80);
      c.lineTo(x + 44, gy - 62);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.arc(x + 32, gy - 50, 6.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(x + 32, gy - 50);
      c.lineTo(x + 32, gy - 55);
      c.moveTo(x + 32, gy - 50);
      c.lineTo(x + 35.5, gy - 50);
      c.stroke();
      break;
  }
}

function drawStreetTree(x, gy) {
  const col = CONFIG.colors;
  ctx.fillStyle = col.trunk;
  ctx.fillRect(x - 1.2, gy - 12, 2.4, 12);
  ctx.fillStyle = col.treeDark;
  ctx.beginPath();
  ctx.arc(x, gy - 16, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col.tree;
  ctx.beginPath();
  ctx.arc(x - 1, gy - 17, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawStreetLamp(x, gy) {
  const col = CONFIG.colors;
  ctx.fillStyle = col.lamp;
  ctx.fillRect(x - 0.8, gy - 26, 1.6, 26);
  ctx.fillRect(x - 0.8, gy - 26, 6, 1.6);
  ctx.fillStyle = col.lit;
  ctx.fillRect(x + 3.5, gy - 25, 3, 2.2);
}

function cityButton(b, label, fill) {
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 12);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = CONFIG.colors.ink;
  ctx.stroke();
  ctx.fillStyle = CONFIG.colors.buttonText;
  ctx.font = font(17);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
}

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${TEXT.months[d.getMonth()]} ${d.getFullYear()}`;
}

function drawCityCard(rec) {
  const col = CONFIG.colors;
  roundRectPath(ctx, 24, 112, 312, 84, 14);
  ctx.fillStyle = col.panel;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col.ink;
  ctx.stroke();
  ctx.fillStyle = col.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(18);
  ctx.fillText(`${rec.f} ${TEXT.floorsShort}  ·  ${TEXT.score}: ${rec.s}`, 38, 134);
  ctx.font = font(12);
  ctx.fillText(`${formatDate(rec.d)}  ·  ${rec.r === 'c' ? TEXT.collapsed : TEXT.livesOut}`, 38, 156);
  const counts = { teyze: 0, family: 0, student: 0, elite: 0 };
  for (const ch of rec.p) counts[CHAR_TENANT[ch.toLowerCase()]]++;
  const parts = Object.keys(counts).filter((k) => counts[k]).map((k) => `${counts[k]} ${TEXT.tenantNames[k]}`);
  ctx.font = font(11);
  ctx.fillText(parts.join(' · '), 38, 177);
  // tags
  const tags = [];
  if (rec.id === recordBuildingId()) tags.push([TEXT.recordTag, col.record]);
  else if (protectedIds().has(rec.id)) tags.push([TEXT.protectedTag, col.button2]);
  let tx = 322;
  ctx.font = font(11);
  for (const [text, c] of tags) {
    const tw = ctx.measureText(text).width + 14;
    tx -= tw;
    roundRectPath(ctx, tx, 123, tw, 20, 10);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(text, tx + tw / 2, 133.5);
    tx -= 6;
  }
}

function drawLookPanel() {
  const col = CONFIG.colors;
  dimScreen();
  roundRectPath(ctx, 24, 150, 312, 346, 18);
  ctx.fillStyle = col.panel;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col.ink;
  ctx.stroke();
  ctx.fillStyle = col.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(22);
  ctx.fillText(TEXT.looks, W / 2, 180);
  ctx.font = font(14);
  ctx.textAlign = 'left';
  ctx.fillText(TEXT.craneColor, 41, 207);
  ctx.fillText(TEXT.blockPalette, 48, 317);

  for (const s of lookSwatches()) {
    const open = isUnlocked(s.kind, s.item.id);
    const sel = Look[s.kind] === s.item.id;
    ctx.globalAlpha = open ? 1 : 0.4;
    roundRectPath(ctx, s.x, s.y, s.w, s.h, 8);
    ctx.save();
    ctx.clip();
    if (s.kind === 'crane') {
      const it = s.item;
      ctx.fillStyle = it.light;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = it.yellow;
      ctx.fillRect(s.x, s.y + s.h * 0.35, s.w, s.h * 0.3);
      ctx.strokeStyle = it.shadow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = s.x - 10; x < s.x + s.w; x += 10) {
        ctx.moveTo(x, s.y + s.h * 0.65);
        ctx.lineTo(x + 10, s.y + s.h * 0.35);
      }
      ctx.stroke();
      ctx.fillStyle = it.shadow;
      ctx.fillRect(s.x, s.y + s.h * 0.65, s.w, s.h * 0.35);
    } else {
      const cs = s.item.colors;
      for (let i = 0; i < cs.length; i++) {
        ctx.fillStyle = cs[i];
        ctx.fillRect(s.x + (s.w / cs.length) * i, s.y, s.w / cs.length + 0.5, s.h);
      }
    }
    ctx.restore();
    ctx.lineWidth = sel ? 3.5 : 1.5;
    ctx.strokeStyle = col.ink;
    roundRectPath(ctx, s.x, s.y, s.w, s.h, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.ink;
    if (open) {
      ctx.font = font(12);
      ctx.fillText(s.item.name, s.x + s.w / 2, s.y + s.h + 13);
    } else {
      drawLock(s.x + s.w / 2, s.y + s.h / 2);
      const t = cosmeticTitle(s.kind, s.item.id);
      ctx.font = font(10);
      ctx.fillStyle = col.ink;
      ctx.fillText(t ? t.name : '', s.x + s.w / 2, s.y + s.h + 13);
    }
  }
  ctx.font = font(11);
  ctx.fillStyle = col.ink;
  ctx.globalAlpha = 0.75;
  ctx.fillText(TEXT.lockHint, W / 2, 408);
  ctx.globalAlpha = 1;
  cityButton(LOOK_CLOSE, TEXT.close, col.button);
}

function drawLock(x, y) {
  const col = CONFIG.colors;
  ctx.lineWidth = 2;
  ctx.strokeStyle = col.ink;
  ctx.beginPath();
  ctx.arc(x, y - 3, 4.5, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = col.ink;
  ctx.fillRect(x - 6.5, y - 3, 13, 10);
}

function drawCityScreen() {
  const C = CONFIG.city, col = CONFIG.colors, v = cityView;
  // sky
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sk = CONFIG.sky.keys[0];
  const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gr.addColorStop(0, sk.top);
  gr.addColorStop(1, sk.bottom);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = view.dpr * view.scale;
  ctx.setTransform(s, 0, 0, s, view.dpr * view.offX, view.dpr * view.offY);

  // clouds
  const CL = CONFIG.clouds;
  const spanX = view.x1 - view.x0 + 240;
  for (const c of game.clouds) {
    const sp = caches.clouds[c.shape];
    const x = view.x0 - 140 + mod(c.x - v.scroll * CL.parallaxX, spanX);
    const y = view.y0 + 60 + mod(c.y, 260);
    ctx.drawImage(sp.img, x, y, sp.w * c.scale, sp.h * c.scale);
  }

  // Istanbul skyline behind the street
  const tile = CONFIG.skyline.tileWidth;
  CONFIG.skyline.layers.forEach((L, li) => {
    const shift = -v.scroll * L.parallaxX - li * 53;
    const img = caches.skyline[li][0];
    const baseY = C.groundY + 2 - (2 - li) * 22;
    for (let k = Math.floor((view.x0 - shift) / tile) - 1; k * tile + shift < view.x1; k++) {
      ctx.drawImage(img, k * tile + shift, baseY - SKYLINE_TILE_H, tile, SKYLINE_TILE_H);
    }
    ctx.fillStyle = (L.water || L.colors)[0];
    ctx.fillRect(view.x0, baseY - 0.5, view.x1 - view.x0, C.groundY - baseY + 1);
  });

  // sidewalk + road
  const gy = C.groundY;
  ctx.fillStyle = col.sidewalk;
  ctx.fillRect(view.x0, gy, view.x1 - view.x0, 14);
  ctx.fillStyle = col.curb;
  ctx.fillRect(view.x0, gy + 12, view.x1 - view.x0, 3);
  ctx.fillStyle = col.road;
  ctx.fillRect(view.x0, gy + 15, view.x1 - view.x0, view.y1 - gy - 15);
  ctx.fillStyle = col.roadLine;
  for (let x = view.x0 - mod(v.scroll, 40); x < view.x1; x += 40) ctx.fillRect(x, gy + 44, 22, 3);

  // landmarks + buildings
  const layout = cityLayout();
  const fh = cityFloorH();
  let dust = null;
  for (const it of layout.items) {
    const x = cityItemX(it);
    if (x > view.x1 + 10 || x + C.lotWidth < view.x0 - 10) continue;
    if (it.kind === 'landmark') { drawLandmark(it.id, x, gy); continue; }
    const img = miniBuildingImage(it.rec, fh);
    const w = C.buildingWidth + 4, hh = img.h + 2;
    let k = 1;
    if (v.intro && v.intro.id === it.rec.id) {
      const t = clamp01(v.intro.t / C.riseTime);
      k = 1 - Math.pow(1 - t, 3);
      if (v.intro.t < C.riseTime + 0.4) dust = { x: x + C.buildingWidth / 2, t: v.intro.t };
    }
    const visH = hh * k;
    ctx.drawImage(img.c, 0, 0, img.c.width, img.c.height * k, x - 2, gy + 1 - visH, w, visH);
    if (v.selected === it.rec.id) { // marker above the selected building
      const ty = gy - it.rec.f * fh - 16;
      ctx.fillStyle = col.button;
      ctx.beginPath();
      ctx.moveTo(x + C.buildingWidth / 2 - 6, ty - 8);
      ctx.lineTo(x + C.buildingWidth / 2 + 6, ty - 8);
      ctx.lineTo(x + C.buildingWidth / 2, ty);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col.ink;
      ctx.stroke();
    }
  }
  // street furniture in the gaps between lots
  layout.items.forEach((it, i) => {
    if (it.kind !== 'building') return;
    const x = view.x0 + it.x - v.scroll;
    if (x > view.x1 + 10 || x < view.x0 - 20) return;
    if (i % 3 === 1) drawStreetTree(x, gy + 6);
    else if (i % 3 === 2) drawStreetLamp(x, gy + 6);
  });
  if (dust) {
    ctx.fillStyle = col.dust;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      ctx.globalAlpha = Math.max(0, 0.8 - dust.t / 1.6);
      ctx.beginPath();
      ctx.arc(dust.x + side * (14 + dust.t * 18 + i * 2), gy + 2 - i, 4 + dust.t * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // HUD: title, stats, progress to the next title
  const d = City.data;
  const ti = titleIndex(d.total);
  const T = C.titles;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(26);
  outlinedText(T[ti].name, W / 2, 44, col.ink, col.light, 6);
  ctx.font = font(13);
  outlinedText(TEXT.cityStats(d.buildings.length, d.total), W / 2, 64, col.ink, col.light, 4);
  if (ti + 1 < T.length) {
    const a = T[ti].floors, b = T[ti + 1].floors;
    const k = clamp01((d.total - a) / (b - a));
    roundRectPath(ctx, 80, 74, 200, 9, 4.5);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    if (k > 0) {
      roundRectPath(ctx, 80, 74, Math.max(9, 200 * k), 9, 4.5);
      ctx.fillStyle = col.record;
      ctx.fill();
    }
    roundRectPath(ctx, 80, 74, 200, 9, 4.5);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col.ink;
    ctx.stroke();
    ctx.font = font(12);
    outlinedText(TEXT.nextTitle(T[ti + 1].name, b - d.total), W / 2, 100, col.ink, col.light, 4);
  } else {
    ctx.font = font(12);
    outlinedText(TEXT.maxTitle, W / 2, 84, col.ink, col.light, 4);
  }

  if (!d.buildings.length) {
    ctx.font = font(18);
    outlinedText(TEXT.emptyCity, W / 2, 330, col.ink, col.light, 5);
    ctx.font = font(13);
    outlinedText(TEXT.emptyCityHint, W / 2, 354, col.ink, col.light, 4);
  }

  const sel = d.buildings.find((b) => b.id === v.selected);
  if (sel && !v.toasts.length) drawCityCard(sel);

  if (v.toasts.length) {
    const t = v.toasts[0];
    const a = t.t < 0.2 ? t.t / 0.2 : t.t > t.dur - 0.3 ? (t.dur - t.t) / 0.3 : 1;
    ctx.globalAlpha = clamp01(a);
    ctx.textAlign = 'center';
    ctx.font = font(26);
    outlinedText(t.text, W / 2, 150, col.ink, col.light, 6);
    if (t.sub) {
      ctx.font = font(15);
      outlinedText(t.sub, W / 2, 176, col.ink, col.light, 5);
    }
    ctx.globalAlpha = 1;
  }

  cityButton(CITY_BACK, TEXT.back, col.button);
  cityButton(CITY_LOOKS, TEXT.looks, col.button2);
  if (v.panel) drawLookPanel();
}
