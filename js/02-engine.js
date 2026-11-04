/* 02-engine.js — three.js 준비 · 카메라 · 파티클 · 폭발 구체 · 해안 발사장 · 로켓/발사탑/탄두 모형
 * 로드 순서: 01-data → 02-engine → 03-city → 04-game (index.html). 네 파일은 전역 스코프를 공유한다. */
'use strict';
/* ================= 3D 엔진 준비 ================= */
const glCanvas = $('#gl'),
  stageEl = $('#stage');
function fail(msg) {
  const e = $('#err');
  e.hidden = false;
  e.textContent = msg;
  $('#go').disabled = true;
}
if (!window.THREE) {
  fail('3D 엔진(three.js)을 불러오지 못했습니다. vendor/three.r128.min.js 가 있는지 확인하고 새로고침해 주세요.');
  throw new Error('three.js 로드 실패');
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fail('이 기기에서는 3D 화면(WebGL)을 켤 수 없습니다. 다른 브라우저에서 열어 주세요.');
  throw e;
}
engineOK = true;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAD_LIGHT.bg);
scene.fog = new THREE.Fog(PAD_LIGHT.bg, 140, 360);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
const hemi = new THREE.HemisphereLight(0xdcecff, 0x5f6b3c, 0.72);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 0.9);
sun.position.set(-38, 80, -24);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(Math.min(screen.width, screen.height) < 700 ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 260 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
const boomLight = new THREE.PointLight(0xffa860, 0, 80, 1.6);
scene.add(boomLight);
/* 조명의 기본 세기. 명중 뒤 노출 낙차(FEEL.dip)는 이 값에서 잠깐 낮췄다가 돌아온다 */
const lightBase = { sun: sun.intensity, hemi: hemi.intensity, bg: scene.background.clone() };
function applyLighting(L) {
  scene.background.set(L.bg);
  scene.fog.color.set(L.bg);
  lightBase.bg.set(L.bg);
  stageEl.style.background = L.bg;
  sun.color.setHex(L.sun[0]);
  sun.intensity = lightBase.sun = L.sun[1] * 0.8;
  hemi.color.setHex(L.hemi[0]);
  hemi.groundColor.setHex(L.hemi[1]);
  hemi.intensity = lightBase.hemi = L.hemi[2] * 0.72;
}

/* 카메라: 거의 정수리 위, 오른쪽으로 살짝·아래로 살짝 비켜서 내려다봄 */
const rig = { tx: 0, ty: 5, tz: 0, size: 30, dx: 0.22, dy: 1, dz: 0.4, shake: 0, ex: 0 };
const _dir = new THREE.Vector3(),
  _v = new THREE.Vector3(),
  _v2 = new THREE.Vector3(),
  UPV = new THREE.Vector3(0, 1, 0);
/* 흔들림 = 발사 때의 연속 떨림(rig.shake) + 폭발 충격(FEEL.trauma)의 제곱. 움직임 줄이기 설정이면 흔들지 않는다 */
function placeCamera() {
  _dir.set(rig.dx, rig.dy, rig.dz).normalize();
  const vf = (camera.fov * Math.PI) / 180,
    hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect),
    calm = reduceMotion.matches;
  const d =
    (Math.max(rig.size / (2 * Math.tan(vf / 2)), rig.size / (2 * Math.tan(hf / 2))) + rig.ex) *
    (calm ? 1 : 1 + FEEL.kick);
  const tr = calm ? 0 : FEEL.trauma * FEEL.trauma,
    sh = calm ? 0 : rig.shake * 0.5 + FEEL_TUNE.shake * tr,
    t = FEEL.rt * FEEL_TUNE.shakeHz;
  camera.position.set(
    rig.tx + _dir.x * d + shakeNoise(t, 0) * sh,
    rig.ty + _dir.y * d + shakeNoise(t, 13.7) * sh,
    rig.tz + _dir.z * d + shakeNoise(t, 29.3) * sh,
  );
  camera.lookAt(rig.tx, rig.ty, rig.tz);
  if (tr) camera.rotateZ(shakeNoise(t, 47.1) * FEEL_TUNE.roll * tr);
}

/* ================= 손맛: 히트스톱 · 슬로모션 · 흔들림 · 카메라 밀림 · 섬광 · 노출 낙차 ================= */
/* 숫자는 tools/vfx-lab.html 의 슬라이더로 맞춘 뒤 "값 복사"로 붙여 넣는다. 시간은 모두 실제 시간(초)이다.
 * "…PerR"이 붙은 값은 "기본 + 반경당 × 폭발 반경"으로 더해지고 "…Max"에서 멈춘다. 쓰는 곳: impactFeel()(03-city.js) */
const FEEL_TUNE = {
  stopBase: 0.035, // 탄두가 맞은 순간 게임 시간을 멈추는 시간(히트스톱)
  stopPerR: 0.004,
  stopMax: 0.09,
  stopNuke: 0.16,
  slowNuke: 0.8, // 메가톤 뒤 슬로모션 길이
  slowK: 0.3, // 슬로모션이 시작될 때 배속. 점점 1배로 돌아온다
  trauma: 0.05, // 폭발마다 쌓이는 충격(0~1). 연쇄 · 자탄 폭발에도 쌓인다
  traumaPerR: 0.03,
  traumaHit: 0.25, // 탄두가 맞으면 더 쌓이는 충격
  traumaHitPerR: 0.04,
  traumaFade: 1.4, // 1초에 빠지는 충격
  shake: 1.6, // 충격이 1일 때 카메라가 흔들리는 폭(블록 칸). 실제 폭은 충격의 제곱에 비례한다
  roll: 0.03, // 충격이 1일 때 화면이 기우는 각도(라디안)
  shakeHz: 1, // 흔들림 빠르기 배율
  kick: 0.03, // 맞은 순간 카메라가 뒤로 밀려나는 정도(거리 비율). 스프링처럼 한 번 튕기고 돌아온다
  kickPerR: 0.003,
  kickMax: 0.08,
  kickNuke: 0.14,
  flash: 0.4, // 화면 섬광의 불투명도. 맞은 곳 둘레가 가장 밝다
  flashPerR: 0.025,
  flashMax: 0.65,
  flashNuke: 0.85,
  flashFade: 20, // 클수록 섬광이 빨리 사라진다
  dip: 0.22, // 섬광 뒤 조명을 낮추는 정도(0~1). 어두워진 도시에서 불덩이가 더 밝아 보인다
  dipPerR: 0.018,
  dipMax: 0.45,
  dipNuke: 0.6,
  dipNight: 0.6, // 밤 도시는 이미 어두워서 낙차를 이 비율로 줄인다
  dipFade: 5, // 클수록 조명이 빨리 돌아온다
};
const FEEL = { trauma: 0, stop: 0, slow: 0, slowDur: 1, kick: 0, kickV: 0, flash: 0, dip: 0, rt: 0, lastFlash: -9 };
const flashEl = $('#flash');
/* 부드러운 흔들림: 빠르기가 다른 사인파 셋(약 7 · 13 · 21Hz)을 겹친 값(−1~1). 매 프레임 무작위로 튀는 것보다 묵직하다 */
const shakeNoise = (t, s) =>
  0.5 * Math.sin(t * 47 + s) + 0.3 * Math.sin(t * 83 + s * 1.9) + 0.2 * Math.sin(t * 131 + s * 3.1);
function addTrauma(a) {
  FEEL.trauma = Math.min(1, FEEL.trauma + a);
}
/* o: { stop, slow, kick, flash, dip, at: [x, y, z], r: 폭발 반경 }. 겹치면 큰 값이 이긴다(더해지지 않는다) */
function feelHit(o) {
  const calm = reduceMotion.matches;
  if (o.stop) FEEL.stop = Math.max(FEEL.stop, o.stop);
  if (o.slow) FEEL.slow = FEEL.slowDur = o.slow;
  if (o.kick && !calm) FEEL.kickV += o.kick * 33.5; // 아래 스프링에서 최대 밀림이 대략 kick 이 되는 속도
  if (o.dip) FEEL.dip = Math.max(FEEL.dip, o.dip);
  // 섬광은 1초에 3번을 넘지 않게 한다(광과민성 안전 기준). 움직임 줄이기 설정이면 약하게
  if (o.flash && FEEL.rt - FEEL.lastFlash >= 0.34) {
    FEEL.lastFlash = FEEL.rt;
    FEEL.flash = Math.max(FEEL.flash, o.flash * (calm ? 0.35 : 1));
    if (o.at) {
      // 섬광 중심은 맞은 곳의 화면 위치, 반지름은 폭발이 화면에서 차지하는 크기에 맞춘다
      _v2.set(o.at[0], o.at[1], o.at[2]);
      const dist = Math.max(1, camera.position.distanceTo(_v2)),
        rpx = ((o.r || 4) * vh) / (2 * dist * Math.tan((camera.fov * Math.PI) / 360));
      _v2.project(camera);
      flashEl.style.setProperty('--fx', ((_v2.x + 1) * 50).toFixed(1) + '%');
      flashEl.style.setProperty('--fy', ((1 - _v2.y) * 50).toFixed(1) + '%');
      flashEl.style.setProperty('--fr', Math.round(clamp(rpx * 2.4, 90, 1.2 * Math.max(vw, vh))) + 'px');
    }
  }
}
/* 프레임 처음에 실제로 흐른 시간(rdt)으로 손맛 상태를 돌리고, 게임 시간으로 쓸 dt 를 돌려준다.
 * 히트스톱 중에는 0, 슬로모션 중에는 줄어든 값. 흔들림 · 섬광 · 조명은 멈춤과 상관없이 실제 시간으로 움직인다 */
function updFeel(rdt) {
  const T = FEEL_TUNE;
  FEEL.rt += rdt;
  FEEL.trauma = Math.max(0, FEEL.trauma - T.traumaFade * rdt);
  // 카메라 밀림: 덜 감쇠된 스프링(각진동수 22, 감쇠비 0.32)이라 한 번 튕겼다가 제자리로 온다
  FEEL.kickV += (-484 * FEEL.kick - 14 * FEEL.kickV) * rdt;
  FEEL.kick += FEEL.kickV * rdt;
  if (Math.abs(FEEL.kick) < 1e-4 && Math.abs(FEEL.kickV) < 1e-3) FEEL.kick = FEEL.kickV = 0;
  FEEL.flash = FEEL.flash > 0.004 ? FEEL.flash * Math.exp(-T.flashFade * rdt) : 0;
  FEEL.dip = FEEL.dip > 0.002 ? FEEL.dip * Math.exp(-T.dipFade * rdt) : 0;
  if (FEEL.stop > 0) {
    FEEL.stop -= rdt;
    return 0;
  }
  if (FEEL.slow > 0) {
    FEEL.slow = Math.max(0, FEEL.slow - rdt);
    const p = 1 - FEEL.slow / FEEL.slowDur;
    return rdt * lerp(T.slowK, 1, p * p);
  }
  return rdt;
}
/* 섬광과 조명 낙차를 화면에 반영한다. 그리기 바로 전에 부른다(이번 프레임에 맞은 섬광이 바로 보이게) */
function drawFeel() {
  const off = !FEEL.flash;
  if (flashEl.hidden !== off) flashEl.hidden = off;
  if (!off) flashEl.style.opacity = FEEL.flash.toFixed(3);
  // 섬광이 밝은 동안에는 조명을 낮추지 않는다. 그래야 "번쩍 → 어두움 → 원래대로" 순서로 보인다
  const k = 1 - FEEL.dip * clamp(1 - FEEL.flash * 2.2, 0, 1);
  sun.intensity = lightBase.sun * k;
  hemi.intensity = lightBase.hemi * k;
  scene.background.copy(lightBase.bg).multiplyScalar(1 - (1 - k) * 0.6);
  scene.fog.color.copy(scene.background);
}
function clearFeel() {
  Object.assign(FEEL, { trauma: 0, stop: 0, slow: 0, kick: 0, kickV: 0, flash: 0, dip: 0 });
  drawFeel();
}
let vw = 1,
  vh = 1;
function resize() {
  const r = stageEl.getBoundingClientRect();
  vw = Math.max(1, r.width);
  vh = Math.max(1, r.height);
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
  const ps = (vh * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  for (const p of POOLS) p.mat.uniforms.uScale.value = ps;
}

/* ================= 파티클(불꽃·연기) ================= */
const VS = `attribute float size;attribute vec4 col;varying vec4 vC;uniform float uScale;
void main(){vC=col;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(size*uScale/-mv.z,1.0,700.0);gl_Position=projectionMatrix*mv;}`;
const FS_ADD = `varying vec4 vC;void main(){vec2 c=gl_PointCoord-.5;float d=dot(c,c)*4.0;if(d>1.0)discard;float a=1.0-d;gl_FragColor=vec4(vC.rgb,vC.a*a*a);}`;
const FS_NRM = `varying vec4 vC;void main(){vec2 c=gl_PointCoord-.5;float d=dot(c,c)*4.0;if(d>1.0)discard;gl_FragColor=vec4(vC.rgb,vC.a*(1.0-d));}`;
function makePool(max, add) {
  const geo = new THREE.BufferGeometry(),
    pos = new Float32Array(max * 3),
    col = new Float32Array(max * 4),
    size = new Float32Array(max);
  const pa = new THREE.BufferAttribute(pos, 3),
    ca = new THREE.BufferAttribute(col, 4),
    sa = new THREE.BufferAttribute(size, 1);
  for (const a of [pa, ca, sa]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa);
  geo.setAttribute('col', ca);
  geo.setAttribute('size', sa);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader: VS,
    fragmentShader: add ? FS_ADD : FS_NRM,
    transparent: true,
    depthWrite: false,
    blending: add ? THREE.NormalBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = add ? 3 : 2;
  scene.add(pts);
  return { geo, pos, col, size, pa, ca, sa, mat, max, list: [], add };
}
const FIRE = makePool(3000, true),
  SMOKE = makePool(2600, false),
  POOLS = [FIRE, SMOKE];
/* o: {drag, grav, flat(불꽃 색 변화 없이 고정색)} */
function emit(pool, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, o) {
  if (pool.list.length >= pool.max) return;
  pool.list.push({
    x,
    y,
    z,
    vx,
    vy,
    vz,
    life,
    max: life,
    s0,
    s1,
    r,
    g,
    b,
    a,
    drag: o && o.drag != null ? o.drag : 1.6,
    grav: (o && o.grav) || 0,
    fire: pool.add && !(o && o.flat),
  });
}
function updPool(pool, dt) {
  const L = pool.list;
  let w = 0;
  for (let i = 0; i < L.length; i++) {
    const p = L[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    const dr = Math.exp(-p.drag * dt);
    p.vx *= dr;
    p.vy = p.vy * dr - p.grav * dt;
    p.vz *= dr;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.grav > 0 && p.y < 0.1) {
      p.y = 0.1;
      p.vy *= -0.3;
    }
    L[w++] = p;
  }
  L.length = w;
  for (let i = 0; i < w; i++) {
    const p = L[i],
      k = p.life / p.max,
      j = i * 3,
      c = i * 4;
    pool.pos[j] = p.x;
    pool.pos[j + 1] = p.y;
    pool.pos[j + 2] = p.z;
    pool.size[i] = lerp(p.s1, p.s0, k);
    if (p.fire) {
      pool.col[c] = 1 - (1 - k) * 0.3;
      pool.col[c + 1] = 0.12 + 0.8 * k * k;
      pool.col[c + 2] = 0.04 + 0.6 * k * k * k;
      pool.col[c + 3] = p.a * Math.min(1, k * 2.2);
    } else {
      pool.col[c] = p.r;
      pool.col[c + 1] = p.g;
      pool.col[c + 2] = p.b;
      pool.col[c + 3] = p.a * (pool.add ? Math.min(1, k * 2) : k);
    }
  }
  pool.geo.setDrawRange(0, w);
  pool.pa.needsUpdate = pool.ca.needsUpdate = pool.sa.needsUpdate = true;
}

/* ================= 폭발 구체·충격파 ================= */
const ballGeo = new THREE.SphereGeometry(1, 22, 16),
  ringGeo = new THREE.RingGeometry(0.82, 1, 56);
const blasts = [];
function addBlast(kind, x, y, z, r0, r1, dur, color, op) {
  if (blasts.length > 36) return;
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: op,
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const m = new THREE.Mesh(kind === 'ring' ? ringGeo : ballGeo, mat);
  m.position.set(x, y, z);
  if (kind === 'ring') m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  m.scale.setScalar(r0);
  scene.add(m);
  blasts.push({ m, t: 0, dur, r0, r1, op, kind });
}
function updBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    b.t += dt;
    const k = Math.min(1, b.t / b.dur),
      e = 1 - Math.pow(1 - k, 3);
    b.m.scale.setScalar(lerp(b.r0, b.r1, e));
    b.m.material.opacity = b.op * (b.kind === 'ring' ? 1 - k : Math.pow(1 - k, 1.6));
    if (k >= 1) {
      scene.remove(b.m);
      b.m.material.dispose();
      blasts.splice(i, 1);
    }
  }
  boomLight.intensity *= Math.exp(-7 * dt);
}

/* ================= 재질·도형 공용 ================= */
const UBOX = new THREE.BoxGeometry(1, 1, 1);
UBOX.userData.shared = true;
function std(color, o) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.05 }, o || {}));
}
function shared(m) {
  m.userData.shared = true;
  return m;
}
function mesh(geo, mat, x, y, z, parent, noShadow) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (!noShadow) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  if (parent) parent.add(m);
  return m;
}
function box(w, h, d, mat, x, y, z, parent) {
  const m = mesh(UBOX, mat, x, y, z, parent);
  m.scale.set(w, h, d);
  return m;
}
function disposeTree(o) {
  o.traverse(n => {
    if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
    if (n.material) {
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) if (!m.userData.shared) m.dispose();
    }
  });
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.userData = t.userData || {};
  t.userData.redraw = () => {
    draw(c.getContext('2d'), w, h);
    t.needsUpdate = true;
  };
  return t;
}

/* ================= 해안 발사장 ================= */
const padGroup = new THREE.Group();
scene.add(padGroup);
function drawPad(g, w, h) {
  g.fillStyle = '#b9b6ad';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,.09)';
  g.lineWidth = 2;
  for (let i = 0; i <= w; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, h);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(w, i);
    g.stroke();
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(60,55,50,${Math.random() * 0.06})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, Math.random() * 18, 0, 7);
    g.fill();
  }
  g.fillStyle = '#2b2926';
  g.fillRect(0, 214, 256, 84);
  g.fillStyle = '#3d3a36';
  for (let x = 0; x < 250; x += 16) g.fillRect(x, 214, 8, 84);
  g.save();
  g.translate(256, 256);
  g.lineWidth = 24;
  for (let a = 0; a < 64; a++) {
    g.strokeStyle = a % 2 ? '#161616' : '#ffc531';
    g.beginPath();
    g.arc(0, 0, 150, (a / 64) * 6.2832, ((a + 1) / 64) * 6.2832);
    g.stroke();
  }
  g.restore();
  g.fillStyle = '#1d1c1b';
  g.beginPath();
  g.arc(256, 256, 64, 0, 7);
  g.fill();
  g.fillStyle = '#2b2b2b';
  g.font = '700 40px "IBM Plex Mono",monospace';
  g.textAlign = 'center';
  g.fillText('LAB-07', 256, 470);
}
let padTex = null;
function genPadEnv() {
  const land = mesh(
    new THREE.PlaneGeometry(500, 500),
    shared(new THREE.MeshLambertMaterial({ color: 0x7a9858 })),
    -230,
    0,
    0,
    padGroup,
  );
  land.rotation.x = -Math.PI / 2;
  land.position.x = -231;
  land.castShadow = false;
  const sand = mesh(
    new THREE.PlaneGeometry(7, 500),
    shared(new THREE.MeshLambertMaterial({ color: 0xe2d3a6 })),
    21.5,
    0.02,
    0,
    padGroup,
  );
  sand.rotation.x = -Math.PI / 2;
  sand.castShadow = false;
  const sea = mesh(
    new THREE.PlaneGeometry(500, 500),
    shared(new THREE.MeshStandardMaterial({ color: 0x2f7fa8, roughness: 0.25, metalness: 0.1 })),
    275,
    -0.05,
    0,
    padGroup,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.castShadow = false;
  const surf = mesh(
    new THREE.PlaneGeometry(1.2, 500),
    shared(new THREE.MeshBasicMaterial({ color: 0xeaf6fb, transparent: true, opacity: 0.7 })),
    25.4,
    0.01,
    0,
    padGroup,
    true,
  );
  surf.rotation.x = -Math.PI / 2;
  padGroup.userData.surf = surf;
  const concrete = shared(std(0xa9a69d));
  box(22, 0.42, 22, concrete, 0, 0.21, 0, padGroup);
  padTex = canvasTex(512, 512, drawPad);
  const top = mesh(
    new THREE.PlaneGeometry(22, 22),
    shared(std(0xffffff, { map: padTex, roughness: 0.9 })),
    0,
    0.43,
    0,
    padGroup,
  );
  top.rotation.x = -Math.PI / 2;
  top.castShadow = false;
  const road = shared(new THREE.MeshLambertMaterial({ color: 0x5c5e60 }));
  const r1 = mesh(new THREE.PlaneGeometry(26, 3), road, -24, 0.03, 0, padGroup);
  r1.rotation.x = -Math.PI / 2;
  r1.castShadow = false;
  const r2 = mesh(new THREE.PlaneGeometry(3, 30), road, -30, 0.03, -14, padGroup);
  r2.rotation.x = -Math.PI / 2;
  r2.castShadow = false;
  const white = shared(std(0xeeeeea)),
    grey = shared(std(0x8a8f99));
  box(11, 8, 9, white, -31, 4, -31, padGroup);
  box(11.2, 0.5, 9.2, grey, -31, 8.2, -31, padGroup);
  box(4, 6, 0.2, shared(std(0x394150)), -31, 3, -26.4, padGroup);
  box(7, 3, 5, white, -15, 1.5, 16, padGroup);
  for (let i = 0; i < 5; i++) box(0.9, 0.6, 0.1, shared(std(0x3b5370)), -17.6 + i * 1.3, 2, 18.55, padGroup);
  const tankMat = shared(std(0xf2f2ee, { roughness: 0.4 }));
  for (const [x, z] of [
    [-14, -12],
    [-10, -13.5],
  ]) {
    mesh(new THREE.SphereGeometry(1.8, 20, 14), tankMat, x, 1.9, z, padGroup);
    box(0.3, 1, 0.3, grey, x, 0.5, z, padGroup);
  }
  const poleMat = shared(std(0xc8c8c8)),
    redMat = shared(new THREE.MeshBasicMaterial({ color: 0xff4433 }));
  for (const [x, z] of [
    [8, -8],
    [-8, 8],
    [8, 8],
  ]) {
    mesh(new THREE.CylinderGeometry(0.14, 0.22, 24, 8), poleMat, x, 12, z, padGroup);
    mesh(new THREE.SphereGeometry(0.3, 8, 6), redMat, x, 24.2, z, padGroup, true);
  }
  const treeMat = shared(new THREE.MeshLambertMaterial({ color: 0x4f7a3a })),
    treeGeo = new THREE.ConeGeometry(1, 2.6, 7);
  treeGeo.userData.shared = true;
  for (let i = 0; i < 70; i++) {
    const x = rand(-60, 14),
      z = rand(-50, 50);
    if (Math.abs(x) < 14 && Math.abs(z) < 14) continue;
    if (x < -20 && x > -42 && z < -22) continue;
    if (x > -36 && x < -12 && Math.abs(z) < 2.5) continue;
    const t = mesh(treeGeo, treeMat, x, 1.3, z, padGroup);
    t.scale.setScalar(rand(0.7, 1.3));
  }
}

/* ================= 미사일(로켓) 모형 ================= */
const TIERS = [0xf2f2ee, 0xff9a3d, 0xff5a3d, 0xff3d7a, 0xb35bff, 0x4dc3ff, 0x7dffcf, 0xfff6c8];
const tierOf = lv => Math.min(TIERS.length - 1, Math.floor(lv.power / 4));
function drawBody(g, w, h) {
  g.fillStyle = '#f4f4f1';
  g.fillRect(0, 0, w, h);
  for (let q = 0; q < 4; q++) {
    g.fillStyle = q % 2 ? '#f4f4f1' : '#1b1d22';
    g.fillRect(q * 128, 40, 128, 80);
    g.fillStyle = q % 2 ? '#1b1d22' : '#f4f4f1';
    g.fillRect(q * 128, 120, 128, 80);
  }
  g.fillStyle = '#d6402f';
  g.fillRect(0, 236, w, 12);
  g.fillStyle = '#1b1d22';
  g.fillRect(0, h - 56, w, 56);
  g.strokeStyle = 'rgba(0,0,0,.08)';
  g.lineWidth = 2;
  for (let y = 300; y < h - 60; y += 110) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.save();
  g.translate(26, 290);
  g.rotate(Math.PI / 2);
  g.fillStyle = '#1d2a4d';
  g.font = '400 78px "Black Han Sans","Apple SD Gothic Neo",sans-serif';
  g.fillText('키움 1호', 0, 0);
  g.restore();
  g.save();
  g.translate(282, 290);
  g.rotate(Math.PI / 2);
  g.fillStyle = '#1d2a4d';
  g.font = '700 46px "IBM Plex Mono",monospace';
  g.fillText('LAB-07', 0, 0);
  g.restore();
}
function drawHaz(g, w, h) {
  g.fillStyle = '#ffc531';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#161616';
  for (let x = -h; x < w + h; x += 48) {
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + 24, 0);
    g.lineTo(x + 48, 0);
    g.lineTo(x + 24, h);
    g.closePath();
    g.fill();
  }
}
let bodyTex = null,
  hazTex = null;
function texs() {
  if (!bodyTex) {
    bodyTex = canvasTex(512, 1024, drawBody);
    hazTex = canvasTex(512, 64, drawHaz);
    hazTex.wrapS = THREE.RepeatWrapping;
  }
}
function cyl(rt, rb, h, seg, mat, y, parent, open) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 28, 1, !!open), mat, 0, y, 0, parent);
}
function buildFlame(r, len) {
  const f = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(r, len, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff7a22,
      transparent: true,
      opacity: 0.75,
      blending: THREE.NormalBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  outer.rotation.x = Math.PI;
  outer.position.y = -len / 2;
  f.add(outer);
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.55, len * 0.55, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0,
      transparent: true,
      opacity: 0.95,
      blending: THREE.NormalBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  inner.rotation.x = Math.PI;
  inner.position.y = -len * 0.275;
  f.add(inner);
  f.visible = false;
  return f;
}
function buildRocket(lv) {
  texs();
  const g = new THREE.Group(),
    tier = tierOf(lv);
  const s = Math.min(2.1, 1 + 0.022 * lv.radius + 0.014 * lv.power),
    hs = 1 + 0.016 * lv.power + 0.02 * lv.ammo;
  const body = std(0xffffff, { map: bodyTex, roughness: 0.5 }),
    plain = std(0xf2f2ee, { roughness: 0.5 }),
    dark = std(0x2a2e38, { roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide });
  const r1 = 0.85 * s,
    r2 = 0.66 * s,
    bell = 0.9 * s,
    h1 = 6.2 * s * hs,
    ad = 0.8 * s,
    h2 = 3 * s * hs,
    hn = (2.5 + 0.14 * lv.pierce) * s;
  cyl(r1 * 0.5, r1 * 0.8, bell, 20, dark, bell / 2, g, true);
  cyl(r1, r1, h1, 32, body, bell + h1 / 2, g);
  cyl(r2, r1, ad, 32, plain, bell + h1 + ad / 2, g);
  cyl(r2, r2, h2, 28, plain, bell + h1 + ad + h2 / 2, g);
  const yS2 = bell + h1 + ad,
    yN = yS2 + h2,
    H = yN + hn;
  const glow = TIERS[tier];
  mesh(
    new THREE.ConeGeometry(r2, hn, 28),
    std(glow, { emissive: glow, emissiveIntensity: tier ? 0.18 + 0.06 * tier : 0, roughness: 0.35 }),
    0,
    yN + hn / 2,
    0,
    g,
  );
  cyl(r2 * 1.01, r2 * 1.01, 0.12 * s, 28, dark, yS2 + 0.06 * s, g);
  if (lv.pierce > 0) {
    const fh = (1.2 + 0.16 * lv.pierce) * s,
      fw = (0.7 + 0.1 * lv.pierce) * s,
      fm = std(0x3a3f4c, { roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4,
        f = box(
          0.09 * s,
          fh,
          fw,
          fm,
          Math.sin(a) * (r1 + fw / 2 - 0.05),
          bell + fh / 2 + 0.1,
          Math.cos(a) * (r1 + fw / 2 - 0.05),
          g,
        );
      f.rotation.y = a;
    }
  }
  const nb = Math.min(4, Math.ceil(lv.ammo / 2));
  if (nb) {
    const rb = 0.34 * s,
      hb = h1 * 0.55,
      bm = std(0xf2f2ee, { roughness: 0.5 }),
      bn = std(0xff8a3d, { roughness: 0.5 });
    for (let i = 0; i < nb; i++) {
      const a = (i * 2 * Math.PI) / nb + (nb === 1 ? Math.PI / 2 : Math.PI / 4),
        x = Math.sin(a) * (r1 + rb * 0.9),
        z = Math.cos(a) * (r1 + rb * 0.9);
      const b = mesh(new THREE.CylinderGeometry(rb, rb, hb, 16), bm, x, bell + hb / 2, z, g);
      mesh(new THREE.ConeGeometry(rb, 1 * s, 16), bn, x, bell + hb + 0.5 * s, z, g);
      mesh(new THREE.CylinderGeometry(rb * 0.5, rb * 0.75, 0.5 * s, 12, 1, true), dark, x, bell - 0.25 * s, z, g);
    }
  }
  if (lv.cluster > 0) {
    const pm = std(0x6e7d4f, { roughness: 0.6 }),
      pg = new THREE.SphereGeometry(0.2 * s, 12, 10);
    for (let i = 0; i < lv.cluster; i++) {
      const a = (i * 2 * Math.PI) / lv.cluster;
      mesh(
        pg,
        pm,
        Math.sin(a) * (r2 + 0.12 * s),
        yS2 + 0.35 * s + (i % 2) * 0.45 * s,
        Math.cos(a) * (r2 + 0.12 * s),
        g,
      );
    }
  }
  const nr = Math.ceil(lv.chain / 3);
  if (nr) {
    const cm = new THREE.MeshBasicMaterial({ color: 0x7fe9ff });
    for (let i = 0; i < nr; i++) {
      const t = mesh(
        new THREE.TorusGeometry(r1 + 0.03, 0.07 * s, 8, 40),
        cm,
        0,
        bell + h1 * (0.3 + 0.18 * i),
        0,
        g,
        true,
      );
      t.rotation.x = Math.PI / 2;
    }
  }
  if (lv.nuke > 0) {
    const hm = std(0xffffff, { map: hazTex, emissive: 0xffc531, emissiveIntensity: 0.15 });
    cyl(r2 * 1.02, r2 * 1.02, 0.55 * s, 28, hm, yN - 0.4 * s, g);
  }
  const flame = buildFlame(r1 * 0.75, 7 * s);
  g.add(flame);
  g.userData = { H, s, r1, r2, bell, h1, h2, hn, yS2, flame, bump: 0 };
  return g;
}
function buildTower(R) {
  const g = new THREE.Group(),
    tm = std(0xb8432f, { roughness: 0.6 }),
    TH = Math.max(17, R.H + 2.5),
    tw = 1.7;
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    box(0.18, TH, 0.18, tm, (x * tw) / 2, TH / 2, (z * tw) / 2, g);
  const step = 1.5;
  for (let y = step; y < TH; y += step) {
    box(tw, 0.12, 0.12, tm, 0, y, -tw / 2, g);
    box(tw, 0.12, 0.12, tm, 0, y, tw / 2, g);
    box(0.12, 0.12, tw, tm, -tw / 2, y, 0, g);
    box(0.12, 0.12, tw, tm, tw / 2, y, 0, g);
  }
  const dl = Math.hypot(tw, step),
    da = Math.atan2(tw, step);
  for (let y = 0; y + step <= TH; y += step) {
    const d1 = box(0.08, dl, 0.08, tm, 0, y + step / 2, tw / 2, g);
    d1.rotation.z = da * ((y / step) % 2 ? 1 : -1);
    const d2 = box(0.08, dl, 0.08, tm, tw / 2, y + step / 2, 0, g);
    d2.rotation.x = da * ((y / step) % 2 ? 1 : -1);
  }
  box(tw + 0.8, 0.25, tw + 0.8, std(0xe8e8e8), 0, TH, 0, g);
  const beacon = mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    0,
    TH + 0.35,
    0,
    g,
    true,
  );
  const arms = [],
    am = std(0xd9d4c8);
  const lvls = [
    [R.bell + R.h1 * 0.45, R.r1],
    [R.yS2 + R.h2 * 0.5, R.r2],
    [R.yS2 + R.h2 + R.hn * 0.15, R.r2 * 0.8],
  ];
  for (const [h, r] of lvls) {
    if (h > TH - 0.6) continue;
    const len = 1.6 + (R.r1 - r),
      piv = new THREE.Group();
    piv.position.set(0, h, tw / 2);
    g.add(piv);
    box(0.55, 0.35, len, am, 0, 0, len / 2, piv);
    piv.userData.side = Math.random() < 0.5 ? -1 : 1;
    arms.push(piv);
  }
  g.position.set(0, 0.42, -(R.r1 + 1.6 + tw / 2));
  g.userData = { arms, beacon, TH };
  return g;
}

/* 도시로 떨어지는 탄두(작은 미사일) */
const WH = {
  body: new THREE.CylinderGeometry(0.34, 0.34, 2.2, 14),
  nose: new THREE.ConeGeometry(0.34, 1.1, 14),
  flame: new THREE.ConeGeometry(0.3, 2.6, 12, 1, true),
  mini: new THREE.SphereGeometry(0.3, 10, 8),
};
for (const k in WH) WH[k].userData.shared = true;
const WHM = {
  white: shared(std(0xf2f2ee, { roughness: 0.45 })),
  fin: shared(std(0x3a3f4c)),
  nuke: shared(std(0xffd43a, { emissive: 0xffb000, emissiveIntensity: 0.25 })),
  mini: shared(std(0x58653f, { roughness: 0.6 })),
  flame: shared(
    new THREE.MeshBasicMaterial({
      color: 0xffa040,
      transparent: true,
      opacity: 0.9,
      blending: THREE.NormalBlending,
      depthWrite: false,
      fog: false,
    }),
  ),
  tier: [],
};
function warheadMesh(kind, lv) {
  const g = new THREE.Group();
  if (kind === 'mini') {
    mesh(WH.mini, WHM.mini, 0, 0, 0, g);
    scene.add(g);
    return g;
  }
  const t = tierOf(lv);
  if (!WHM.tier[t])
    WHM.tier[t] = shared(std(TIERS[t], { emissive: TIERS[t], emissiveIntensity: t ? 0.3 : 0, roughness: 0.35 }));
  mesh(WH.body, kind === 'nuke' ? WHM.nuke : WHM.white, 0, 0, 0, g);
  mesh(WH.nose, WHM.tier[t], 0, 1.65, 0, g);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2,
      f = box(0.06, 0.8, 0.5, WHM.fin, Math.sin(a) * 0.5, -0.8, Math.cos(a) * 0.5, g);
    f.rotation.y = a;
  }
  const fl = mesh(WH.flame, WHM.flame, 0, -2.4, 0, g, true);
  fl.rotation.x = Math.PI;
  g.userData.flame = fl;
  const s =
    Math.min(2.1, 1 + 0.022 * lv.radius + 0.014 * lv.power) * (kind === 'main' ? 1.7 : 1) * (kind === 'nuke' ? 1.8 : 1);
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}
