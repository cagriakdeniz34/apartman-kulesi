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
// Eras: gecekondu (low floors), apartman, gokdelen (glass), kacak (illegal,
// unplastered until its tapu). Tenant details come from furnishBlock().
// =====================================================================

// Window contents: tenant decoration + curtain, clipped to the glass
function drawWindowInside(g, x, y, w, h, wd, night, glass) {
  const col = CONFIG.colors;
  if (wd.deco === 'cat') drawCat(g, x + w * 0.35, y + h, wd.decoColor, 0.8);
  else if (wd.deco === 'flag') {
    g.fillStyle = wd.decoColor;
    g.fillRect(x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.42);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(x + w * 0.2, y + h * 0.27, w * 0.6, h * 0.1);
  } else if (wd.deco === 'lamp') {
    g.fillStyle = 'rgba(255, 240, 200, 0.9)';
    g.beginPath();
    g.moveTo(x + w * 0.62, y + h * 0.2);
    g.lineTo(x + w * 0.86, y + h * 0.2);
    g.lineTo(x + w * 0.92, y + h * 0.42);
    g.lineTo(x + w * 0.56, y + h * 0.42);
    g.closePath();
    g.fill();
    g.fillStyle = col.ink;
    g.fillRect(x + w * 0.73, y + h * 0.42, 0.9, h * 0.58);
  }
  switch (wd.curtain) {
    case 'plain':
      g.fillStyle = wd.curtainColor;
      g.fillRect(x, y, w * 0.3, h);
      g.fillRect(x + w * 0.7, y, w * 0.3, h);
      g.fillRect(x, y, w, h * 0.16);
      break;
    case 'sheet': // a bed sheet pinned up as a curtain
      g.fillStyle = col.sheet;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w * 0.68, y + h * 0.08);
      g.lineTo(x + w * 0.6, y + h);
      g.lineTo(x, y + h);
      g.closePath();
      g.fill();
      break;
    case 'lace': { // tül: see-through with a scalloped hem
      g.fillStyle = glass ? 'rgba(255, 255, 255, 0.4)' : col.lace;
      g.fillRect(x, y, w, h * 0.78);
      g.beginPath();
      const n = 4, r = w / n / 2;
      for (let i = 0; i < n; i++) {
        const cx = x + r + i * r * 2;
        g.moveTo(cx + r, y + h * 0.78);
        g.arc(cx, y + h * 0.78, r, 0, Math.PI);
      }
      g.fill();
      g.fillStyle = 'rgba(200, 190, 175, 0.6)';
      for (let i = 0; i < 3; i++) g.fillRect(x + w * (0.2 + i * 0.3), y + h * 0.15, 1, h * 0.55);
      break;
    }
    case 'drape': // tied-back curtains + valance
      g.fillStyle = night ? shade(wd.curtainColor, -0.2) : wd.curtainColor;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w * 0.4, y);
      g.quadraticCurveTo(x + w * 0.05, y + h * 0.5, x + w * 0.22, y + h);
      g.lineTo(x, y + h);
      g.closePath();
      g.moveTo(x + w, y);
      g.lineTo(x + w * 0.6, y);
      g.quadraticCurveTo(x + w * 0.95, y + h * 0.5, x + w * 0.78, y + h);
      g.lineTo(x + w, y + h);
      g.closePath();
      g.fill();
      g.fillRect(x, y, w, h * 0.14);
      break;
  }
}

// Classic punched window (gecekondu / apartman / kaçak)
function drawWindow(g, x, y, w, h, wd, night, era, empty) {
  const col = CONFIG.colors;
  const raw = era === 'kacak';
  const frame = era === 'gecekondu' ? (night ? shade(col.wood, -0.45) : col.wood) : night ? col.frameNight : col.frame;
  if (!raw) {
    g.fillStyle = frame;
    g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  }
  if (raw && empty) { // bare opening, nobody lives here yet
    g.fillStyle = night ? '#1C1D22' : '#3B3A38';
    g.fillRect(x, y, w, h);
    return;
  }
  const lit = night ? wd.nightLit : wd.dayLit;
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
  drawWindowInside(g, x, y, w, h, wd, night);
  if (!raw) {
    g.fillStyle = frame;
    g.fillRect(x + w / 2 - 0.7, y, 1.4, h);
    g.fillRect(x, y + h * 0.42 - 0.6, w, 1.2);
    g.fillRect(x - 2.5, y + h + 1.5, w + 5, 1.8);
  }
  if (wd.deco === 'flowers') drawFlowerBox(g, x - 1, y + h + 1, w + 2);
  g.lineWidth = 1;
  g.strokeStyle = col.ink;
  if (raw) g.strokeRect(x, y, w, h);
  else g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
}

// ---------------------------------------------------------------------
// Small props
// ---------------------------------------------------------------------
function drawFlowerBox(g, x, y, w) {
  const col = CONFIG.colors;
  g.fillStyle = col.plant;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(x + 2.5 + i * (w - 5) / 3, y - 0.5, 2, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = col.geranium;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(x + 4 + i * (w - 8) / 2, y - 2, 1.4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = col.pot;
  g.fillRect(x, y, w, 3);
  g.lineWidth = 0.7;
  g.strokeStyle = col.ink;
  g.strokeRect(x, y, w, 3);
}

// Sitting cat seen from the front, baseY = what it sits on
function drawCat(g, cx, baseY, color, s) {
  const outline = color === CONFIG.colors.cat[3] || color === CONFIG.colors.cat[1];
  g.beginPath();
  g.ellipse(cx, baseY - 3.2 * s, 3 * s, 3.4 * s, 0, 0, Math.PI * 2);   // body
  g.moveTo(cx + 2.3 * s, baseY - 7.6 * s);
  g.arc(cx, baseY - 7.6 * s, 2.3 * s, 0, Math.PI * 2);                  // head
  g.moveTo(cx - 2.2 * s, baseY - 8.2 * s);                              // ears
  g.lineTo(cx - 1.9 * s, baseY - 11 * s);
  g.lineTo(cx - 0.4 * s, baseY - 9.8 * s);
  g.moveTo(cx + 2.2 * s, baseY - 8.2 * s);
  g.lineTo(cx + 1.9 * s, baseY - 11 * s);
  g.lineTo(cx + 0.4 * s, baseY - 9.8 * s);
  if (outline) {
    g.lineWidth = 1.2 * s;
    g.strokeStyle = CONFIG.colors.ink;
    g.stroke();
  }
  g.fillStyle = color;
  g.fill();
  g.beginPath();                                                        // tail
  g.moveTo(cx + 2.4 * s, baseY - 0.8 * s);
  g.quadraticCurveTo(cx + 6 * s, baseY - 1 * s, cx + 5.4 * s, baseY - 5 * s);
  if (outline) {
    g.lineWidth = 2.2 * s;
    g.strokeStyle = CONFIG.colors.ink;
    g.stroke();
  }
  g.strokeStyle = color;
  g.lineWidth = 1.1 * s;
  g.stroke();
}

function drawPot(g, px, baseY, wTop) {
  const col = CONFIG.colors;
  g.fillStyle = col.pot;
  g.beginPath();
  g.moveTo(px - wTop, baseY - 6);
  g.lineTo(px + wTop, baseY - 6);
  g.lineTo(px + wTop - 1, baseY);
  g.lineTo(px - wTop + 1, baseY);
  g.closePath();
  g.fill();
  g.lineWidth = 0.8;
  g.strokeStyle = col.ink;
  g.stroke();
}

function drawPlant(g, px, baseY) {
  g.fillStyle = CONFIG.colors.plant;
  g.beginPath();
  g.arc(px - 2.5, baseY - 8, 3, 0, Math.PI * 2);
  g.arc(px + 2.5, baseY - 8.5, 3, 0, Math.PI * 2);
  g.arc(px, baseY - 11, 3.2, 0, Math.PI * 2);
  g.fill();
  drawPot(g, px, baseY, 4);
}

// Sardunya: teyze's red geraniums
function drawGeranium(g, px, baseY) {
  drawPlant(g, px, baseY);
  g.fillStyle = CONFIG.colors.geranium;
  for (const [dx, dy] of [[-2.8, -10], [2.6, -11], [0, -13.5], [-0.5, -8.5]]) {
    g.beginPath();
    g.arc(px + dx, baseY + dy, 1.5, 0, Math.PI * 2);
    g.fill();
  }
}

// Tall potted plant (elite tenants)
function drawBigPlant(g, px, baseY) {
  const col = CONFIG.colors;
  g.strokeStyle = shade(col.plant, -0.25);
  g.fillStyle = col.plant;
  g.lineWidth = 1;
  for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
    g.beginPath();
    g.ellipse(px + Math.sin(a) * 4, baseY - 12 + Math.abs(a) * 3, 2.2, 6.5, a, 0, Math.PI * 2);
    g.fill();
  }
  drawPot(g, px, baseY, 4.5);
}

// Kurutmalık biber dizisi hanging down from y
function drawPeppers(g, x, y, len) {
  const col = CONFIG.colors;
  g.strokeStyle = col.ink;
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y + len);
  g.stroke();
  g.fillStyle = col.pepper;
  for (let t = 2; t < len; t += 2.6) {
    g.beginPath();
    g.ellipse(x + ((t / 2.6) % 2 ? 1 : -1), y + t, 1.1, 1.8, 0, 0, Math.PI * 2);
    g.fill();
  }
}

// Supporter banner thrown over the railing (students)
function drawBanner(g, x0, x1, railTop) {
  const col = CONFIG.colors;
  const w = Math.min(16, x1 - x0 - 4), x = (x0 + x1) / 2 - w / 2;
  g.fillStyle = col.flag[1];
  g.fillRect(x, railTop - 1, w, 9);
  g.fillStyle = col.flag[2];
  g.fillRect(x, railTop + 2, w, 3);
  g.lineWidth = 0.7;
  g.strokeStyle = col.ink;
  g.strokeRect(x, railTop - 1, w, 9);
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

function drawRailing(g, x0, x1, railTop, slabY, glass) {
  const col = CONFIG.colors;
  g.strokeStyle = col.ink;
  if (glass) {
    g.fillStyle = 'rgba(210, 235, 245, 0.55)';
    g.fillRect(x0, railTop, x1 - x0, slabY - railTop);
    g.lineWidth = 0.6;
    g.strokeRect(x0, railTop, x1 - x0, slabY - railTop);
  } else {
    g.lineWidth = 0.9;
    g.beginPath();
    for (let x = x0 + 2; x <= x1 - 1.5; x += 3.5) {
      g.moveTo(x, railTop);
      g.lineTo(x, slabY);
    }
    g.stroke();
  }
  g.fillStyle = glass ? col.mullion : col.ink;
  g.fillRect(x0, railTop - 1, x1 - x0, glass ? 1.5 : 2);
  g.fillStyle = col.slab;
  g.fillRect(x0 - 2, slabY, x1 - x0 + 4, 3.5);
  g.lineWidth = 1;
  g.strokeRect(x0 - 2, slabY, x1 - x0 + 4, 3.5);
}

// Balcony item behind the railing; px = preferred center
function drawBalconyItem(g, item, blk, x0, x1, px, rowTop, railTop, slabY, clothes) {
  switch (item) {
    case 'plant': drawPlant(g, px, slabY); break;
    case 'geranium': drawGeranium(g, px, slabY); break;
    case 'bigplant': drawBigPlant(g, px, slabY); break;
    case 'peppers': drawPeppers(g, x0 + 3, rowTop + 1, 13); drawPeppers(g, x1 - 3, rowTop + 1, 10); break;
    case 'laundry': if (clothes && x1 - x0 > 26) drawClothesLine(g, x0 + 2, x1 - 2, rowTop + 1, clothes); break;
  }
}

// Items in front of the railing
function drawBalconyFront(g, item, blk, x0, x1, px, railTop) {
  if (item === 'cat') drawCat(g, px, railTop - 1, blk.catColor, 1);
  else if (item === 'banner') drawBanner(g, x0, x1, railTop);
}

// Small front balcony over one or two lower windows
function drawFrontBalcony(g, blk, top, winW, winH, glass) {
  const bal = blk.balcony;
  const rowTop = top + BH * blk.rows[blk.rows.length - 1];
  const x0 = blk.cols[bal.start] - winW / 2 - 5;
  const x1 = blk.cols[bal.start + bal.span - 1] + winW / 2 + 5;
  const slabY = rowTop + winH + 3;
  const railTop = rowTop + winH * 0.42;
  const px = lerp(x0 + 6, x1 - 6, bal.itemPos);
  let item = bal.item;
  if (item === 'laundry' && bal.span < 2) item = 'plant';
  drawBalconyItem(g, item, blk, x0, x1, px, rowTop, railTop, slabY, bal.clothes);
  drawRailing(g, x0, x1, railTop, slabY, glass);
  drawBalconyFront(g, item, blk, x0, x1, px, railTop);
}

// Balcony floor: balconies stick out on both sides
function drawSideBalconies(g, blk, top, winH, glass) {
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
    const px = (x0 + x1) / 2;
    const item = s.item === 'peppers' ? 'geranium' : s.item;
    drawBalconyItem(g, item, blk, x0, x1, px, rowTop, railTop, slabY, null);
    drawRailing(g, x0 + (x0 < 0 ? 0 : -1), x1 + (x0 < 0 ? 1 : 0), railTop, slabY, glass);
    if (item === 'laundry') {
      // towels hanging over the rail
      const c1 = s.clothes[0], c2 = s.clothes[1];
      g.lineWidth = 1;
      g.strokeStyle = CONFIG.colors.ink;
      g.fillStyle = c1.color;
      g.fillRect(x0 + 2, railTop - 1, 4, 8);
      g.strokeRect(x0 + 2, railTop - 1, 4, 8);
      g.fillStyle = c2.color;
      g.fillRect(x1 - 6, railTop - 1, 4, 6);
      g.strokeRect(x1 - 6, railTop - 1, 4, 6);
    } else {
      drawBalconyFront(g, item, blk, x0 + 1, x1 - 1, px, railTop);
    }
  }
}

// ---------------------------------------------------------------------
// Roof floors
// ---------------------------------------------------------------------
// Mansard roof floor: tiled (or tin, for gecekondu) slope with dormers, flat terrace
function drawRoofPart(g, blk, night, left, top, era) {
  const col = CONFIG.colors, R = CONFIG.shapes.roof;
  const tin = era === 'gecekondu';
  const w = blk.width;
  const eaveY = top + BH * R.eaveRatio;
  const inset = 9;
  const slope = () => {
    g.beginPath();
    g.moveTo(left + inset, top);
    g.lineTo(left + w - inset, top);
    g.lineTo(left + w + 3, eaveY);
    g.lineTo(left - 3, eaveY);
    g.closePath();
  };
  slope();
  const fill = tin ? col.tin : col.tile, lines = tin ? col.tinDark : col.tileDark;
  g.fillStyle = night ? shade(fill, -0.4) : fill;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = night ? shade(lines, -0.4) : lines;
  g.lineWidth = 1;
  g.beginPath();
  if (tin) { // corrugated sheet
    for (let x = left - 2; x < left + w + 4; x += 3.5) {
      g.moveTo(x, top);
      g.lineTo(x, eaveY);
    }
  } else {
    for (let y = top + 4; y < eaveY; y += 4.5) {
      g.moveTo(left - 4, y);
      g.lineTo(left + w + 4, y);
    }
  }
  g.stroke();
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = col.ink;
  slope();
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
    drawWindow(g, cx - dw / 2, y + 1, dw, dh - 1, blk.dormers[i], night, era, !blk.tenant);
  }
}

// Skyscraper crown: set-back plant room with louvres and aviation lights
function drawCrown(g, blk, night, left, top) {
  const col = CONFIG.colors, R = CONFIG.shapes.roof;
  const w = blk.width;
  const eaveY = top + BH * R.eaveRatio;
  const inset = 10;
  const body = night ? '#3A4256' : '#8A94A6';
  g.fillStyle = body;
  g.fillRect(left + inset, top + 4, w - 2 * inset, eaveY - top - 4);
  g.strokeStyle = night ? '#2A3040' : '#6B7486';
  g.lineWidth = 1;
  g.beginPath();
  for (let y = top + 8; y < eaveY - 2; y += 3.5) {
    g.moveTo(left + inset + 3, y);
    g.lineTo(left + w - inset - 3, y);
  }
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = col.ink;
  g.strokeRect(left + inset, top + 4, w - 2 * inset, eaveY - top - 4);
  // roof slab + aviation lights
  g.fillStyle = col.slab;
  g.fillRect(left + inset - 3, top, w - 2 * inset + 6, 4);
  g.strokeRect(left + inset - 3, top, w - 2 * inset + 6, 4);
  g.fillStyle = col.warnLight;
  for (const x of [left + inset - 1, left + w - inset + 1]) {
    g.beginPath();
    g.arc(x, top + 1.5, 1.8, 0, Math.PI * 2);
    g.fill();
  }
  // ledge at the eave
  g.fillStyle = col.mullion;
  g.fillRect(left - 2, eaveY - 2, w + 4, 3);
  g.lineWidth = 1;
  g.strokeRect(left - 2, eaveY - 2, w + 4, 3);
}

// ---------------------------------------------------------------------
// Era-specific wall details
// ---------------------------------------------------------------------
// Satellite dish on a wall bracket, facing right (side = 1) or left (-1)
function drawDish(g, x, y, side) {
  const col = CONFIG.colors;
  g.strokeStyle = col.ink;
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(x - side * 3, y + 5);   // bracket
  g.lineTo(x, y + 1);
  g.moveTo(x, y);                  // feed arm
  g.lineTo(x + side * 6, y - 1.5);
  g.stroke();
  g.fillStyle = '#F2F3F5';
  g.beginPath();
  g.ellipse(x, y, 2.2, 5, side * 0.3, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = col.ink;
  g.fillRect(x + side * 6 - 1, y - 2.5, 2, 2);
}

function drawStovePipe(g, side, half, top) {
  const col = CONFIG.colors;
  const x0 = side * half, x1 = side * (half + 5);
  const y0 = top + BH * 0.55, yTop = top + BH * 0.1;
  g.strokeStyle = col.craneSteel;
  g.lineWidth = 2.6;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y0);
  g.lineTo(x1, yTop);
  g.stroke();
  g.lineJoin = 'miter';
  g.fillStyle = col.craneDark;
  g.fillRect(x1 - 3, yTop - 1.5, 6, 2);
}

function drawAcUnit(g, x, y) {
  const col = CONFIG.colors;
  g.fillStyle = col.acUnit;
  g.fillRect(x, y, 10, 8);
  g.lineWidth = 0.8;
  g.strokeStyle = col.ink;
  g.strokeRect(x, y, 10, 8);
  g.beginPath();
  g.arc(x + 5, y + 4, 2.6, 0, Math.PI * 2);
  g.stroke();
}

// Unplastered briquette wall with running bond
function drawBriket(g, left, top, w, night) {
  const col = CONFIG.colors;
  g.fillStyle = night ? shade(col.briket, -0.45) : col.briket;
  g.fillRect(left, top, w, BH);
  g.strokeStyle = night ? shade(col.briketLine, -0.45) : col.briketLine;
  g.lineWidth = 0.7;
  g.beginPath();
  let row = 0;
  for (let y = top + 6; y < top + BH; y += 6, row++) {
    g.moveTo(left, y);
    g.lineTo(left + w, y);
    for (let x = left + (row % 2 ? 6 : 0); x < left + w; x += 12) {
      g.moveTo(x, y - 6);
      g.lineTo(x, y);
    }
  }
  g.stroke();
}

function drawForSaleSign(g, top) {
  const col = CONFIG.colors;
  const w = 32, h = 11, x = -w / 2, y = top + BH * 0.6;
  g.fillStyle = '#FFFFFF';
  g.fillRect(x, y, w, h);
  g.lineWidth = 1;
  g.strokeStyle = col.signRed;
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.strokeStyle = col.ink;
  g.strokeRect(x, y, w, h);
  g.fillStyle = col.signRed;
  g.font = `bold 6.5px ${CONFIG.ui.font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(TEXT.forSale, 0, y + h / 2 + 0.5);
}

// Rebars (filiz demiri) sticking out of a top floor, "for the next floor"
function drawRebars(g, blk, cx, topY) {
  const S = CONFIG.shapes.kacak;
  const cols = blk.era === 'kacak' ? S.rebarCols : CONFIG.eras.gecekondu.rebarCols;
  g.strokeStyle = CONFIG.colors.rebar;
  g.lineWidth = 1.3;
  g.beginPath();
  for (let i = 0; i < cols.length; i++) {
    const x = cx + cols[i] * blk.width / BW;
    const lean = ((i * 7) % 5 - 2) * 0.6;
    const h = S.rebarHeight * (0.75 + ((i * 3) % 4) * 0.1);
    g.moveTo(x, topY + 1);
    g.lineTo(x + lean, topY - h);
    if (i % 2 === 0) g.lineTo(x + lean + 2.5, topY - h - 1);
  }
  g.stroke();
}

// Glass curtain wall (gökdelen). Panels map onto the tenant's windows.
function drawGlassWall(g, blk, night, left, wallTop, bottom) {
  const col = CONFIG.colors, Gk = CONFIG.eras.gokdelen;
  const w = blk.width;
  const nCols = Math.max(2, Math.round(w / Gk.mullionStep));
  const pw = w / nCols;
  const spandrel = BH * 0.12;
  const glassBottom = bottom - spandrel;
  const rowsN = blk.type === 'roof' ? 1 : 2;
  const ph = (glassBottom - wallTop) / rowsN;
  const base = night ? col.glassPanelNight : blk.color;
  const empty = !blk.tenant;
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < nCols; c++) {
      const wd = blk.windows[(r % blk.rows.length) * blk.cols.length + Math.floor(c * blk.cols.length / nCols)];
      const x = left + c * pw, y = wallTop + r * ph;
      const lit = !empty && (night ? wd.nightLit : wd.dayLit) && (c + r) % 2 === 0;
      g.fillStyle = lit ? col.lit : shade(base, ((c * 13 + r * 7) % 5) * 0.025);
      g.fillRect(x, y, pw, ph);
      if (!empty && (c + r) % 2 === 0) {
        g.save();
        g.beginPath();
        g.rect(x, y, pw, ph);
        g.clip();
        const inner = { ...wd, deco: wd.deco === 'flowers' ? null : wd.deco };
        drawWindowInside(g, x + 1, y + 1, pw - 2, ph - 1, inner, night, true);
        if (wd.deco === 'flowers') drawPlant(g, x + pw * 0.5, y + ph);
        g.restore();
      }
    }
  }
  if (!night) { // sky reflections
    g.save();
    g.beginPath();
    g.rect(left, wallTop, w, glassBottom - wallTop);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (const o of [0.1, 0.55]) {
      g.beginPath();
      g.moveTo(left + w * o, glassBottom);
      g.lineTo(left + w * o + 26, wallTop);
      g.lineTo(left + w * o + 36, wallTop);
      g.lineTo(left + w * o + 10, glassBottom);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  // spandrel (floor slab band) + mullions
  g.fillStyle = night ? shade(base, -0.3) : shade(blk.color, -0.32);
  g.fillRect(left, glassBottom, w, spandrel);
  g.fillStyle = night ? col.mullionNight : col.mullion;
  for (let c = 1; c < nCols; c++) g.fillRect(left + c * pw - 0.6, wallTop, 1.2, glassBottom - wallTop);
  for (let r = 1; r < rowsN; r++) g.fillRect(left, wallTop + r * ph - 0.6, w, 1.2);
  g.fillRect(left, glassBottom - 0.8, w, 1.6);
}

// Facade centered on (0, 0)
function drawFacade(g, blk, night) {
  const b = CONFIG.block, col = CONFIG.colors;
  const w = blk.width;
  const left = -w / 2, top = -BH / 2;
  const isRoof = blk.type === 'roof';
  // a kaçak floor with its tapu is plastered and painted like an apartman
  const era = blk.era === 'kacak' && blk.legal ? 'apartman' : blk.era;
  const color = blk.era === 'kacak' ? blk.paint : blk.color;
  const winH = BH * (isRoof ? CONFIG.shapes.roof.windowHeightRatio : b.windowHeightRatio);
  const winW = b.windowWidth;
  const wallTop = isRoof ? top + BH * CONFIG.shapes.roof.eaveRatio : top;
  const empty = !blk.tenant;

  if (era === 'gokdelen') {
    drawGlassWall(g, blk, night, left, wallTop, top + BH);
    if (blk.balcony) drawFrontBalcony(g, blk, top, winW, winH, true);
    g.lineWidth = 2;
    g.strokeStyle = col.ink;
    g.strokeRect(left, wallTop, w, top + BH - wallTop);
    if (isRoof) drawCrown(g, blk, night, left, top);
    if (blk.sides) drawSideBalconies(g, blk, top, winH, true);
    return;
  }

  if (era === 'kacak') {
    drawBriket(g, left, top, w, night);
  } else {
    g.fillStyle = night ? shade(color, -0.35) : color;
    g.fillRect(left, wallTop, w, top + BH - wallTop);
    if (era === 'gecekondu') { // patchy plaster
      for (const p of blk.patches) {
        g.fillStyle = shade(color, (p.light ? 0.12 : -0.1) - (night ? 0.3 : 0));
        g.fillRect(p.x * w, wallTop + p.y * (top + BH - wallTop), p.w * w, p.h * BH);
      }
    } else if (!isRoof) {
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(left, top, w, 2);
    }
  }

  // floor molding (kat silmesi); kaçak floors have a raw slab instead
  const mh = BH * b.moldingRatio;
  g.fillStyle = era === 'kacak' ? (night ? '#4E4E50' : '#8F9295') : shade(color, night ? -0.5 : -0.2);
  g.fillRect(left, top + BH - mh, w, mh);
  if (era !== 'kacak') {
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(left, top + BH - mh, w, 1);
  }

  let i = 0;
  for (const r of blk.rows) {
    for (const c of blk.cols) {
      drawWindow(g, c - winW / 2, top + BH * r, winW, winH, blk.windows[i++], night, era, empty);
    }
  }
  if (blk.ac) drawAcUnit(g, blk.ac * (w / 2 - 6) - 5, top + BH * 0.56);
  if (blk.dish) drawDish(g, blk.dish.x * w, top + BH * blk.dish.y, blk.dish.x > 0 ? -1 : 1);
  if (blk.balcony) drawFrontBalcony(g, blk, top, winW, winH, false);
  if (era === 'kacak') drawForSaleSign(g, top);

  g.lineWidth = 2;
  g.strokeStyle = col.ink;
  g.strokeRect(left, wallTop, w, top + BH - wallTop);

  if (era === 'gecekondu' && !isRoof) { // tin eave along the top
    g.fillStyle = night ? shade(col.tin, -0.4) : col.tin;
    g.fillRect(left - 3, top, w + 6, 4);
    g.lineWidth = 1;
    g.strokeRect(left - 3, top, w + 6, 4);
    g.strokeStyle = col.tinDark;
    g.lineWidth = 0.6;
    g.beginPath();
    for (let x = left; x < left + w + 3; x += 3) { g.moveTo(x, top + 0.5); g.lineTo(x, top + 3.5); }
    g.stroke();
  }
  if (blk.pipe) drawStovePipe(g, blk.pipe, w / 2, top);
  if (isRoof) drawRoofPart(g, blk, night, left, top, era);
  if (blk.sides) drawSideBalconies(g, blk, top, winH, false);
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
  if (blk.era === 'kacak' && !blk.legal) drawRebars(ctx, blk, 0, -BH / 2);
  ctx.restore();
}

// =====================================================================
// Static background caches: skyline layers, clouds, stars (+ crane)
// =====================================================================
// Istanbul-inspired skyline tiles (inspired by, not copies of, real buildings).
// Geometry comes from a seeded random so every color variant matches.
const SKYLINE_TILE_H = Math.max(...CONFIG.skyline.layers.map((l) => l.height)) + 24;
const NIGHT_LIGHT = 'rgba(255, 211, 107, 0.85)';

// Far: the strait, the far shore's hills and a suspension bridge
function drawBosphorusTile(g, L, variant) {
  const T = CONFIG.skyline.tileWidth, Ht = SKYLINE_TILE_H;
  const color = L.colors[variant], night = variant === 2;
  const waterY = Ht - 14;
  const hill = (x) => {
    const a = (x / T) * Math.PI * 2;
    return 26 + 10 * Math.sin(a) + 6 * Math.sin(2 * a + 1) + 3 * Math.sin(3 * a + 2);
  };
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, waterY);
  for (let x = 0; x <= T; x += 6) g.lineTo(x, waterY - hill(x));
  g.lineTo(T, waterY);
  g.closePath();
  g.fill();
  // little houses on the hills
  const rnd = seededRandom(L.seed);
  for (let x = 4; x < T - 8; x += 7 + rnd() * 9) {
    const h = 4 + rnd() * 7;
    g.fillRect(x, waterY - hill(x + 2) - h + 2, 5 + rnd() * 3, h);
  }

  // bridge
  const deckY = waterY - 22;
  const towers = [110, 250], towerTop = waterY - 100;
  g.fillRect(14, deckY, T - 28, 3);
  for (const tx of towers) {
    g.fillRect(tx - 4, towerTop, 2.4, waterY - towerTop);
    g.fillRect(tx + 1.6, towerTop, 2.4, waterY - towerTop);
    for (const y of [towerTop + 4, towerTop + 34, deckY + 4]) g.fillRect(tx - 4, y, 8, 2);
  }
  const cableAt = (x) => {
    if (x < towers[0]) return lerp(deckY, towerTop, (x - 14) / (towers[0] - 14)) + 6 * Math.sin(Math.PI * (x - 14) / (towers[0] - 14));
    if (x > towers[1]) return lerp(towerTop, deckY, (x - towers[1]) / (T - 14 - towers[1])) + 6 * Math.sin(Math.PI * (x - towers[1]) / (T - 14 - towers[1]));
    const u = (x - towers[0]) / (towers[1] - towers[0]);
    return towerTop + (deckY - 6 - towerTop) * 4 * u * (1 - u);
  };
  g.strokeStyle = color;
  g.lineWidth = 1.4;
  g.beginPath();
  for (let x = 14; x <= T - 14; x += 3) {
    if (x === 14) g.moveTo(x, cableAt(x));
    else g.lineTo(x, cableAt(x));
  }
  g.stroke();
  g.lineWidth = 0.5;
  g.beginPath();
  for (let x = 20; x < T - 18; x += 7) {
    g.moveTo(x, cableAt(x));
    g.lineTo(x, deckY);
  }
  g.stroke();

  // water with ripples
  g.fillStyle = L.water[variant];
  g.fillRect(0, waterY, T, Ht - waterY);
  g.fillStyle = night ? 'rgba(255, 220, 140, 0.5)' : 'rgba(255, 255, 255, 0.45)';
  const wr = seededRandom(L.seed + 1);
  for (let i = 0; i < 14; i++) g.fillRect(wr() * (T - 14), waterY + 3 + wr() * (Ht - waterY - 5), 6 + wr() * 8, 1);

  if (night) {
    g.fillStyle = NIGHT_LIGHT;
    for (let x = 18; x < T - 14; x += 9) {
      g.fillRect(x, deckY - 1, 1.6, 1.6);
      g.fillRect(x, cableAt(x) - 0.8, 1.4, 1.4);
    }
    g.fillStyle = CONFIG.colors.warnLight;
    for (const tx of towers) g.fillRect(tx - 1, towerTop - 2, 2, 2);
    const lr = seededRandom(L.seed + 2);
    g.fillStyle = NIGHT_LIGHT;
    for (let x = 6; x < T - 6; x += 5) if (lr() < L.lights * 3) g.fillRect(x, waterY - hill(x) * lr() - 2, 1.5, 1.5);
  }
}

// Cascading domes + slender minarets
function drawMosque(g, cx, baseY, s, minarets, night) {
  const bodyW = 90 * s, bodyH = 30 * s;
  g.fillRect(cx - bodyW / 2, baseY - bodyH, bodyW, bodyH);
  const dome = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, Math.PI, 0);
    g.closePath();
    g.fill();
  };
  // small corner domes, half domes, drum + main dome, finial
  dome(cx - bodyW / 2 + 9 * s, baseY - bodyH, 7 * s);
  dome(cx + bodyW / 2 - 9 * s, baseY - bodyH, 7 * s);
  dome(cx - 22 * s, baseY - bodyH, 16 * s);
  dome(cx + 22 * s, baseY - bodyH, 16 * s);
  g.fillRect(cx - 24 * s, baseY - bodyH - 12 * s, 48 * s, 12 * s);
  dome(cx, baseY - bodyH - 12 * s, 24 * s);
  g.fillRect(cx - 0.7, baseY - bodyH - 36 * s - 9 * s, 1.4, 9 * s);
  for (const [dx, h] of minarets) {
    const x = cx + dx * s, top = baseY - h * s;
    g.fillRect(x - 2 * s, top, 4 * s, h * s);
    for (const k of [0.25, 0.45]) g.fillRect(x - 3.5 * s, top + h * s * k, 7 * s, 2 * s);
    g.beginPath();
    g.moveTo(x - 2.4 * s, top);
    g.lineTo(x, top - 16 * s);
    g.lineTo(x + 2.4 * s, top);
    g.closePath();
    g.fill();
  }
  if (night) {
    const keep = g.fillStyle;
    g.fillStyle = NIGHT_LIGHT;
    for (const [dx, h] of minarets) {
      const x = cx + dx * s, top = baseY - h * s;
      for (const k of [0.25, 0.45]) g.fillRect(x - 3.5 * s, top + h * s * k + 2 * s, 7 * s, 1);
    }
    for (let i = 0; i < 5; i++) g.fillRect(cx - 30 * s + i * 15 * s, baseY - bodyH * 0.55, 3 * s, 5 * s);
    g.fillStyle = keep;
  }
}

// Round stone tower with a gallery and a conical cap
function drawConeTower(g, cx, baseY, night) {
  const bodyW = 20, bodyH = 80;
  g.beginPath();
  g.moveTo(cx - bodyW / 2 - 2, baseY);
  g.lineTo(cx - bodyW / 2, baseY - bodyH);
  g.lineTo(cx + bodyW / 2, baseY - bodyH);
  g.lineTo(cx + bodyW / 2 + 2, baseY);
  g.closePath();
  g.fill();
  const galY = baseY - bodyH;
  g.fillRect(cx - 14, galY - 4, 28, 4);           // gallery
  g.fillRect(cx - 9, galY - 18, 18, 14);          // top drum
  g.beginPath();                                  // cone
  g.moveTo(cx - 12, galY - 18);
  g.lineTo(cx, galY - 50);
  g.lineTo(cx + 12, galY - 18);
  g.closePath();
  g.fill();
  g.fillRect(cx - 0.6, galY - 56, 1.2, 7);
  if (night) {
    const keep = g.fillStyle;
    g.fillStyle = NIGHT_LIGHT;
    for (const dx of [-6, -1, 4]) g.fillRect(cx + dx, galY - 15, 2.4, 6);
    for (const y of [30, 55]) g.fillRect(cx - 1.2, baseY - y, 2.4, 4);
    g.fillStyle = keep;
  }
}

// Middle: the historic skyline over a band of low houses
function drawHistoricTile(g, L, variant) {
  const T = CONFIG.skyline.tileWidth, Ht = SKYLINE_TILE_H;
  const night = variant === 2;
  g.fillStyle = L.colors[variant];
  const rnd = seededRandom(L.seed), lr = seededRandom(L.seed + 5);
  const houses = [];
  for (let x = 0; x < T;) {
    const w = 12 + rnd() * 16, h = 14 + rnd() * 20;
    houses.push([x, w, h]);
    g.fillRect(x, Ht - h, w, h);
    if (rnd() < 0.5) { // pitched roof
      g.beginPath();
      g.moveTo(x, Ht - h);
      g.lineTo(x + w / 2, Ht - h - 6);
      g.lineTo(x + w, Ht - h);
      g.closePath();
      g.fill();
    }
    x += w + 1;
  }
  drawMosque(g, 92, Ht - 20, 1, [[-58, 128], [58, 128], [-44, 104], [44, 104]], night);
  drawConeTower(g, 214, Ht - 18, night);
  drawMosque(g, 300, Ht - 16, 0.62, [[-50, 118], [50, 118]], night);
  if (night) {
    g.fillStyle = NIGHT_LIGHT;
    for (const [x, w, h] of houses) {
      for (let wy = 5; wy < h - 4; wy += 6) {
        for (let wx = 3; wx < w - 3; wx += 5) if (lr() < L.lights) g.fillRect(x + wx, Ht - h + wy, 1.8, 2.4);
      }
    }
  }
}

// Near: dense apartment blocks with chimneys, antennas and dishes
function drawApartmentsTile(g, L, variant) {
  const T = CONFIG.skyline.tileWidth, Ht = SKYLINE_TILE_H;
  const night = variant === 2;
  g.fillStyle = L.colors[variant];
  const rnd = seededRandom(L.seed), lr = seededRandom(L.seed + 5);
  const list = [];
  for (let x = 0; x < T - 12;) {
    const w = lerp(L.minW, L.maxW, rnd());
    const h = lerp(L.minH, L.maxH, rnd());
    const roof = rnd(), extra = rnd();
    list.push([x, w, h]);
    const y = Ht - h;
    g.fillRect(x, y, w, h);
    if (roof < 0.2) g.fillRect(x + w * 0.5 - 0.75, y - 14, 1.5, 14);               // antenna
    else if (roof < 0.38) g.fillRect(x + w * 0.2, y - 8, w * 0.6, 8);              // stair house
    else if (roof < 0.56) {                                                         // gable
      g.beginPath();
      g.moveTo(x - 1, y);
      g.lineTo(x + w / 2, y - 9);
      g.lineTo(x + w + 1, y);
      g.closePath();
      g.fill();
    } else if (roof < 0.72) {                                                       // dish
      g.beginPath();
      g.ellipse(x + w * 0.7, y - 3, 3, 2.2, -0.5, 0, Math.PI * 2);
      g.fill();
    }
    if (extra < 0.6) g.fillRect(x + w * (0.12 + extra * 0.5), y - 6, 3, 6);       // chimney
    if (extra > 0.75) g.fillRect(x + w * 0.3, y - 5, w * 0.35, 1);                  // antenna bar
    x += w + 1 + rnd() * L.gap;
  }
  if (night) {
    g.fillStyle = NIGHT_LIGHT;
    for (const [x, w, h] of list) {
      for (let wy = 6; wy < h - 6; wy += 7) {
        for (let wx = 4; wx < w - 5; wx += 6) if (lr() < L.lights) g.fillRect(x + wx, Ht - h + wy, 2.2, 3);
      }
    }
  }
}

function drawSkylineTile(g, L, variant) {
  if (L.kind === 'bosphorus') drawBosphorusTile(g, L, variant);
  else if (L.kind === 'historic') drawHistoricTile(g, L, variant);
  else drawApartmentsTile(g, L, variant);
}

function buildStaticCaches() {
  const tile = CONFIG.skyline.tileWidth;
  caches.skyline = CONFIG.skyline.layers.map((L) =>
    L.colors.map((color, variant) => makeCache(tile, SKYLINE_TILE_H, (g) => drawSkylineTile(g, L, variant)))
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
      const under = L.water || L.colors;
      ctx.fillStyle = mixColor(under[sky.vA], under[sky.vB], sky.t);
      ctx.fillRect(view.x0 - 12, baseY - 0.5, view.x1 - view.x0 + 24, view.y1 - baseY + 13);
    }
  }
}

// Seagulls (martı): white wings with a dark edge
function drawBirds() {
  if (!game.birds.length) return;
  ctx.beginPath();
  for (const b of game.birds) {
    const wy = -3 + 4 * Math.sin(b.phase);
    ctx.moveTo(b.x - 7, b.y + wy);
    ctx.quadraticCurveTo(b.x - 3, b.y - 2, b.x, b.y + 1);
    ctx.quadraticCurveTo(b.x + 3, b.y - 2, b.x + 7, b.y + wy);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONFIG.colors.bird;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = CONFIG.colors.seagull;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
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
    const top = game.tower[hi];
    if (hi === game.tower.length - 1 && top.type !== 'roof' && (top.era === 'gecekondu' || (top.era === 'kacak' && !top.legal))) {
      drawRebars(ctx, top, top.cx, -(hi + 1) * BH);
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
