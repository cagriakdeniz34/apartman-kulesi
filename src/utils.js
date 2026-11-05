"use strict";

// =====================================================================
// Derived constants & small helpers (loaded right after config.js)
// =====================================================================
const DEG = Math.PI / 180;
const W = CONFIG.view.width;
const H = CONFIG.view.height;
const BW = CONFIG.block.width;
const BH = CONFIG.block.height;
const PIVOT_Y_SCREEN = CONFIG.crane.jibTop + CONFIG.crane.jibHeight + CONFIG.crane.trolleyDrop;
const REST_BOTTOM = PIVOT_Y_SCREEN + CONFIG.crane.ropeLength + CONFIG.crane.hookOffset + BH;
const TOP_TARGET_Y = REST_BOTTOM + CONFIG.layout.dropGap;
const GY = REST_BOTTOM + CONFIG.layout.firstDropGap + CONFIG.foundation.height; // ground screen y at rest
const PIVOT_X = W / 2;                    // tower pivot (world)
const PIVOT_Y = CONFIG.foundation.height; // top-center of the foundation
const GO_BUTTON = { x: 90, y: 404, w: 180, h: 52 };
const GO_CITY_BUTTON = { x: 105, y: 466, w: 150, h: 40 };
const MENU_CITY_BUTTON = { x: 115, y: 520, w: 130, h: 42 };
const SOUND_BUTTON = { x: 322, y: 8, w: 30, h: 30 };

const State = { MENU: 'MENU', PLAYING: 'PLAYING', GAME_OVER: 'GAME_OVER', CITY: 'CITY' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const mod = (a, n) => ((a % n) + n) % n;

function seededRandom(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}
// amount < 0 darkens towards black, > 0 lightens towards white
function shade(hex, amount) {
  return mixColor(hex, amount < 0 ? '#000000' : '#FFFFFF', Math.abs(amount));
}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

const Storage = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, String(value)); } catch (e) { /* storage unavailable */ }
  },
};
