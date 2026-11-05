"use strict";

// =====================================================================
// Rendering: canvas scaling, caches, facades, background, HUD, screens
// =====================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { dpr: 1, scale: 1, offX: 0, offY: 0, x0: 0, x1: W, y0: 0, y1: H, version: 0 };
const caches = { skyline: [], clouds: [], stars: null, crane: null, craneH: 0, mast: null, mastTileW: 0, mastTileH: 0 };

function resize() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  const scale = Math.min(cssW / W, cssH / H);
  view.dpr = dpr;
  view.scale = scale;
  view.offX = (cssW - W * scale) / 2;
  view.offY = (cssH - H * scale) / 2;
  // visible logical bounds (the scene extends into the letterbox area)
  view.x0 = -view.offX / scale;
  view.x1 = W + view.offX / scale;
  view.y0 = -view.offY / scale;
  view.y1 = H + view.offY / scale;
  view.version++;
  buildStaticCaches();
}

function clientToLogical(clientX, clientY) {
  return { x: (clientX - view.offX) / view.scale, y: (clientY - view.offY) / view.scale };
}

// Coordinate helpers (world: y up, ground surface at y = 0)
function toScreenX(wx) { return wx - game.cam.x; }
function toScreenY(wy) { return GY - (wy - game.cam.y); }
function toWorldX(sx) { return sx + game.cam.x; }
function toWorldY(sy) { return game.cam.y + (GY - sy); }

// Offscreen canvas at device resolution, drawn with logical coordinates
function makeCache(lw, lh, drawFn) {
  const pr = view.dpr * view.scale;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(lw * pr));
  c.height = Math.max(1, Math.ceil(lh * pr));
  const g = c.getContext('2d');
  g.scale(c.width / lw, c.height / lh);
  drawFn(g);
  return c;
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Yellow/black warning stripes
function hazardRect(g, x, y, w, h, stripe) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = CONFIG.colors.craneYellow;
  g.fillRect(x, y, w, h);
  g.fillStyle = CONFIG.colors.hazardDark;
  for (let s = x - h; s < x + w + h; s += stripe * 2) {
    g.beginPath();
    g.moveTo(s, y + h);
    g.lineTo(s + h, y);
    g.lineTo(s + h + stripe, y);
    g.lineTo(s + stripe, y + h);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.lineWidth = 1;
  g.strokeStyle = CONFIG.colors.ink;
  g.strokeRect(x, y, w, h);
}

// =====================================================================
// Facades (drawn once per block into a cache)
// =====================================================================
function drawWindow(g, x, y, w, h, wd, night) {
  const col = CONFIG.colors;
  g.fillStyle = night ? col.frameNight : col.frame;
  g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  const lit = night ? wd.nightLit : wd.type === 'lit';
  g.fillStyle = lit ? col.lit : night ? col.glassNight : col.glass;
  g.fillRect(x, y, w, h);
  if (!lit) {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(x, y + h * 0.55);
    g.lineTo(x + w * 0.45, y);
    g.lineTo(x + w * 0.65, y);
    g.lineTo(x, y + h * 0.85);
    g.closePath();
    g.fill();
  }
  if (wd.type === 'curtain') {
    g.fillStyle = wd.curtain;
    g.fillRect(x, y, w * 0.3, h);
    g.fillRect(x + w * 0.7, y, w * 0.3, h);
    g.fillRect(x, y, w, h * 0.16);
  }
  g.fillStyle = night ? col.frameNight : col.frame;
  g.fillRect(x + w / 2 - 0.7, y, 1.4, h);
  g.fillRect(x, y + h * 0.42 - 0.6, w, 1.2);
  g.fillRect(x - 2.5, y + h + 1.5, w + 5, 1.8);
  g.lineWidth = 1;
  g.strokeStyle = col.ink;
  g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
}

function drawPlant(g, px, baseY) {
  const col = CONFIG.colors;
  g.fillStyle = col.plant;
  g.beginPath();
  g.arc(px - 2.5, baseY - 8, 3, 0, Math.PI * 2);
  g.arc(px + 2.5, baseY - 8.5, 3, 0, Math.PI * 2);
  g.arc(px, baseY - 11, 3.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = col.pot;
  g.beginPath();
  g.moveTo(px - 4, baseY - 6);
  g.lineTo(px + 4, baseY - 6);
  g.lineTo(px + 3, baseY);
  g.lineTo(px - 3, baseY);
  g.closePath();
  g.fill();
  g.lineWidth = 0.8;
  g.strokeStyle = col.ink;
  g.stroke();
}

function drawClothesLine(g, x0, x1, ly, clothes) {
  const col = CONFIG.colors;
  g.strokeStyle = col.ink;
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(x0, ly);
  g.quadraticCurveTo((x0 + x1) / 2, ly + 4, x1, ly);
  g.stroke();
  const n = clothes.length;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cx = lerp(x0 + 3, x1 - 3, t);
    const sag = 8 * t * (1 - t);
    const c = clothes[i];
    g.fillStyle = c.color;
    g.fillRect(cx - c.w / 2, ly + sag, c.w, c.h);
    g.strokeRect(cx - c.w / 2, ly + sag, c.w, c.h);
  }
}

function drawRailing(g, x0, x1, railTop, slabY) {
  const col = CONFIG.colors;
  g.strokeStyle = col.ink;
  g.lineWidth = 0.9;
  g.beginPath();
  for (let x = x0 + 2; x <= x1 - 1.5; x += 3.5) {
    g.moveTo(x, railTop);
    g.lineTo(x, slabY);
  }
  g.stroke();
  g.fillStyle = col.ink;
  g.fillRect(x0, railTop - 1, x1 - x0, 2);
  g.fillStyle = col.slab;
  g.fillRect(x0 - 2, slabY, x1 - x0 + 4, 3.5);
  g.lineWidth = 1;
  g.strokeRect(x0 - 2, slabY, x1 - x0 + 4, 3.5);
}

// Small front balcony over one or two lower windows
function drawFrontBalcony(g, blk, top, winW, winH) {
  const bal = blk.balcony;
  const rowTop = top + BH * blk.rows[blk.rows.length - 1];
  const x0 = blk.cols[bal.start] - winW / 2 - 5;
  const x1 = blk.cols[bal.start + bal.span - 1] + winW / 2 + 5;
  const slabY = rowTop + winH + 3;
  if (bal.item === 'laundry') drawClothesLine(g, x0 + 2, x1 - 2, rowTop + 1, bal.clothes);
  else if (bal.item === 'plant') drawPlant(g, lerp(x0 + 6, x1 - 6, bal.plantPos), slabY);
  drawRailing(g, x0, x1, rowTop + winH * 0.42, slabY);
}

// Balcony floor: balconies stick out on both sides
function drawSideBalconies(g, blk, top, winH) {
  const d = CONFIG.shapes.balcony.depth;
  const rowTop = top + BH * blk.rows[blk.rows.length - 1];
  const slabY = rowTop + winH + 3;
  const railTop = rowTop + winH * 0.25;
  const half = blk.width / 2;
  const sides = [[-half - d, -half, blk.sides.left], [half, half + d, blk.sides.right]];
  for (const [x0, x1, s] of sides) {
    // bracket under the slab
    g.fillStyle = CONFIG.colors.craneDark;
    g.beginPath();
    const inner = x0 < 0 ? x1 : x0;
    const outer = x0 < 0 ? x0 + 2 : x1 - 2;
    g.moveTo(inner, slabY + 3.5);
    g.lineTo(outer, slabY + 3.5);
    g.lineTo(inner, slabY + 9);
    g.closePath();
    g.fill();
    if (s.item === 'plant') drawPlant(g, (x0 + x1) / 2, slabY);
    drawRailing(g, x0 + (x0 < 0 ? 0 : -1), x1 + (x0 < 0 ? 1 : 0), railTop, slabY);
    if (s.item === 'laundry') {
      // towels hanging over the rail
      const c1 = s.clothes[0], c2 = s.clothes[1];
      g.fillStyle = c1.color;
      g.fillRect(x0 + 2, railTop - 1, 4, 8);
      g.strokeRect(x0 + 2, railTop - 1, 4, 8);
      g.fillStyle = c2.color;
      g.fillRect(x1 - 6, railTop - 1, 4, 6);
      g.strokeRect(x1 - 6, railTop - 1, 4, 6);
    }
  }
}

// Mansard roof floor: tiled slope with dormers on top, flat terrace roof
function drawRoofPart(g, blk, night, left, top) {
  const col = CONFIG.colors, R = CONFIG.shapes.roof;
  const w = blk.width;
  const eaveY = top + BH * R.eaveRatio;
  const inset = 9;
  g.beginPath();
  g.moveTo(left + inset, top);
  g.lineTo(left + w - inset, top);
  g.lineTo(left + w + 3, eaveY);
  g.lineTo(left - 3, eaveY);
  g.closePath();
  g.fillStyle = night ? shade(col.tile, -0.4) : col.tile;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = night ? shade(col.tileDark, -0.4) : col.tileDark;
  g.lineWidth = 1;
  g.beginPath();
  for (let y = top + 4; y < eaveY; y += 4.5) {
    g.moveTo(left - 4, y);
    g.lineTo(left + w + 4, y);
  }
  g.stroke();
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = col.ink;
  g.beginPath();
  g.moveTo(left + inset, top);
  g.lineTo(left + w - inset, top);
  g.lineTo(left + w + 3, eaveY);
  g.lineTo(left - 3, eaveY);
  g.closePath();
  g.stroke();
  // parapet of the terrace
  g.fillStyle = col.slab;
  g.fillRect(left + inset - 1, top, w - 2 * inset + 2, 3);
  g.strokeRect(left + inset - 1, top, w - 2 * inset + 2, 3);

  // dormers
  const dw = 12, dh = 10;
  for (let i = 0; i < R.dormerCols.length; i++) {
    const cx = R.dormerCols[i];
    const y = top + BH * 0.16;
    g.fillStyle = night ? shade(blk.color, -0.35) : blk.color;
    g.beginPath();
    g.moveTo(cx - dw / 2 - 3, y + 1);
    g.lineTo(cx, y - 6);
    g.lineTo(cx + dw / 2 + 3, y + 1);
    g.lineTo(cx + dw / 2 + 3, y + dh + 2);
    g.lineTo(cx - dw / 2 - 3, y + dh + 2);
    g.closePath();
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = col.ink;
    g.stroke();
    drawWindow(g, cx - dw / 2, y + 1, dw, dh - 1, blk.dormers[i], night);
  }
}

// Facade centered on (0, 0)
function drawFacade(g, blk, night) {
  const b = CONFIG.block, col = CONFIG.colors;
  const w = blk.width;
  const left = -w / 2, top = -BH / 2;
  const isRoof = blk.type === 'roof';
  const winH = BH * (isRoof ? CONFIG.shapes.roof.windowHeightRatio : b.windowHeightRatio);
  const winW = b.windowWidth;
  const wallTop = isRoof ? top + BH * CONFIG.shapes.roof.eaveRatio : top;

  g.fillStyle = night ? shade(blk.color, -0.35) : blk.color;
  g.fillRect(left, wallTop, w, top + BH - wallTop);
  if (!isRoof) {
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(left, top, w, 2);
  }

  // floor molding (kat silmesi)
  const mh = BH * b.moldingRatio;
  g.fillStyle = shade(blk.color, night ? -0.5 : -0.2);
  g.fillRect(left, top + BH - mh, w, mh);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(left, top + BH - mh, w, 1);

  let i = 0;
  for (const r of blk.rows) {
    for (const c of blk.cols) {
      drawWindow(g, c - winW / 2, top + BH * r, winW, winH, blk.windows[i++], night);
    }
  }
  if (blk.balcony) drawFrontBalcony(g, blk, top, winW, winH);

  g.lineWidth = 2;
  g.strokeStyle = col.ink;
  g.strokeRect(left, wallTop, w, top + BH - wallTop);

  if (isRoof) drawRoofPart(g, blk, night, left, top);
  if (blk.sides) drawSideBalconies(g, blk, top, winH);
}

function blockImage(blk) {
  const key = view.version + (game.nightOn ? 'n' : 'd');
  if (!blk.cache || blk.cacheKey !== key) {
    const pad = CONFIG.block.cachePad;
    const half = blockVisualHalf(blk);
    const night = game.nightOn;
    blk.cache = makeCache(half * 2 + pad * 2, BH + pad * 2, (g) => {
      g.translate(half + pad, BH / 2 + pad);
      drawFacade(g, blk, night);
    });
    blk.cacheKey = key;
  }
  return blk.cache;
}

function drawBlock(blk, x, y) {
  const pad = CONFIG.block.cachePad;
  const half = blockVisualHalf(blk);
  ctx.drawImage(blockImage(blk), x - half - pad, y - BH / 2 - pad, half * 2 + pad * 2, BH + pad * 2);
}

function drawBlockAt(blk, sx, sy, rot, alpha) {
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  ctx.rotate(rot);
  drawBlock(blk, 0, 0);
  ctx.restore();
}

// =====================================================================
// Static background caches: skyline layers, clouds, stars (+ crane)
// =====================================================================
const SKYLINE_GEOM = CONFIG.skyline.layers.map((L) => {
  const rnd = seededRandom(L.seed);
  const list = [];
  let x = 0;
  while (x < CONFIG.skyline.tileWidth - 12) {
    const w = lerp(L.minW, L.maxW, rnd());
    const h = lerp(L.minH, L.maxH, rnd());
    const roof = rnd();
    const lights = [];
    for (let wy = 6; wy < h - 6; wy += 7) {
      for (let wx = 4; wx < w - 5; wx += 6) if (rnd() < L.lights) lights.push([wx, wy]);
    }
    list.push({ x, w, h, roof, lights });
    x += w + 1 + rnd() * L.gap;
  }
  return list;
});
const SKYLINE_TILE_H = Math.max(...CONFIG.skyline.layers.map((l) => l.maxH)) + 24;

function buildStaticCaches() {
  const tile = CONFIG.skyline.tileWidth;
  caches.skyline = CONFIG.skyline.layers.map((L, li) =>
    L.colors.map((color, variant) =>
      makeCache(tile, SKYLINE_TILE_H, (g) => {
        g.fillStyle = color;
        for (const b of SKYLINE_GEOM[li]) {
          const y = SKYLINE_TILE_H - b.h;
          g.fillRect(b.x, y, b.w, b.h);
          if (b.roof < 0.2) g.fillRect(b.x + b.w * 0.5 - 0.75, y - 14, 1.5, 14);
          else if (b.roof < 0.42) g.fillRect(b.x + b.w * 0.2, y - 8, b.w * 0.6, 8);
          if (variant === 2) {
            g.fillStyle = 'rgba(255, 211, 107, 0.85)';
            for (const [wx, wy] of b.lights) g.fillRect(b.x + wx, y + wy, 2.2, 3);
            g.fillStyle = color;
          }
        }
      })
    )
  );

  const shapes = [
    [[20, 26, 14], [38, 18, 18], [58, 24, 15], [74, 28, 11]],
    [[18, 22, 12], [34, 16, 15], [50, 22, 12]],
    [[22, 24, 13], [42, 15, 17], [62, 20, 14], [80, 26, 10], [100, 27, 9]],
  ];
  caches.clouds = shapes.map((circles) => {
    const w = Math.max(...circles.map((c) => c[0] + c[2])) + 6;
    return {
      w,
      h: 46,
      img: makeCache(w, 46, (g) => {
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.beginPath();
        for (const [x, y, r] of circles) {
          g.moveTo(x + r, y);
          g.arc(x, y, r, 0, Math.PI * 2);
        }
        g.fill();
        g.fillRect(circles[0][0], 30, circles[circles.length - 1][0] - circles[0][0], 10);
        g.beginPath();
        g.arc(circles[0][0], 30, 10, 0, Math.PI * 2);
        g.arc(circles[circles.length - 1][0], 30, 10, 0, Math.PI * 2);
        g.fill();
      }),
    };
  });

  const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
  const srnd = seededRandom(99);
  caches.stars = makeCache(vw, vh, (g) => {
    g.fillStyle = CONFIG.colors.star;
    for (let i = 0; i < CONFIG.sky.starCount; i++) {
      const r = srnd() < 0.15 ? 1.4 : 0.8;
      g.globalAlpha = 0.5 + srnd() * 0.5;
      g.beginPath();
      g.arc(srnd() * vw, srnd() * vh * 0.8, r, 0, Math.PI * 2);
      g.fill();
    }
  });

  buildCraneCaches();
}

// =====================================================================
// Background drawing
// =====================================================================
function skyState(alt) {
  const keys = CONFIG.sky.keys;
  if (alt <= keys[0].floors) return { top: keys[0].top, bottom: keys[0].bottom, vA: keys[0].variant, vB: keys[0].variant, t: 0 };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (alt <= b.floors) {
      const t = (alt - a.floors) / (b.floors - a.floors);
      return { top: mixColor(a.top, b.top, t), bottom: mixColor(a.bottom, b.bottom, t), vA: a.variant, vB: b.variant, t };
    }
  }
  const k = keys[keys.length - 1];
  return { top: k.top, bottom: k.bottom, vA: k.variant, vB: k.variant, t: 0 };
}

function nightFactor() {
  const s = CONFIG.sky;
  return clamp01((game.skyAlt - s.starsFrom) / (s.starsFull - s.starsFrom));
}

function drawSky() {
  const s = skyState(game.skyAlt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, s.top);
  g.addColorStop(1, s.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return s;
}

function drawStars() {
  const k = nightFactor();
  if (k <= 0 || !caches.stars) return;
  ctx.globalAlpha = k;
  ctx.drawImage(caches.stars, view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.globalAlpha = 1;
}

function drawClouds() {
  const C = CONFIG.clouds;
  const spanY = view.y1 - view.y0 + 160;
  const spanX = view.x1 - view.x0 + 240;
  ctx.globalAlpha = lerp(1, C.nightAlpha, nightFactor());
  for (const c of game.clouds) {
    const sp = caches.clouds[c.shape];
    const x = view.x0 - 140 + mod(c.x - game.cam.x * C.parallaxX, spanX);
    const y = view.y0 - 80 + mod(c.y + game.cam.y * C.parallaxY, spanY);
    ctx.drawImage(sp.img, x, y, sp.w * c.scale, sp.h * c.scale);
  }
  ctx.globalAlpha = 1;
}

function drawSkyline(sky) {
  const layers = CONFIG.skyline.layers;
  const tile = CONFIG.skyline.tileWidth;
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const baseY = GY + game.cam.y * L.parallaxY; // sinks slowly as the camera rises
    if (baseY - SKYLINE_TILE_H > view.y1) continue;
    const shift = -game.cam.x * L.parallaxX;
    const kMin = Math.floor((view.x0 - 12 - shift) / tile);
    const kMax = Math.floor((view.x1 + 12 - shift) / tile);
    const imgA = caches.skyline[li][sky.vA];
    const imgB = caches.skyline[li][sky.vB];
    for (let k = kMin; k <= kMax; k++) {
      const x = k * tile + shift;
      ctx.drawImage(imgA, x, baseY - SKYLINE_TILE_H, tile, SKYLINE_TILE_H);
      if (sky.vB !== sky.vA && sky.t > 0) {
        ctx.globalAlpha = sky.t;
        ctx.drawImage(imgB, x, baseY - SKYLINE_TILE_H, tile, SKYLINE_TILE_H);
        ctx.globalAlpha = 1;
      }
    }
    if (baseY < view.y1) {
      ctx.fillStyle = mixColor(L.colors[sky.vA], L.colors[sky.vB], sky.t);
      ctx.fillRect(view.x0 - 12, baseY - 0.5, view.x1 - view.x0 + 24, view.y1 - baseY + 13);
    }
  }
}

function drawBirds() {
  if (!game.birds.length) return;
  ctx.strokeStyle = CONFIG.colors.bird;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const b of game.birds) {
    const wy = -3 + 4 * Math.sin(b.phase);
    ctx.moveTo(b.x - 6, b.y + wy);
    ctx.quadraticCurveTo(b.x - 3, b.y - 1, b.x, b.y + 1);
    ctx.quadraticCurveTo(b.x + 3, b.y - 1, b.x + 6, b.y + wy);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// =====================================================================
// World drawing
// =====================================================================
const cachedTowerBlocks = new Set();

function drawTower() {
  const [lo, hi] = visibleTowerRange();
  if (hi >= lo) {
    ctx.save();
    ctx.translate(toScreenX(PIVOT_X), toScreenY(PIVOT_Y));
    ctx.rotate(game.angle);
    for (let i = lo; i <= hi; i++) {
      const b = game.tower[i];
      const y = -(i + 0.5) * BH;
      drawBlock(b, b.cx, y);
      cachedTowerBlocks.add(b);
      if (b.flash > 0) {
        ctx.globalAlpha = (b.flash / CONFIG.effects.flashTime) * 0.7;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(b.cx - b.width / 2, y - BH / 2, b.width, BH);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  // release caches of blocks that scrolled out of view
  for (const b of cachedTowerBlocks) {
    if (b.index < lo || b.index > hi || game.tower[b.index] !== b) {
      cachedTowerBlocks.delete(b);
      if (game.tower[b.index] === b) b.cache = null;
    }
  }
}

function drawMovingBlocks() {
  for (const d of game.debris) drawBlockAt(d.block, toScreenX(d.x), toScreenY(d.y), d.rot);
  for (const m of game.missed) drawBlockAt(m.block, toScreenX(m.x), toScreenY(m.y), m.rot);
  const f = game.falling;
  if (f) drawBlockAt(f.block, toScreenX(f.x), toScreenY(f.y), f.rot);
}

function drawGround() {
  const gy = toScreenY(0);
  if (gy > view.y1) return;
  const k = nightFactor();
  ctx.fillStyle = mixColor(CONFIG.colors.ground, CONFIG.colors.groundNight, k);
  const m = 12; // margin so screen shake never reveals an edge
  ctx.fillRect(view.x0 - m, gy, view.x1 - view.x0 + 2 * m, view.y1 - gy + m);
  ctx.fillStyle = mixColor(CONFIG.colors.groundEdge, CONFIG.colors.groundNight, k * 0.7);
  ctx.fillRect(view.x0 - m, gy, view.x1 - view.x0 + 2 * m, 4);

  const fw = CONFIG.foundation.width, fh = CONFIG.foundation.height;
  const fx = toScreenX(PIVOT_X - fw / 2);
  const fy = toScreenY(fh);
  ctx.fillStyle = CONFIG.colors.foundation;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.lineWidth = 2;
  ctx.strokeStyle = CONFIG.colors.ink;
  ctx.strokeRect(fx, fy, fw, fh);
  hazardRect(ctx, fx, fy + fh - 6, fw, 6, 6);
}

function drawParticles() {
  for (const p of game.particles) {
    const k = p.t / p.life;
    const x = toScreenX(p.x), y = toScreenY(p.y);
    if (p.kind === 'spark') {
      const s = p.size * (1 - k * 0.5);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = CONFIG.colors.sparkle;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.3, y - s * 0.3);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x + s * 0.3, y + s * 0.3);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s * 0.3, y + s * 0.3);
      ctx.lineTo(x - s, y);
      ctx.lineTo(x - s * 0.3, y - s * 0.3);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.fillStyle = CONFIG.colors.dust;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (1 + k * 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// =====================================================================
// UI
// =====================================================================
function font(size) { return `bold ${size}px ${CONFIG.ui.font}`; }

function outlinedText(text, x, y, fill, stroke, lw) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawPopups(fg, outline) {
  const e = CONFIG.effects;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of game.popups) {
    const k = p.t / p.duration;
    const scale = p.t < 0.12 ? lerp(0.6, 1.12, p.t / 0.12) : lerp(1.12, 1, clamp01((p.t - 0.12) / 0.1));
    // screen-wide announcements stay solid longer
    ctx.globalAlpha = p.screen ? (k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4)) : Math.max(0, 1 - k * k);
    ctx.save();
    if (p.screen) ctx.translate(W / 2, p.sy - k * e.popupRise * 0.5);
    else ctx.translate(toScreenX(p.x), toScreenY(p.y) - k * e.popupRise);
    ctx.scale(scale, scale);
    ctx.font = font(p.size);
    outlinedText(p.text, 0, 0, p.color || fg, outline, 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawLifeIcon(x, y, alive) {
  ctx.globalAlpha = alive ? 1 : 0.25;
  ctx.fillStyle = CONFIG.colors.blocks[0];
  ctx.fillRect(x, y, 22, 14);
  ctx.fillStyle = CONFIG.colors.light;
  ctx.fillRect(x + 4, y + 4, 5, 5);
  ctx.fillRect(x + 13, y + 4, 5, 5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = CONFIG.colors.ink;
  ctx.strokeRect(x, y, 22, 14);
  ctx.globalAlpha = 1;
}

function drawSoundButton(fg, outline) {
  const b = SOUND_BUTTON, col = CONFIG.colors;
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
  ctx.fillStyle = 'rgba(255, 253, 247, 0.85)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = col.ink;
  ctx.stroke();
  const cx = b.x + 11, cy = b.y + b.h / 2;
  ctx.fillStyle = col.ink;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 3);
  ctx.lineTo(cx - 2, cy - 3);
  ctx.lineTo(cx + 3, cy - 8);
  ctx.lineTo(cx + 3, cy + 8);
  ctx.lineTo(cx - 2, cy + 3);
  ctx.lineTo(cx - 5, cy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (Sound.muted) {
    ctx.moveTo(cx + 7, cy - 4); ctx.lineTo(cx + 14, cy + 4);
    ctx.moveTo(cx + 14, cy - 4); ctx.lineTo(cx + 7, cy + 4);
  } else {
    ctx.arc(cx + 4, cy, 5, -0.9, 0.9);
    ctx.moveTo(cx + 4 + 9 * Math.cos(-0.9), cy + 9 * Math.sin(-0.9));
    ctx.arc(cx + 4, cy, 9, -0.9, 0.9);
  }
  ctx.stroke();

  // temporary debug: AudioContext state
  if (CONFIG.audio.showDebugState) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = font(10);
    outlinedText(`${TEXT.soundState}: ${Sound.stateLabel()}`, b.x - 5, b.y + b.h / 2, fg, outline, 3);
  }
}

function drawHUD(fg, outline) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(38);
  outlinedText(String(game.floors), W / 2, 42, fg, outline, 5);
  ctx.font = font(14);
  outlinedText(`${TEXT.score}: ${game.score}`, W / 2, 60, fg, outline, 4);

  for (let i = 0; i < CONFIG.lives; i++) drawLifeIcon(14 + i * 28, 13, i < game.lives);

  if (game.combo >= 2) {
    ctx.textAlign = 'left';
    ctx.font = font(15);
    outlinedText(`x${game.combo} ${TEXT.combo}`, 14, 46, fg, outline, 4);
  }
}

function dimScreen() {
  ctx.fillStyle = CONFIG.colors.overlay;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
}

function drawMenu() {
  const col = CONFIG.colors;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(36);
  outlinedText(TEXT.title, W / 2, 345, col.ink, col.light, 7);
  ctx.font = font(16);
  outlinedText(`${TEXT.best}: ${game.best}`, W / 2, 382, col.ink, col.light, 5);
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 300);
  ctx.font = font(18);
  outlinedText(TEXT.tapToStart, W / 2, 418, col.ink, col.light, 5);
  ctx.globalAlpha = 1;
}

function drawGameOver() {
  if (game.over.timer < 0) return;
  const col = CONFIG.colors;
  ctx.globalAlpha = Math.min(1, game.over.timer / 0.25);
  dimScreen();

  roundRectPath(ctx, 40, 160, 280, 320, 18);
  ctx.fillStyle = col.panel;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col.ink;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col.ink;
  ctx.font = font(26);
  ctx.fillText(game.over.reason === 'collapse' ? TEXT.overCollapse : TEXT.overLives, W / 2, 198);
  ctx.font = font(54);
  ctx.fillText(String(game.floors), W / 2, 256);
  ctx.font = font(15);
  ctx.fillText(TEXT.floors, W / 2, 290);
  ctx.font = font(20);
  ctx.fillText(`${TEXT.score}: ${game.score}`, W / 2, 322);
  ctx.font = font(15);
  ctx.fillText(`${TEXT.bestShort}: ${game.best}`, W / 2, 350);

  if (game.newRecord) {
    roundRectPath(ctx, W / 2 - 58, 366, 116, 26, 13);
    ctx.fillStyle = col.record;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = col.buttonText;
    ctx.font = font(15);
    ctx.fillText(TEXT.newRecord, W / 2, 380);
  }

  const b = GO_BUTTON;
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 14);
  ctx.fillStyle = col.button;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col.ink;
  ctx.stroke();
  ctx.fillStyle = col.buttonText;
  ctx.font = font(20);
  ctx.fillText(TEXT.playAgain, W / 2, b.y + b.h / 2 + 1);
  ctx.globalAlpha = 1;
}

function drawPaused() {
  dimScreen();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CONFIG.colors.light;
  ctx.font = font(30);
  ctx.fillText(TEXT.paused, W / 2, H / 2 - 16);
  ctx.font = font(17);
  ctx.fillText(TEXT.tapToResume, W / 2, H / 2 + 22);
}

function render() {
  const sky = drawSky();

  const s = view.dpr * view.scale;
  let sx = 0, sy = 0;
  if (game.shake > 0) { sx = rand(-1, 1) * game.shake; sy = rand(-1, 1) * game.shake; }
  ctx.setTransform(s, 0, 0, s, view.dpr * view.offX + sx * s, view.dpr * view.offY + sy * s);

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

  // UI is not shaken
  ctx.setTransform(s, 0, 0, s, view.dpr * view.offX, view.dpr * view.offY);
  const k = nightFactor();
  const fg = mixColor(CONFIG.colors.ink, CONFIG.colors.nightText, k);
  const outline = mixColor(CONFIG.colors.light, CONFIG.colors.nightOutline, k);
  drawPopups(fg, outline);

  if (game.state === State.MENU) drawMenu();
  else {
    drawHUD(fg, outline);
    if (game.state === State.GAME_OVER) drawGameOver();
  }
  drawSoundButton(fg, outline);
  if (game.paused) drawPaused();
}
