/* 01-data.js — 공통 도구 · 게임 데이터(도시·개량) · 저장 · 소리 · 진행 상태
 * 로드 순서: 01-data → 02-engine → 03-city → 04-game (index.html). 네 파일은 전역 스코프를 공유한다. */
'use strict';
/* ================= 공통 도구 ================= */
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a),
  ri = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp = (a, b, t) => a + (b - a) * t;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e12) return (n / 1e12).toFixed(n >= 1e13 ? 0 : 1) + '조';
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + '억';
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '만';
  return n.toLocaleString('ko-KR');
}

/* ================= 게임 데이터 ================= */
const UNLOCK = 0.35;
const CITIES = [
  {
    name: '느티 마을',
    hp: 1,
    val: 1,
    hMin: 2,
    hMax: 6,
    dens: 0.5,
    night: false,
    bg: '#bcd6ec',
    ground: '#7f9d55',
    road: '#6b6d70',
    lot: '#cbc4b4',
    sun: [0xfff0d0, 0.9],
    hemi: [0xdcecff, 0x5f6b3c, 0.72],
    wall: ['#efe4cf', '#e2cdb0', '#d4bf9f', '#f3ece0', '#c8b79c'],
    roof: ['#b5523b', '#8a4a3a', '#4f6a8a', '#9a6b45'],
    lit: ['#ffe7a3'],
    dark: '#55667a',
  },
  {
    name: '버들강 소도시',
    hp: 2.5,
    val: 3,
    hMin: 3,
    hMax: 11,
    dens: 0.6,
    night: false,
    bg: '#c3d6e9',
    ground: '#7f965f',
    road: '#5f6266',
    lot: '#c4c1b9',
    sun: [0xfff3dc, 0.9],
    hemi: [0xdde8f5, 0x5d6648, 0.72],
    wall: ['#dcd8ce', '#c9bba5', '#bcc5cc', '#e6ddcb', '#aeb7ad'],
    roof: ['#6e7380', '#8a5a48', '#4d5f73'],
    lit: ['#ffe9b0'],
    dark: '#4d5d70',
  },
  {
    name: '갈매기 항구',
    hp: 6,
    val: 8,
    hMin: 3,
    hMax: 16,
    dens: 0.68,
    night: false,
    bg: '#bfe0ec',
    ground: '#8b9c6c',
    road: '#5a5e63',
    lot: '#cfccc2',
    sun: [0xfff6e6, 0.95],
    hemi: [0xe2f2ff, 0x5a6650, 0.72],
    wall: ['#eef2f4', '#a6c8da', '#ecd6b4', '#cf8463', '#86a8bd'],
    roof: ['#3f6f8f', '#c4573f', '#d8d8d8'],
    lit: ['#fff0bf'],
    dark: '#3e5a70',
  },
  {
    name: '청람 메트로',
    hp: 15,
    val: 22,
    hMin: 5,
    hMax: 26,
    dens: 0.8,
    night: false,
    bg: '#c7d0de',
    ground: '#7c8673',
    road: '#4f5358',
    lot: '#bdbdbb',
    sun: [0xfff1e0, 0.9],
    hemi: [0xdfe6f2, 0x55594f, 0.74],
    wall: ['#adb8c8', '#8f9eb3', '#cad0d9', '#74839a', '#d8dde5'],
    roof: ['#4a5568', '#5e6b7d', '#3a4250'],
    lit: ['#d4ebff'],
    dark: '#34445c',
  },
  {
    name: '네온 메가시티',
    hp: 40,
    val: 60,
    hMin: 6,
    hMax: 36,
    dens: 0.86,
    night: true,
    bg: '#2c2550',
    ground: '#3d3b4f',
    road: '#26252f',
    lot: '#4a4858',
    sun: [0xb9a0ff, 0.55],
    hemi: [0x8a7cc8, 0x2a2438, 0.62],
    wall: ['#4a4f80', '#64488a', '#37628c', '#57466e', '#767ca0'],
    roof: ['#26294a', '#2f2440'],
    lit: ['#ff5ad1', '#5af0ff', '#ffe45a'],
    dark: '#1d2236',
  },
  {
    name: '궤도 도시 아르카',
    hp: 110,
    val: 180,
    hMin: 8,
    hMax: 44,
    dens: 0.9,
    night: true,
    bg: '#0d1433',
    ground: '#272d4a',
    road: '#171b2e',
    lot: '#343b5c',
    sun: [0xbfd8ff, 0.6],
    hemi: [0x6f88c8, 0x1c2036, 0.62],
    wall: ['#d9e2f0', '#aebbd4', '#8fa0c0', '#eef3fa'],
    roof: ['#5c6c90', '#45506e'],
    lit: ['#7df9ff', '#b5fff0'],
    dark: '#24304e',
  },
];
const PAD_LIGHT = { bg: '#cfe2ef', sun: [0xfff1da, 0.95], hemi: [0xe2efff, 0x63724a, 0.72] };

const UPG = [
  {
    id: 'radius',
    name: '폭발 반경',
    desc: '불덩이가 더 넓게 퍼집니다. 미사일 몸통도 굵어져요.',
    max: 25,
    base: 30,
    g: 1.55,
    val: l => 3.2 + 0.42 * l,
    fmt: v => Math.round(v * 10) + 'm',
  },
  {
    id: 'power',
    name: '화약 위력',
    desc: '단단한 건물도 한 번에 부숩니다. 큰 도시일수록 필수예요.',
    max: 30,
    base: 40,
    g: 1.75,
    val: l => 1.45 ** l,
    fmt: v => '×' + (v < 100 ? v.toFixed(1) : fmt(v)),
  },
  {
    id: 'ammo',
    name: '탄두 수',
    desc: '한 번 출격에 떨어뜨릴 탄두 수. 보조 부스터가 붙어요.',
    max: 9,
    base: 80,
    g: 2.1,
    val: l => 3 + l,
    fmt: v => v + '발',
  },
  {
    id: 'scope',
    name: '정밀 유도',
    desc: '추가 탄두가 터치한 지점에 더 정확히 떨어집니다.',
    max: 5,
    base: 40,
    g: 1.9,
    val: l => [5, 3.6, 2.4, 1.4, 0.6, 0][l],
    fmt: v => (v ? '오차 ' + Math.round(v * 10) + 'm' : '오차 없음'),
  },
  {
    id: 'pierce',
    name: '관통 탄두',
    desc: '지붕을 뚫고 들어가 건물 속에서 터집니다. 꼬리 날개가 생겨요.',
    max: 10,
    base: 120,
    g: 1.75,
    val: l => l,
    fmt: v => v + '칸',
  },
  {
    id: 'cluster',
    name: '집속 자탄',
    desc: '터질 때 작은 폭탄이 사방으로 흩어집니다.',
    max: 8,
    base: 240,
    g: 1.95,
    val: l => l,
    fmt: v => v + '개',
  },
  {
    id: 'chain',
    name: '연쇄 기폭',
    desc: '부서진 블록이 일정 확률로 다시 터집니다.',
    max: 10,
    base: 320,
    g: 1.85,
    val: l => 0.05 * l,
    fmt: v => Math.round(v * 100) + '%',
  },
  {
    id: 'mult',
    name: '고철 수거반',
    desc: '잔해에서 포인트를 더 많이 건져 옵니다.',
    max: 20,
    base: 160,
    g: 1.7,
    val: l => 1 + 0.25 * l,
    fmt: v => '×' + v.toFixed(2),
  },
  {
    id: 'nuke',
    name: '메가톤 탄두',
    desc: '마지막 탄두가 초대형 폭탄으로 바뀝니다.',
    max: 3,
    base: 8000,
    g: 6,
    val: l => [0, 2.2, 2.8, 3.4][l],
    fmt: v => (v ? '반경 ×' + v : '없음'),
  },
];
const UP = Object.fromEntries(UPG.map(u => [u.id, u]));
const costOf = (u, l) => Math.round(u.base * u.g ** l);
const RANKS = [
  '불꽃놀이 폭죽',
  '다이너마이트',
  '수류탄',
  '파쇄 폭탄',
  '벙커버스터',
  '열압력 폭탄',
  '플라스마 코어',
  '항성 붕괴탄',
];

/* ================= 저장 ================= */
const SKEY = 'bomb-grow-lab-v1';
const defSave = () => ({
  pts: 0,
  earned: 0,
  lv: Object.fromEntries(UPG.map(u => [u.id, 0])),
  unlocked: 0,
  city: 0,
  best: [],
  runs: 0,
});
let S = defSave();
try {
  const j = JSON.parse(localStorage.getItem(SKEY) || 'null');
  if (j) {
    S = Object.assign(defSave(), j);
    S.lv = Object.assign(defSave().lv, j.lv || {});
    for (const u of UPG) S.lv[u.id] = clamp(S.lv[u.id] | 0, 0, u.max);
    S.unlocked = clamp(S.unlocked | 0, 0, CITIES.length - 1);
    S.city = clamp(S.city | 0, 0, S.unlocked);
    if (!Array.isArray(S.best)) S.best = [];
  }
} catch (e) {}
const persist = () => {
  try {
    localStorage.setItem(SKEY, JSON.stringify(S));
  } catch (e) {}
};
const V = id => UP[id].val(S.lv[id]);
const stats = () => ({
  radius: V('radius'),
  power: V('power'),
  ammo: V('ammo'),
  scope: V('scope'),
  pierce: V('pierce'),
  cluster: V('cluster'),
  chain: V('chain'),
  mult: V('mult'),
  nuke: V('nuke'),
});
const totalLv = () => Object.values(S.lv).reduce((a, b) => a + b, 0);
const rankName = () => RANKS[Math.min(RANKS.length - 1, Math.floor(totalLv() / 8))];

/* ================= 진행 상태 ================= */
let phase = 'pad',
  time = 0,
  run = null;
let engineOK = false; // 02-engine.js 가 WebGL 준비에 성공하면 true. 뒤 스크립트는 이것부터 확인한다

/* ================= 소리 ================= */
let AC = null,
  NB = null,
  master = null,
  muted = false,
  lastBoom = 0;
function initAudio() {
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain();
      master.gain.value = 0.85;
      // 폭발 소리를 여러 겹 쌓아도 찢어지지 않게, 큰 소리만 살짝 눌러 주는 리미터를 마지막에 둔다
      const lim = AC.createDynamicsCompressor();
      lim.threshold.value = -6;
      lim.knee.value = 6;
      lim.ratio.value = 8;
      lim.attack.value = 0.003;
      lim.release.value = 0.25;
      master.connect(lim).connect(AC.destination);
      const len = AC.sampleRate * 3;
      NB = AC.createBuffer(1, len, AC.sampleRate);
      const d = NB.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {
    AC = null;
  }
}
function noise(o) {
  const t = AC.currentTime + (o.delay || 0),
    s = AC.createBufferSource();
  s.buffer = NB;
  s.loop = true;
  const f = AC.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.Q.value = o.q || 1;
  f.frequency.setValueAtTime(o.f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + o.dur + 0.05);
}
function tone(o) {
  const t = AC.currentTime + (o.delay || 0),
    s = AC.createOscillator();
  s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.f0, t);
  s.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  s.connect(g).connect(master);
  s.start(t);
  s.stop(t + o.dur + 0.05);
}
const canPlay = () => AC && !muted;
function sBoom(R, big) {
  if (!canPlay()) return;
  const t = AC.currentTime;
  if (!big && t - lastBoom < 0.06) return;
  lastBoom = t;
  const v = Math.min(0.9, 0.2 + R / 14),
    pv = rand(0.9, 1.1); // 매번 음 높이를 ±10% 흔들어 같은 소리가 되풀이되는 느낌을 줄인다
  // 세 겹: ① 딸깍(아주 짧고 높은 파열음, 귀가 "맞았다"를 먼저 알아챈다) ② 쿵(낮게 떨어지는 음) ③ 우르르(낮은 잡음 꼬리)
  noise({ f0: 6000 * pv, f1: 1800 * pv, dur: 0.06, vol: v * 0.5, type: 'bandpass', q: 0.9, attack: 0.002 });
  tone({ f0: 115 * pv, f1: 28, dur: 0.45 + R * 0.02, vol: v * 0.9 });
  noise({
    f0: Math.min(3600, 500 + R * 170) * pv,
    f1: 45,
    dur: Math.min(2.6, 0.5 + R * 0.09) * (big ? 1.7 : 1),
    vol: v,
  });
  if (big) noise({ f0: 200, f1: 30, dur: 3.6, vol: 0.75, attack: 0.05 });
}
/* 휴대폰 진동(p: 밀리초 또는 [울림, 쉼, 울림…]). 소리를 끄면 진동도 끈다. 따로 끄는 설정은 아직 없다.
 * 화면을 한 번도 누르지 않았으면 브라우저가 막고 경고를 남기므로 아예 부르지 않는다 */
function buzz(p) {
  const n = navigator;
  if (muted || !n.vibrate || (n.userActivation && !n.userActivation.hasBeenActive)) return;
  try {
    n.vibrate(p);
  } catch (e) {}
}
function sIgnite() {
  if (!canPlay()) return;
  noise({ f0: 260, f1: 110, dur: 4.6, vol: 0.55, attack: 0.7 });
  noise({ f0: 300, f1: 4600, dur: 3.6, vol: 0.34, type: 'bandpass', q: 0.7, attack: 1.4, delay: 0.7 });
  tone({ f0: 58, f1: 38, dur: 4, vol: 0.28, attack: 0.5 });
}
function sWhistle() {
  if (!canPlay()) return;
  tone({ f0: 1500, f1: 240, dur: 1.05, vol: 0.07 });
  noise({ f0: 2600, f1: 500, dur: 1, vol: 0.09, type: 'bandpass', q: 2 });
}
function sRumble(n) {
  if (!canPlay()) return;
  noise({ f0: 260, f1: 40, dur: Math.min(2.6, 0.7 + n / 400), vol: Math.min(0.6, 0.18 + n / 1400), attack: 0.05 });
}
function sBuy() {
  if (!canPlay()) return;
  tone({ f0: 660, f1: 660, dur: 0.09, vol: 0.1, type: 'square' });
  tone({ f0: 990, f1: 990, dur: 0.14, vol: 0.09, type: 'square', delay: 0.08 });
}
function sCoin() {
  if (!canPlay()) return;
  tone({ f0: 1320, f1: 1760, dur: 0.12, vol: 0.07, type: 'triangle' });
  tone({ f0: 1760, f1: 2350, dur: 0.16, vol: 0.06, type: 'triangle', delay: 0.07 });
}
function setMuted(m) {
  muted = m;
  document.querySelectorAll('.mute').forEach(b => (b.textContent = m ? '소리 꺼짐' : '소리 켜짐'));
}
