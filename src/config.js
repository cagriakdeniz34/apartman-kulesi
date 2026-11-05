"use strict";

// =====================================================================
// CONFIG — every tunable value lives here
// =====================================================================
const CONFIG = {
  view: { width: 360, height: 640 },
  // Screen layout is derived from the hanging block's resting bottom edge,
  // so changing block height / rope length keeps the same fall distances.
  layout: {
    dropGap: 98,         // resting block bottom -> tower top target (screen)
    firstDropGap: 134,   // resting block bottom -> foundation top at game start
  },
  physics: { gravity: 1800, fixedStep: 1 / 240, maxFrameDt: 0.1 },
  crane: {
    pivotX: 180,
    jibTop: 74,
    jibHeight: 16,
    trolleyDrop: 8,              // rope pivot below the jib's bottom chord
    backEndX: 2,                 // rear end of the counter-jib
    tipX: 352,                   // front end of the jib
    panelWidth: 18,              // jib lattice panel width
    mastX: 40,                   // mast center
    mastWidth: 24,
    mastPanel: 24,               // mast lattice panel height
    cabin: { x: 58, w: 28, h: 19 },
    counterweight: { x: 4, w: 24, h: 18 },
    ropeLength: 120,
    ropeRetractedLength: 60,
    ropeRate: 12,
    hookOffset: 16,              // rope end (hook bowl) -> block top
    slingLugX: 22,               // sling attachment points on the block top
    hookTwistFactor: 0.12,       // hook turns against the swing velocity
    hookTwistMax: 0.35,
    hookWobble: 0.05,
    maxAngleDeg: 30,
    swingSpeed: 1.6,             // rad/s
    amplitudeRate: 1.5,
    blockRotationFactor: 0.35,
    spawnDelay: 0.3,
    fadeInTime: 0.25,
    releaseRotationDamping: 20,
    flagX: 324,
    lightBlinkPeriod: 1.2,       // warning light (night only)
  },
  block: {
    height: 62,                  // floor height — the whole facade scales with it
    width: 100,
    windowCols: [-30, 0, 30],    // window centers, relative to block center
    windowRowsRatio: [0.12, 0.5],// window tops, fraction of block height
    windowHeightRatio: 0.27,
    windowWidth: 18,
    moldingRatio: 0.08,
    curtainChance: 0.22,
    litChance: 0.12,
    nightLitChance: 0.55,
    balconyChance: 0.38,         // small front balcony on regular floors
    balconyItemChance: 0.6,
    cachePad: 3,
  },
  // Floor shapes (stage 3). Landing rule: a block stays if its center is
  // over the floor below (|offset| <= width of the floor below / 2).
  shapes: {
    narrow: { chance: 0.14, minFloors: 6, widthRatio: 0.76, windowCols: [-16, 16], bonus: 5 },
    balcony: { chance: 0.18, minFloors: 3, depth: 13, bonus: 5 },
    roof: {
      every: 10,                 // every 10th floor is a mansard roof floor
      bonus: 50,
      windowRowsRatio: [0.6],
      windowHeightRatio: 0.24,
      eaveRatio: 0.5,
      dormerCols: [-24, 24],
    },
  },
  foundation: { width: 140, height: 24 },
  tower: {
    tiltFactorDeg: 6,
    maxTiltDeg: 15,
    perfectThresholdRatio: 0.06,
    perfectTiltReduction: 0.25,
  },
  difficulty: {
    table: [
      { floors: 10, swingSpeedMul: 1.15 },
      { floors: 20, maxAngleDeg: 38 },
      { floors: 30, towerSway: true },
      { floors: 40, wind: true },
      { floors: 50, swingSpeedMul: 1.15 },
      { floors: 60, night: true },
    ],
    towerSwayRatio: 0.3,
    towerSwaySpeed: 1.2,
    towerSwayRamp: 0.6,
    windAngleDeg: 8,
    windChangeEvery: 10,
    windRate: 0.8,
  },
  quake: {
    minFloors: 15,
    chance: 0.12,                // per landing, once allowed
    cooldownFloors: 12,
    startDelay: 0.8,
    duration: 4.5,
    swayDeg: 2,                  // extra shaking of the tower angle
    swayFreq: 14,                // rad/s
    tiltPushDeg: 0.7,            // tilt pushed outward per second
    shake: 3.5,                  // screen shake
    bonus: 150,
  },
  lives: 3,
  score: { normal: 10, perfectBase: 25, perfectComboBonus: 10 },
  camera: { followRate: 5 },
  miss: { spinSpeed: 5, pushSpeed: 60, nextSpawnDelay: 0.5, gameOverDelay: 0.9 },
  collapse: {
    toppleTime: 0.55,
    toppleStartSpeed: 0.3,
    toppleAccel: 3,
    maxSpeed: 520,
    randomSpeed: 90,
    spinRandom: 2,
    groundBounce: 0.25,
    groundFriction: 0.6,
    gameOverDelay: 1.6,
    shake: 8,
  },
  effects: {
    sparkleCount: 14,
    sparkleSpeed: 170,
    sparkleLife: 0.6,
    flashTime: 0.3,
    dustCount: 6,
    dustLife: 0.45,
    shakeDecay: 7,
    popupDuration: 0.9,
    popupRise: 45,
  },
  sky: {
    keys: [
      { floors: 0,  top: '#BFE3F5', bottom: '#F7F3E8', variant: 0 },
      { floors: 20, top: '#AEDBF2', bottom: '#F5EEDD', variant: 0 },
      { floors: 40, top: '#7C86C4', bottom: '#F6A867', variant: 1 },
      { floors: 60, top: '#0D1530', bottom: '#2B3B6E', variant: 2 },
    ],
    rate: 1.5,
    starsFrom: 46,
    starsFull: 60,
    starCount: 80,
  },
  skyline: {
    tileWidth: 360,
    layers: [ // far -> near
      { seed: 11, minW: 20, maxW: 40, minH: 90, maxH: 210, gap: 4, parallaxX: 0.1, parallaxY: 0.08, lights: 0.12,
        colors: ['#D3E5EE', '#E7BFA6', '#2A3762'] },
      { seed: 7, minW: 24, maxW: 44, minH: 60, maxH: 150, gap: 6, parallaxX: 0.2, parallaxY: 0.15, lights: 0.22,
        colors: ['#B5D1DF', '#CC9C8F', '#1F294D'] },
      { seed: 3, minW: 26, maxW: 50, minH: 34, maxH: 100, gap: 8, parallaxX: 0.35, parallaxY: 0.25, lights: 0.3,
        colors: ['#98BDD0', '#AA7F83', '#161D3A'] },
    ],
  },
  clouds: { count: 7, minSpeed: 5, maxSpeed: 14, parallaxX: 0.3, parallaxY: 0.35, nightAlpha: 0.25 },
  birds: { minFloors: 15, minInterval: 5, maxInterval: 12, minFlock: 2, maxFlock: 4, minSpeed: 45, maxSpeed: 75 },
  audio: {
    volume: 0.6,
  },
  storage: { best: 'apartmanKulesi.best', muted: 'apartmanKulesi.muted' },
  ui: {
    gameOverInputDelay: 0.4,
    font: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  colors: {
    blocks: ['#E07A5F', '#F2CC8F', '#81B29A', '#3D85C6', '#F4A261'],
    ink: '#2B2D42',
    light: '#FFF8E7',
    nightText: '#F4F1E8',
    nightOutline: '#1A2140',
    frame: '#F4EEE0',
    frameNight: '#8A8F9E',
    glass: '#A7D3E8',
    glassNight: '#2C3A5C',
    lit: '#FFD36B',
    curtains: ['#B5524A', '#5D7FA3', '#E6B655', '#8A6FAD', '#F1EDE4'],
    laundry: ['#FFFFFF', '#F28482', '#84A59D', '#F6BD60', '#7FB3D5'],
    pot: '#C8643B',
    plant: '#5E9E5A',
    slab: '#E4DED0',
    tile: '#B5523B',
    tileDark: '#8E3B2A',
    craneYellow: '#F2B705',
    craneLight: '#FFD84D',
    craneHighlight: '#FFEBA3',
    craneShadow: '#A87A06',
    craneDark: '#4A4E5A',
    craneSteel: '#6B7080',
    hazardDark: '#1E1F26',
    concrete: '#9AA0AA',
    concreteDark: '#737985',
    operator: '#2B2D42',
    warnLight: '#FF3B30',
    warnLightDay: '#D93A2F',
    warnLightOff: '#6E2420',
    rope: '#3A3D4A',
    ground: '#A3B18A',
    groundEdge: '#7F8C6A',
    groundNight: '#3E4A3A',
    foundation: '#5C6378',
    star: '#FFFFFF',
    bird: '#3A3D4A',
    sparkle: '#FFF3B0',
    dust: '#EDE6D6',
    overlay: 'rgba(43, 45, 66, 0.5)',
    panel: '#FFFDF7',
    button: '#E07A5F',
    buttonText: '#FFFFFF',
    record: '#81B29A',
    quake: '#C8553D',
  },
};

// UI strings (Turkish)
const TEXT = {
  title: 'Apartman Kulesi',
  tapToStart: 'Başlamak için dokun',
  best: 'En yüksek puan',
  bestShort: 'En yüksek',
  newRecord: 'Yeni rekor!',
  perfect: 'Mükemmel!',
  combo: 'Combo',
  score: 'Puan',
  floors: 'Kat',
  roof: 'Çatı katı!',
  quake: 'DEPREM!',
  quakeSurvived: 'Depreme dayandı!',
  overCollapse: 'Kule Yıkıldı!',
  overLives: 'Canlar Bitti!',
  playAgain: 'Tekrar Oyna',
  paused: 'Duraklatıldı',
  tapToResume: 'Devam etmek için dokun',
};
