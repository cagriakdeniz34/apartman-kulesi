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
    // Kaçak kat (stage 5): unplastered illegal floor, heavier -> more tilt
    kacak: { chance: 0.08, minFloors: 8, tiltMul: 1.5, bonus: 40, rebarCols: [-38, -14, 14, 38], rebarHeight: 9 },
    roof: {
      every: 10,                 // every 10th floor is a mansard roof floor
      bonus: 50,
      windowRowsRatio: [0.6],
      windowHeightRatio: 0.24,
      eaveRatio: 0.5,
      dormerCols: [-24, 24],
    },
  },
  // Tapu (stage 5): every 25th floor, kaçak floors get plastered + painted
  tapu: { every: 25, bonusPerFloor: 30 },
  // Facade era by floor number (stage 5). Near a boundary the two styles mix
  // over `blend` floors on each side.
  eras: {
    list: [
      { from: 1, id: 'gecekondu' },
      { from: 10, id: 'apartman' },
      { from: 30, id: 'gokdelen' },
    ],
    blend: 2,
    gecekondu: {
      windowCols: [-25, 25],
      narrowWindowCols: [-16, 16],
      patchCount: 3,               // plaster patches
      stovePipeChance: 0.55,
      dishChance: 0.3,
      balconyChance: 0.2,
      rebarCols: [-30, 0, 30],     // rebars on the topmost gecekondu floor
    },
    apartman: { acChance: 0.35, dishChance: 0.18 },
    gokdelen: { mullionStep: 20, spandrelRatio: 0.5, balconyChance: 0.3 },
  },
  // Tenants move in when a floor lands; better landings attract better tenants.
  // Rent is a small score bonus only (no effect on tilt).
  tenants: {
    studentOffsetRatio: 0.3,     // |offset| / block width above this -> student
    eliteCombo: 2,               // perfect with combo >= this -> elite
    types: {
      student: { rent: 0, nightLit: 0.9, decoChance: 0.25, itemChance: 0.8 },
      family: { rent: 2, nightLit: 0.55, decoChance: 0.1, itemChance: 0.7 },
      teyze: { rent: 5, nightLit: 0.35, decoChance: 0.4, itemChance: 0.95 },
      elite: { rent: 10, nightLit: 0.7, decoChance: 0.35, itemChance: 0.9 },
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
  // Istanbul-inspired skyline (stage 5), far -> near. Colors: day, sunset, night.
  skyline: {
    tileWidth: 360,
    layers: [
      { kind: 'bosphorus', seed: 11, height: 150, parallaxX: 0.1, parallaxY: 0.08, lights: 0.1,
        colors: ['#C9DDE8', '#E2B9A4', '#27335C'], water: ['#A9CFE0', '#E3A98F', '#1A2549'] },
      { kind: 'historic', seed: 7, height: 170, parallaxX: 0.2, parallaxY: 0.15, lights: 0.2,
        colors: ['#AECADA', '#C9988C', '#1E284B'] },
      { kind: 'apartments', seed: 3, height: 104, minW: 22, maxW: 46, minH: 30, maxH: 92, gap: 5,
        parallaxX: 0.35, parallaxY: 0.25, lights: 0.3,
        colors: ['#93B8CC', '#A87C80', '#151C38'] },
    ],
  },
  clouds: { count: 7, minSpeed: 5, maxSpeed: 14, parallaxX: 0.3, parallaxY: 0.35, nightAlpha: 0.25 },
  birds: { minFloors: 15, minInterval: 5, maxInterval: 12, minFlock: 2, maxFlock: 4, minSpeed: 45, maxSpeed: 75 },
  audio: {
    volume: 0.6,
  },
  storage: {
    best: 'apartmanKulesi.best',
    muted: 'apartmanKulesi.muted',
    city: 'apartmanKulesi.city',   // neighborhood (stage 6), JSON
    look: 'apartmanKulesi.look',   // chosen cosmetics, JSON
    videoFail: 'apartmanKulesi.videoFail', // '1' once video recording failed on this device
  },
  // Sharing (stage 7): a 9:16 picture of the tower at its peak, and a short
  // collapse video re-rendered from a cheap state log (never recorded live).
  share: {
    minFloors: 1,                 // no share button for an empty tower
    url: 'cagriakdeniz34.github.io/apartman-kulesi',
    fileName: 'apartman-kulesi',
    card: {
      scale: 3,                   // 360x640 logical -> 1080x1920 px
      fullMaxFloors: 18,          // taller towers: top floors close up + full-height inset
      cropFloors: 12,
      prepareAt: 0.3,             // game-over overlay time when the picture is pre-rendered
    },
    video: {
      width: 720,
      height: 1280,
      fps: 30,
      bitrate: 4000000,
      sampleRate: 30,             // state samples per second while playing
      slowSampleRate: 60,         // ...and during the slow-motion part
      preRoll: 2.2,               // seconds before the collapse
      postRoll: 3.0,              // seconds after the collapse starts
      slowLen: 1.4,               // slow motion from the collapse start
      slowSpeed: 0.5,
      titleAt: 1.1,               // "Kule Yıkıldı!" appears this long after the collapse starts
      endCard: 1.8,               // the share picture at the end
      minBytes: 10000,            // smaller files are treated as a failed recording
    },
  },
  // Neighborhood meta game (stage 6). Purely cosmetic: no effect on gameplay.
  city: {
    minFloors: 5,                 // shorter games do not become buildings
    maxBuildings: 40,             // above this, kentsel dönüşüm demolishes the shortest
    protectTallest: 3,            // the 3 tallest + the record building are never demolished
    landmarkWidth: 64,
    lotWidth: 48,
    buildingWidth: 34,
    groundY: 548,                 // sidewalk top (screen)
    topY: 205,                    // the tallest building reaches up to here
    maxFloorH: 10,
    minFloorH: 1,
    windowMinFloorH: 4,           // below this, floors are drawn as plain bands
    friction: 5,                  // scroll inertia decay (1/s)
    tapSlop: 8,                   // finger movement still counted as a tap
    riseTime: 1.2,                // new building rising animation
    // Titles by total floors ever built; each unlocks one cosmetic and a landmark
    titles: [
      { floors: 0, name: 'Gecekondu mahallesi' },
      { floors: 60, name: 'Mahalle', unlock: 'crane:red', landmark: 'cay' },
      { floors: 150, name: 'Semt', unlock: 'palette:pastel', landmark: 'park' },
      { floors: 300, name: 'İlçe', unlock: 'crane:turquoise', landmark: 'metro' },
      { floors: 550, name: 'Şehir', unlock: 'palette:bogaz', landmark: 'cami' },
      { floors: 1000, name: 'Metropol', unlock: 'crane:purple', landmark: 'saat' },
    ],
  },
  cosmetics: {
    crane: [
      { id: 'classic', name: 'Sarı', yellow: '#F2B705', light: '#FFD84D', highlight: '#FFEBA3', shadow: '#A87A06' },
      { id: 'red', name: 'Kırmızı', yellow: '#D9452B', light: '#F06A4E', highlight: '#F7A08E', shadow: '#8E2A1A' },
      { id: 'turquoise', name: 'Turkuaz', yellow: '#1FA6A0', light: '#3CC7C0', highlight: '#9EE6E1', shadow: '#12706B' },
      { id: 'purple', name: 'Mor', yellow: '#7B4FA8', light: '#9C74C9', highlight: '#D6C2EE', shadow: '#4B2D6B' },
    ],
    palette: [
      { id: 'classic', name: 'Klasik', colors: ['#E07A5F', '#F2CC8F', '#81B29A', '#3D85C6', '#F4A261'] },
      { id: 'pastel', name: 'Pastel', colors: ['#F4B6A6', '#F7E1AE', '#B8DCC4', '#A9C8E8', '#F6C9A0'] },
      { id: 'bogaz', name: 'Boğaz', colors: ['#2F6F8F', '#5FA3B8', '#E9D8A6', '#94D2BD', '#EE9B00'] },
    ],
  },
  ui: {
    gameOverInputDelay: 0.4,
    font: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  colors: {
    blocks: ['#E07A5F', '#F2CC8F', '#81B29A', '#3D85C6', '#F4A261'],
    gecekondu: ['#D8C7A3', '#C9B6D3', '#A8C6B4', '#E2B3A0', '#B7CAD8'],
    gokdelen: ['#5FA8C8', '#4E8DAE', '#6CB5B1', '#7D9BC2'],
    briket: '#A9A59C',
    briketLine: '#8C887F',
    rebar: '#7A4E36',
    wood: '#8B5E3C',
    tin: '#9DA3AB',
    tinDark: '#727881',
    mullion: '#DDE7EE',
    mullionNight: '#56627A',
    glassPanelNight: '#24304D',
    sheet: '#F1EDE4',
    lace: 'rgba(255, 255, 255, 0.78)',
    drape: '#7A3B52',
    flag: ['#D7263D', '#F2C200', '#1F6FB5'],
    geranium: '#E5383B',
    pepper: '#C1121F',
    cat: ['#2B2D42', '#E08E45', '#8D8D8D', '#F4EEE0'],
    lamp: '#FFE7A8',
    acUnit: '#E9ECEF',
    signRed: '#C8102E',
    seagull: '#FFFFFF',
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
    hazard: '#F2B705',            // warning stripes (stay yellow whatever the crane color)
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
    road: '#5A5F6B',
    roadLine: '#E9E4D6',
    sidewalk: '#CFC8B8',
    curb: '#A69F8F',
    tree: '#6FA36A',
    treeDark: '#4E7F4B',
    trunk: '#7A5638',
    lamp: '#3F4350',
    button2: '#3D85C6',
    button3: '#81B29A',
    videoBg: '#1B1D2E',
    locked: '#B9B4A8',
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
  kacak: 'Kaçak kat!',
  kacakTag: 'KAÇAK',
  forSale: 'SATILIK',
  tapu: 'Tapu çıktı!',
  rent: 'kira',
  overCollapse: 'Kule Yıkıldı!',
  overLives: 'Canlar Bitti!',
  playAgain: 'Tekrar Oyna',
  paused: 'Duraklatıldı',
  tapToResume: 'Devam etmek için dokun',
  myCity: 'Mahallem',
  seeCity: 'Mahalleye bak',
  back: 'Geri',
  looks: 'Görünüm',
  close: 'Kapat',
  craneColor: 'Vinç rengi',
  blockPalette: 'Kat renkleri',
  newBuilding: 'Yeni bina!',
  renewal: 'Kentsel dönüşüm!',
  renewalLine: (f) => `${f} katlık bina yıkıldı`,
  newTitle: (t) => `Yeni unvan: ${t}!`,
  unlocked: (n) => `${n} açıldı`,
  emptyCity: 'Henüz bina yok.',
  emptyCityHint: '5 kat ve üstü kuleler buraya eklenir.',
  cityStats: (b, f) => `${b} bina · toplam ${f} kat`,
  nextTitle: (t, f) => `${t} için ${f} kat`,
  maxTitle: 'En yüksek unvan',
  floorsShort: 'kat',
  collapsed: 'Yıkıldı',
  livesOut: 'Canlar bitti',
  protectedTag: 'Korunuyor',
  recordTag: 'Rekor',
  tenantNames: { teyze: 'teyze', family: 'aile', student: 'öğrenci', elite: 'seçkin' },
  months: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  lockHint: 'Kilitli olanlar mahalle unvanıyla açılır',
  share: 'Paylaş',
  video: 'Video',
  videoMaking: 'Video hazırlanıyor…',
  videoReady: 'Video hazır!',
  shareVideo: 'Videoyu paylaş',
  cancel: 'İptal',
  videoFailed: 'Video oluşturulamadı',
  videoFailedHint: 'Bu cihazda görsel paylaşabilirsin.',
  imageSaved: 'Görsel indirildi',
  videoSaved: 'Video indirildi',
  fullHeight: 'tam boy',
  shareText: (f) => `Apartman Kulesi'nde ${f} katlık kule diktim!`,
};
