"use strict";

// =====================================================================
// Game state, flow (MENU -> PLAYING -> GAME_OVER), input, main loop
// =====================================================================
const game = {
  state: State.MENU,
  paused: false,
  time: 0,
  tower: [],          // block objects; block.cx = center x in tower-local space
  tilt: 0,            // accumulated tilt (radians, + = right)
  sway: 0,            // self-sway on top of the tilt (30+ floors)
  swayPhase: 0,
  swayRamp: 0,
  angle: 0,           // tilt + sway + quake: the angle the tower is drawn/collided with
  lives: CONFIG.lives,
  score: 0,
  combo: 0,
  floors: 0,
  best: parseInt(Storage.get(CONFIG.storage.best, '0'), 10) || 0,
  newRecord: false,
  diff: difficultyAt(0),
  swing: { phase: 0, amp: CONFIG.crane.maxAngleDeg * DEG, wind: 0, windTarget: 0, angle: 0, angVel: 0 },
  quake: null,
  falling: null,
  missed: [],
  debris: [],
  particles: [],
  popups: [],
  birds: [],
  birdTimer: 6,
  clouds: [],
  cam: { x: 0, y: 0 },
  shake: 0,
  skyAlt: 0,
  nightOn: false,
  collapsing: null,
  crane: { block: null, fadeT: 1, pending: false, spawnTimer: 0, ropeLen: CONFIG.crane.ropeLength, hookTwist: 0 },
  blockSeq: 0,
  tenantCounts: { student: 0, family: 0, teyze: 0, elite: 0 }, // per game (for the city meta, stage 6)
  over: { reason: '', timer: 0 },
  cityEvent: null,   // what the last game did to the neighborhood
};

// Clear the world (tower, effects, camera) for a new game or the menu
function resetWorld() {
  game.tower = [];
  game.tilt = 0;
  game.sway = 0;
  game.swayRamp = 0;
  game.angle = 0;
  game.lives = CONFIG.lives;
  game.score = 0;
  game.combo = 0;
  game.floors = 0;
  game.newRecord = false;
  game.tenantCounts = { student: 0, family: 0, teyze: 0, elite: 0 };
  game.diff = difficultyAt(0);
  game.nightOn = false;
  game.swing.windTarget = 0;
  resetQuake();
  game.falling = null;
  game.missed = [];
  game.debris = [];
  game.particles = [];
  game.popups = [];
  game.birds = [];
  game.collapsing = null;
  game.cam.x = 0;
  game.cam.y = 0;
  game.skyAlt = 0;
}

function startGame() {
  resetWorld();
  Share.onGameStart();
  game.state = State.PLAYING;
  if (!game.crane.block) requestSpawn(0.15);
}

function backToMenu() {
  resetWorld();
  game.state = State.MENU;
  if (!game.crane.block) {
    game.crane.pending = false;
    game.crane.block = makeBlock('normal');
    game.crane.fadeT = 0;
  }
}

function endGame(reason, delay) {
  game.state = State.GAME_OVER;
  game.over.reason = reason;
  game.over.timer = -delay; // overlay appears when timer reaches 0
  recordBuilding();          // the tower is still standing here
  Share.onGameEnd(reason);   // share picture snapshot / replay marker
  if (game.score > game.best) {
    game.best = game.score;
    game.newRecord = true;
    Storage.set(CONFIG.storage.best, game.best);
  }
}

function initClouds() {
  game.clouds = [];
  for (let i = 0; i < CONFIG.clouds.count; i++) {
    game.clouds.push({
      x: rand(0, 800),
      y: rand(0, 820),
      speed: rand(CONFIG.clouds.minSpeed, CONFIG.clouds.maxSpeed),
      shape: i % 3,
      scale: rand(0.7, 1.25),
    });
  }
}

function updateCamera(dt) {
  if (game.state !== State.PLAYING) return;
  const top = towerTop();
  const targetX = top.x - W / 2;
  const targetY = Math.max(0, top.y - (GY - TOP_TARGET_Y));
  const k = 1 - Math.exp(-CONFIG.camera.followRate * dt);
  game.cam.x += (targetX - game.cam.x) * k;
  game.cam.y += (targetY - game.cam.y) * k;
}

function updateEffects(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.t += dt;
    if (p.t >= p.life) { game.particles.splice(i, 1); continue; }
    if (p.kind === 'spark') p.vy -= 300 * dt;
    else { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = game.popups.length - 1; i >= 0; i--) {
    game.popups[i].t += dt;
    if (game.popups[i].t > game.popups[i].duration) game.popups.splice(i, 1);
  }
  const top = game.tower[game.tower.length - 1];
  if (top && top.flash > 0) top.flash = Math.max(0, top.flash - dt);
  game.shake *= Math.exp(-CONFIG.effects.shakeDecay * dt);
  if (game.shake < 0.05) game.shake = 0;
}

function updateBackground(dt) {
  game.skyAlt += (game.floors - game.skyAlt) * (1 - Math.exp(-CONFIG.sky.rate * dt));
  for (const c of game.clouds) c.x += c.speed * dt;

  const B = CONFIG.birds;
  if (game.state === State.PLAYING && game.floors >= B.minFloors && nightFactor() < 0.8) {
    game.birdTimer -= dt;
    if (game.birdTimer <= 0) {
      game.birdTimer = rand(B.minInterval, B.maxInterval);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y = rand(150, 420);
      const speed = rand(B.minSpeed, B.maxSpeed);
      const n = B.minFlock + Math.floor(Math.random() * (B.maxFlock - B.minFlock + 1));
      for (let i = 0; i < n; i++) {
        game.birds.push({
          x: (dir > 0 ? view.x0 - 20 : view.x1 + 20) - dir * i * rand(12, 20),
          y: y + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 8 + rand(-3, 3),
          dir, speed: speed * rand(0.92, 1.08), phase: rand(0, 6),
        });
      }
    }
  }
  for (let i = game.birds.length - 1; i >= 0; i--) {
    const b = game.birds[i];
    b.x += b.dir * b.speed * dt;
    b.phase += 11 * dt;
    b.y += Math.sin(b.phase * 0.25) * 6 * dt;
    if ((b.dir > 0 && b.x > view.x1 + 200) || (b.dir < 0 && b.x < view.x0 - 200)) game.birds.splice(i, 1);
  }
}

function step(dt) {
  game.time += dt;
  updateSwing(dt);
  updateQuake(dt);
  updateTowerSway(dt);
  updateCrane(dt);
  updateFalling(dt);
  updateCollapse(dt);
  updateMissed(dt);
  updateDebris(dt);
  updateEffects(dt);
  updateBackground(dt);
  updateCamera(dt);
  if (game.state === State.GAME_OVER) game.over.timer += dt;
  if (game.state === State.CITY) updateCity(dt);
  Replay.tick(dt);
}

// =====================================================================
// Input
// =====================================================================
function handlePress(x, y, fromKey) {
  if (Share.ui) return; // the video overlay reacts on release (shareTap)
  if (game.paused) { game.paused = false; Sound.resume(); return; }
  if (!fromKey && inRect(x, y, SOUND_BUTTON)) { Sound.toggleMute(); return; }
  switch (game.state) {
    case State.MENU:
      if (!fromKey && inRect(x, y, MENU_CITY_BUTTON)) enterCity(null);
      else startGame();
      break;
    case State.PLAYING:
      tryDrop();
      break;
    case State.GAME_OVER:
      if (game.over.timer < CONFIG.ui.gameOverInputDelay) return;
      if (!fromKey && Share.hit(x, y)) return; // share buttons act on release (shareTap)
      if (fromKey || inRect(x, y, GO_BUTTON)) startGame();
      else if (inRect(x, y, GO_CITY_BUTTON)) enterCity(game.cityEvent);
      break;
    case State.CITY:
      if (fromKey) cityKey('Enter');
      else cityPointerDown(x, y);
      break;
  }
}

// Gameplay reacts on pointerdown (no delay)...
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (e.button !== undefined && e.button > 0) return; // primary button / touch only
  const p = clientToLogical(e.clientX, e.clientY);
  handlePress(p.x, p.y, false);
});

// Neighborhood screen: drag to scroll, tap on release
canvas.addEventListener('pointermove', (e) => {
  if (game.state !== State.CITY) return;
  const p = clientToLogical(e.clientX, e.clientY);
  cityPointerMove(p.x);
});
canvas.addEventListener('pointerup', (e) => {
  if (game.state !== State.CITY) return;
  const p = clientToLogical(e.clientX, e.clientY);
  cityPointerUp(p.x, p.y, false);
});
// Share buttons and the video overlay: navigator.share() needs a user-activation
// event, so they react on release. Touch uses touchend (counts on iOS and Android),
// mouse/pen use pointerup.
function shareTap(clientX, clientY) {
  const p = clientToLogical(clientX, clientY);
  if (Share.ui) { Share.overlayTap(p.x, p.y); return; }
  if (game.state !== State.GAME_OVER || game.paused || game.over.timer < CONFIG.ui.gameOverInputDelay) return;
  const h = Share.hit(p.x, p.y);
  if (h === 'image') Share.shareImage();
  else if (h === 'video') Share.startVideo();
}
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch' || (e.button !== undefined && e.button > 0)) return;
  shareTap(e.clientX, e.clientY);
});
canvas.addEventListener('touchend', (e) => {
  const t = e.changedTouches && e.changedTouches[0];
  if (t) shareTap(t.clientX, t.clientY);
}, { passive: true });
canvas.addEventListener('pointercancel', () => { if (game.state === State.CITY) cityPointerUp(0, 0, true); });
canvas.addEventListener('wheel', (e) => {
  if (game.state !== State.CITY) return;
  e.preventDefault();
  cityWheel((e.deltaX || e.deltaY) * 0.6);
}, { passive: false });

// ...but audio can only be unlocked from user-activation events.
// On touch screens that is pointerup/touchend, not pointerdown/touchstart.
const unlockAudio = () => Sound.unlock();
['pointerup', 'touchend', 'click', 'keydown'].forEach((type) =>
  window.addEventListener(type, unlockAudio, { capture: true, passive: true }));

window.addEventListener('keydown', (e) => {
  if (Share.ui) {
    if (e.code === 'Escape') { if (Share.recording) Share.cancelVideo(); else Share.closeOverlay(); }
    e.preventDefault();
    return;
  }
  if (game.state === State.CITY && !game.paused && ['Escape', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
    cityKey(e.code);
  } else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (e.repeat) return;
    handlePress(0, 0, true);
  } else if (e.code === 'KeyM' && !e.repeat) {
    Sound.toggleMute();
  }
});

// Block scrolling, pinch/double-tap zoom and the context menu
const noDefault = (e) => e.preventDefault();
document.addEventListener('touchstart', noDefault, { passive: false });
document.addEventListener('touchmove', noDefault, { passive: false });
document.addEventListener('gesturestart', noDefault);
document.addEventListener('dblclick', noDefault);
document.addEventListener('contextmenu', noDefault);

// =====================================================================
// Main loop
// =====================================================================
let lastTime = performance.now();
let accumulator = 0;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === State.PLAYING) game.paused = true;
    if (Share.recording) Share.cancelVideo(); // rAF stops while hidden
    Sound.suspend();
  } else {
    lastTime = performance.now();
    accumulator = 0;
    Sound.resume(); // contexts are often suspended/interrupted while hidden
  }
});
window.addEventListener('pageshow', () => Sound.resume());

function frame(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt < 0) dt = 0;
  if (dt > CONFIG.physics.maxFrameDt) dt = CONFIG.physics.maxFrameDt;

  if (!game.paused) {
    const stepDt = CONFIG.physics.fixedStep;
    accumulator += dt;
    while (accumulator >= stepDt) {
      step(stepDt);
      accumulator -= stepDt;
    }
  }
  Share.update(dt);
  if (Share.ui) Share.renderUI();
  else render();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  if (Share.rec) Share.resizePending = true; // the video renders with its own view; resize afterwards
  else resize();
});
resetQuake();
City.load();
loadLook();
applyLook();
resize();
initClouds();
game.crane.block = makeBlock('normal');
requestAnimationFrame(frame);
