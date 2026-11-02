/* 03-city.js — 복셀 도시 생성 · 잔해 · 폭발 판정 · 붕괴 · 탄두 비행 · 조준 고리
 * 로드 순서: 01-data → 02-engine → 03-city → 04-game (index.html). 네 파일은 전역 스코프를 공유한다. */
'use strict';
if (!engineOK) throw new Error('3D 엔진 준비 실패로 03-city.js 을(를) 건너뜁니다');
/* ================= 복셀 도시 ================= */
const GX = 45,
  GZ = 45,
  GY = 48,
  LAYER = GX * GZ,
  NV = LAYER * GY,
  HX = GX / 2,
  HZ = GZ / 2;
const vk = new Uint8Array(NV),
  vhp = new Float32Array(NV),
  vmhp = new Float32Array(NV),
  vci = new Uint8Array(NV),
  vm = new Uint8Array(NV),
  vinst = new Int32Array(NV);
const K_WALL = 1,
  K_LIT = 2,
  K_DARK = 3,
  K_ROOF = 4,
  K_VAULT = 5,
  K_IN = 6;
const cityGroup = new THREE.Group();
cityGroup.visible = false;
scene.add(cityGroup);
const VBOX = new THREE.BoxGeometry(0.98, 0.98, 0.98);
VBOX.userData.shared = true;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0),
  _m = new THREE.Matrix4(),
  _c = new THREE.Color(),
  _c2 = new THREE.Color(),
  _o = new THREE.Object3D();
let city = CITIES[0],
  voxMesh = [null, null],
  totalVox = 1,
  destroyedVox = 0;
const matDirty = [false, false],
  colDirty = [false, false];
let trees = [],
  treeMesh = null;
const vIdx = (x, y, z) => (y * GZ + z) * GX + x;
function vPos(v) {
  return [(v % GX) - HX + 0.5, ((v / LAYER) | 0) + 0.5, (((v / GX) | 0) % GZ) - HZ + 0.5];
}
function cellAtW(x, y, z) {
  const gx = Math.floor(x + HX),
    gy = Math.floor(y),
    gz = Math.floor(z + HZ);
  return gx < 0 || gx >= GX || gz < 0 || gz >= GZ || gy < 0 || gy >= GY ? -1 : vIdx(gx, gy, gz);
}
function hash(v) {
  let h = Math.imul(v, 2654435761) >>> 0;
  h ^= h >>> 15;
  return (h & 1023) / 1023;
}
const isGlow = k => k === K_VAULT || (city.night && k === K_LIT);
function baseColor(v, out) {
  const k = vk[v],
    ci = vci[v];
  if (k === K_LIT) return out.set(city.lit[ci % city.lit.length]);
  if (k === K_DARK) return out.set(city.dark);
  if (k === K_VAULT) return out.set('#ffcc33');
  if (k === K_ROOF) out.set(city.roof[ci % city.roof.length]);
  else if (k === K_IN) out.set(city.wall[ci % city.wall.length]).multiplyScalar(0.5);
  else out.set(city.wall[ci % city.wall.length]);
  return out.multiplyScalar(0.92 + hash(v) * 0.14);
}

function building(x0, z0, w, d, h) {
  const wc = ri(0, city.wall.length - 1),
    rc = ri(0, city.roof.length - 1),
    hpv = city.hp * (h > 16 ? 1.5 : 1);
  const vault = w >= 3 && d >= 3 && Math.random() < 0.35;
  for (let y = 0; y < h; y++)
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        const v = vIdx(x0 + x, y, z0 + z),
          ex = x === 0 || x === w - 1,
          ez = z === 0 || z === d - 1;
        let k = K_IN,
          c = wc;
        if (y === h - 1) {
          k = K_ROOF;
          c = rc;
          if (vault && x === w >> 1 && z === d >> 1) k = K_VAULT;
        } else if (ex || ez) {
          k = K_WALL;
          if (ex !== ez) {
            const t = ex ? z : x;
            if (y % 2 === 1 && t % 2 === 1) {
              k = Math.random() < (city.night ? 0.72 : 0.55) ? K_LIT : K_DARK;
              c = ri(0, 7);
            }
          }
        }
        vk[v] = k;
        vci[v] = c;
        vmhp[v] = vhp[v] = hpv * (k === K_VAULT ? 2 : 1);
      }
}
function drawGround(lots) {
  return (g, w, h) => {
    const P = w / (GX + 16);
    g.fillStyle = city.ground;
    g.fillRect(0, 0, w, h);
    g.fillStyle = city.road;
    g.fillRect(8 * P, 8 * P, GX * P, GZ * P);
    for (const l of lots) {
      g.fillStyle = l.park ? city.ground : city.lot;
      g.fillRect((8 + l.ox - 0.35) * P, (8 + l.oz - 0.35) * P, 7.7 * P, 7.7 * P);
    }
    g.strokeStyle = 'rgba(255,236,170,.55)';
    g.lineWidth = Math.max(1, P * 0.12);
    g.setLineDash([P * 0.8, P * 0.7]);
    for (let b = 1; b < 5; b++) {
      const c = (8 + b * 9) * P;
      g.beginPath();
      g.moveTo(c, 8 * P);
      g.lineTo(c, (8 + GZ) * P);
      g.stroke();
      g.beginPath();
      g.moveTo(8 * P, c);
      g.lineTo((8 + GX) * P, c);
      g.stroke();
    }
    g.setLineDash([]);
  };
}
function genCity(ci) {
  city = CITIES[ci];
  vk.fill(0);
  destroyedVox = 0;
  const lots = [];
  for (let bx = 0; bx < 5; bx++)
    for (let bz = 0; bz < 5; bz++) {
      const ox = bx * 9 + 1,
        oz = bz * 9 + 1,
        cen = Math.max(0, 1 - Math.hypot(bx - 2, bz - 2) / 2.9);
      if (Math.random() > city.dens + 0.3 * cen) {
        lots.push({ park: true, ox, oz });
        continue;
      }
      lots.push({ park: false, ox, oz });
      const hb = () =>
          clamp(
            Math.round(city.hMin + (city.hMax - city.hMin) * Math.pow(Math.random(), 1.25) * (0.35 + 0.75 * cen)),
            2,
            GY - 2,
          ),
        r = Math.random();
      if (r < 0.3) building(ox, oz, 7, 7, hb());
      else if (r < 0.45) building(ox + 1, oz + 1, 5, 5, Math.min(GY - 2, hb() + ri(0, 4)));
      else if (r < 0.7) {
        building(ox, oz, 3, 7, hb());
        building(ox + 4, oz, 3, 7, hb());
      } else {
        building(ox, oz, 3, 3, hb());
        building(ox + 4, oz, 3, 3, hb());
        building(ox, oz + 4, 3, 3, hb());
        building(ox + 4, oz + 4, 3, 3, hb());
      }
    }
  for (const o of cityGroup.children.slice()) {
    cityGroup.remove(o);
    disposeTree(o);
  }
  const cnt = [0, 0];
  totalVox = 0;
  for (let v = 0; v < NV; v++) {
    if (!vk[v]) continue;
    totalVox++;
    cnt[isGlow(vk[v]) ? 1 : 0]++;
  }
  totalVox = Math.max(1, totalVox);
  const mats = [new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial()];
  for (let m = 0; m < 2; m++) {
    const im = new THREE.InstancedMesh(VBOX, mats[m], Math.max(1, cnt[m]));
    im.count = cnt[m];
    im.castShadow = m === 0;
    im.receiveShadow = m === 0;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    voxMesh[m] = im;
    cityGroup.add(im);
  }
  const ix = [0, 0];
  for (let v = 0; v < NV; v++) {
    const k = vk[v];
    if (!k) {
      vinst[v] = -1;
      continue;
    }
    const m = isGlow(k) ? 1 : 0,
      i = ix[m]++;
    vm[v] = m;
    vinst[v] = i;
    const p = vPos(v);
    _m.makeTranslation(p[0], p[1], p[2]);
    voxMesh[m].setMatrixAt(i, _m);
    voxMesh[m].setColorAt(i, baseColor(v, _c));
  }
  for (const im of voxMesh) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  const gt = canvasTex(976, 976, drawGround(lots));
  const gp = mesh(
    new THREE.PlaneGeometry(GX + 16, GZ + 16),
    new THREE.MeshLambertMaterial({ map: gt }),
    0,
    0,
    0,
    cityGroup,
  );
  gp.rotation.x = -Math.PI / 2;
  gp.castShadow = false;
  const outer = mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: city.ground }),
    0,
    -0.03,
    0,
    cityGroup,
  );
  outer.rotation.x = -Math.PI / 2;
  outer.castShadow = false;
  outer.receiveShadow = false;
  trees = [];
  for (const l of lots)
    if (l.park) for (let i = 0; i < ri(5, 9); i++) trees.push([l.ox - HX + rand(0.6, 6.4), l.oz - HZ + rand(0.6, 6.4)]);
  for (let i = 0; i < 90; i++) {
    const a = rand(0, 6.283),
      r = rand(27, 40);
    trees.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const tg = new THREE.ConeGeometry(0.8, 2.2, 7);
  tg.translate(0, 1.1, 0);
  treeMesh = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial(), trees.length);
  treeMesh.castShadow = true;
  cityGroup.add(treeMesh);
  trees.forEach((t, i) => {
    const s = rand(0.75, 1.3);
    _o.position.set(t[0], 0, t[1]);
    _o.rotation.set(0, rand(0, 6), 0);
    _o.scale.set(s, s * rand(0.9, 1.3), s);
    _o.updateMatrix();
    treeMesh.setMatrixAt(i, _o.matrix);
    treeMesh.setColorAt(i, _c.setHSL(rand(0.24, 0.33), 0.45, city.night ? 0.18 : rand(0.28, 0.36)));
    t.push(true);
  });
  treeMesh.instanceMatrix.needsUpdate = true;
  if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
}
function hitTrees(x, z, R) {
  if (!treeMesh) return;
  let any = false;
  trees.forEach((t, i) => {
    if (!t[2]) return;
    if (Math.hypot(t[0] - x, t[1] - z) > R * 1.05) return;
    t[2] = false;
    any = true;
    treeMesh.setMatrixAt(i, ZERO);
    for (let k = 0; k < 3; k++)
      spawnDeb(
        t[0],
        1,
        t[1],
        rand(-6, 6),
        rand(5, 11),
        rand(-6, 6),
        rand(0.3, 0.5),
        _c.setHSL(0.28, 0.45, 0.3),
        rand(1.4, 2.4),
        false,
      );
  });
  if (any) treeMesh.instanceMatrix.needsUpdate = true;
}

/* ================= 잔해 ================= */
const MAXD = 2600;
const debMesh = new THREE.InstancedMesh(UBOX, new THREE.MeshLambertMaterial(), MAXD);
debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
debMesh.frustumCulled = false;
scene.add(debMesh);
for (let i = 0; i < MAXD; i++) {
  debMesh.setMatrixAt(i, ZERO);
  debMesh.setColorAt(i, _c.set(0xffffff));
}
const deb = new Array(MAXD).fill(null);
let debHead = 0,
  debCol = false;
function spawnDeb(x, y, z, vx, vy, vz, s, color, life, fall) {
  const i = debHead;
  debHead = (debHead + 1) % MAXD;
  deb[i] = {
    x,
    y,
    z,
    vx,
    vy,
    vz,
    s,
    rx: rand(0, 6),
    ry: rand(0, 6),
    rz: rand(0, 6),
    ax: fall ? rand(-0.7, 0.7) : rand(-9, 9),
    ay: rand(-3, 3),
    az: fall ? rand(-0.7, 0.7) : rand(-9, 9),
    life,
    land: false,
    fall,
  };
  debMesh.setColorAt(i, color);
  debCol = true;
}
function updDeb(dt) {
  for (let i = 0; i < MAXD; i++) {
    const d = deb[i];
    if (!d) continue;
    d.life -= dt;
    if (d.life <= 0) {
      deb[i] = null;
      debMesh.setMatrixAt(i, ZERO);
      continue;
    }
    d.vy -= 26 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    d.rx += d.ax * dt;
    d.ry += d.ay * dt;
    d.rz += d.az * dt;
    const h = d.s * 0.5;
    if (d.y < h) {
      d.y = h;
      if (!d.land && d.fall && Math.random() < 0.22)
        emit(
          SMOKE,
          d.x,
          0.5,
          d.z,
          rand(-1.5, 1.5),
          rand(0.4, 1.4),
          rand(-1.5, 1.5),
          rand(1.4, 2.4),
          1.3,
          4,
          0.62,
          0.58,
          0.54,
          0.5,
          { drag: 1.1 },
        );
      d.land = true;
      d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.25 : 0;
      d.vx *= 0.55;
      d.vz *= 0.55;
      d.ax *= 0.5;
      d.ay *= 0.5;
      d.az *= 0.5;
      d.life = Math.min(d.life, 1.5);
    }
    const sc = d.life < 0.5 ? (d.s * d.life) / 0.5 : d.s;
    _o.position.set(d.x, d.y, d.z);
    _o.rotation.set(d.rx, d.ry, d.rz);
    _o.scale.setScalar(sc);
    _o.updateMatrix();
    debMesh.setMatrixAt(i, _o.matrix);
  }
  debMesh.instanceMatrix.needsUpdate = true;
  if (debCol && debMesh.instanceColor) {
    debMesh.instanceColor.needsUpdate = true;
    debCol = false;
  }
}

/* ================= 폭발 ================= */
const pending = [],
  missiles = [];
let chainBudget = 0,
  collapseT = -1;
function destroyVoxel(v, ex, ey, ez, collapsed, spawn) {
  const k = vk[v],
    val = city.val * (k === K_VAULT ? 15 : 1) * run.st.mult,
    p = vPos(v);
  if (spawn) {
    baseColor(v, _c);
    if (collapsed)
      spawnDeb(p[0], p[1], p[2], rand(-0.5, 0.5), rand(-0.6, 0), rand(-0.5, 0.5), 0.96, _c, rand(3.2, 4.6), true);
    else {
      const dx = p[0] - ex,
        dy = p[1] - ey,
        dz = p[2] - ez,
        dl = Math.hypot(dx, dy, dz) || 1,
        sp = rand(6, 17);
      spawnDeb(
        p[0],
        p[1],
        p[2],
        (dx / dl) * sp + rand(-2, 2),
        (dy / dl) * sp + rand(4, 11),
        (dz / dl) * sp + rand(-2, 2),
        rand(0.25, 0.55),
        _c,
        rand(1.6, 3),
        false,
      );
    }
  }
  vk[v] = 0;
  voxMesh[vm[v]].setMatrixAt(vinst[v], ZERO);
  matDirty[vm[v]] = true;
  destroyedVox++;
  S.pts += val;
  S.earned += val;
  run.score += val;
  if (k === K_VAULT) {
    for (let n = 0; n < 26; n++)
      emit(FIRE, p[0], p[1], p[2], rand(-6, 6), rand(5, 15), rand(-6, 6), rand(0.7, 1.3), 0.55, 0.2, 1, 0.86, 0.3, 1, {
        flat: true,
        grav: 18,
        drag: 0.5,
      });
    popLabel(p[0], p[1] + 1.6, p[2], '금고 ×15', 'gold');
    sCoin();
  }
  return val;
}
function explodeAt(x, y, z, R, P, clusterN, bonus, big) {
  let gained = bonus || 0,
    spawned = 0;
  const cap = big ? 520 : Math.min(260, 40 + R * 28),
    chainP = run.st.chain;
  const gx0 = Math.max(0, Math.floor(x + HX - R)),
    gx1 = Math.min(GX - 1, Math.floor(x + HX + R)),
    gy0 = Math.max(0, Math.floor(y - R)),
    gy1 = Math.min(GY - 1, Math.floor(y + R)),
    gz0 = Math.max(0, Math.floor(z + HZ - R)),
    gz1 = Math.min(GZ - 1, Math.floor(z + HZ + R));
  for (let gy = gy0; gy <= gy1; gy++)
    for (let gz = gz0; gz <= gz1; gz++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const v = (gy * GZ + gz) * GX + gx;
        if (!vk[v]) continue;
        const cx = gx - HX + 0.5,
          cy = gy + 0.5,
          cz = gz - HZ + 0.5,
          d = Math.hypot(cx - x, cy - y, cz - z);
        if (d > R) continue;
        vhp[v] -= P * 2 * (1 - (0.6 * d) / R);
        if (vhp[v] <= 0) {
          const sp = spawned < cap && Math.random() < 0.5;
          if (sp) spawned++;
          gained += destroyVoxel(v, x, y, z, false, sp);
          if (chainP > 0 && chainBudget > 0 && Math.random() < chainP * 0.3) {
            chainBudget--;
            pending.push({ t: rand(0.12, 0.5), x: cx, y: cy, z: cz, R: Math.max(1.3, R * 0.45), P: P * 0.55 });
          }
        } else {
          baseColor(v, _c).lerp(_c2.set(0x2a2018), clamp(1 - vhp[v] / vmhp[v], 0, 1) * 0.75);
          voxMesh[vm[v]].setColorAt(vinst[v], _c);
          colDirty[vm[v]] = true;
        }
      }
  hitTrees(x, z, R);
  fx(x, y, z, R, big);
  for (let k = 0; k < clusterN; k++) {
    const a = rand(0, 6.283),
      sp = rand(5, 12);
    missiles.push({
      kind: 'mini',
      x,
      y: y + 0.6,
      z,
      vx: Math.cos(a) * sp,
      vy: rand(10, 18),
      vz: Math.sin(a) * sp,
      R: Math.max(1.4, R * 0.55),
      P: P * 0.6,
      pierce: 0,
      acc: 0,
      mesh: warheadMesh('mini', S.lv),
    });
  }
  if (gained > 0) popLabel(x, y + R * 0.6 + 1, z, '+' + fmt(gained), '');
  combo();
  collapseT = 0.2;
}
function fx(x, y, z, R, big) {
  const k = big ? 2.4 : 1;
  addBlast('ball', x, y, z, R * 0.2, R * 1.05 * (big ? 1.3 : 1), big ? 1.2 : 0.45, 0xff8a2a, 0.95);
  addBlast('ball', x, y, z, R * 0.1, R * 0.6, big ? 0.6 : 0.25, 0xffe9a0, 0.95);
  addBlast('ring', x, Math.max(0.15, y - R * 0.3), z, R * 0.4, R * (big ? 4.2 : 2.6), big ? 1.5 : 0.6, 0xfff1d0, 0.45);
  boomLight.position.set(x, y + R * 0.5 + 1, z);
  boomLight.distance = R * 7 + 10;
  boomLight.intensity = Math.min(7, 1.5 + R * 0.35) * (big ? 2 : 1);
  const nf = Math.min(150, 18 + R * 12) * k;
  for (let i = 0; i < nf; i++) {
    const a = rand(0, 6.283),
      b = rand(-0.3, 1.3),
      sp = rand(0.3, 1) * R * 3.2;
    emit(
      FIRE,
      x,
      y,
      z,
      Math.cos(a) * Math.cos(b) * sp,
      Math.sin(b) * sp + 2,
      Math.sin(a) * Math.cos(b) * sp,
      rand(0.35, 0.8) * (big ? 1.6 : 1),
      R * rand(0.35, 0.6),
      R * rand(0.1, 0.25),
      1,
      1,
      1,
      1,
      { drag: 3 },
    );
  }
  const ns = Math.min(90, 10 + R * 8) * k;
  for (let i = 0; i < ns; i++) {
    const a = rand(0, 6.283),
      sp = rand(0.2, 1) * R * 1.2,
      gr = rand(0.3, 0.48);
    emit(
      SMOKE,
      x + rand(-R, R) * 0.4,
      y + rand(0, R * 0.5),
      z + rand(-R, R) * 0.4,
      Math.cos(a) * sp,
      rand(1.5, 5) + R * 0.3,
      Math.sin(a) * sp,
      rand(1.8, 3.4) * (big ? 1.7 : 1),
      R * rand(0.4, 0.7),
      R * rand(1.2, 2),
      gr,
      gr * 0.96,
      gr * 0.92,
      0.55,
      { drag: 1.1 },
    );
  }
  for (let i = 0; i < 16 * k; i++)
    emit(
      FIRE,
      x,
      y,
      z,
      rand(-1, 1) * R * 5,
      rand(0.2, 1.2) * R * 5,
      rand(-1, 1) * R * 5,
      rand(0.4, 0.9),
      0.35,
      0.1,
      1,
      0.9,
      0.6,
      1,
      { flat: true, grav: 20, drag: 0.8 },
    );
  if (big) {
    for (let i = 0; i < 170; i++) {
      const t = Math.random(),
        yy = t * R * 1.8,
        rr = t > 0.8 ? R * 0.9 * Math.random() : R * 0.25 * Math.random(),
        a = rand(0, 6.283);
      emit(
        SMOKE,
        x + Math.cos(a) * rr,
        yy,
        z + Math.sin(a) * rr,
        Math.cos(a),
        rand(2, 6),
        Math.sin(a),
        rand(4, 6.5),
        R * 0.35,
        R * 0.9,
        0.55,
        0.45,
        0.4,
        0.6,
        { drag: 0.4 },
      );
    }
    addBlast('ball', x, R * 1.6, z, R * 0.3, R * 1.1, 2.4, 0xff7a30, 0.8);
  }
  rig.shake = Math.min(big ? 4 : 2.2, rig.shake + (big ? 3.5 : 0.25 + R * 0.12));
  sBoom(R, big);
}

/* 받칠 곳이 사라진 블록은 무너진다 */
const seen = new Uint8Array(NV),
  Q = new Int32Array(NV);
function collapse() {
  seen.fill(0);
  let h = 0,
    t = 0;
  for (let v = 0; v < LAYER; v++)
    if (vk[v]) {
      seen[v] = 1;
      Q[t++] = v;
    }
  while (h < t) {
    const v = Q[h++],
      x = v % GX,
      z = ((v / GX) | 0) % GZ,
      y = (v / LAYER) | 0;
    let j;
    if (x > 0 && vk[(j = v - 1)] && !seen[j]) {
      seen[j] = 1;
      Q[t++] = j;
    }
    if (x < GX - 1 && vk[(j = v + 1)] && !seen[j]) {
      seen[j] = 1;
      Q[t++] = j;
    }
    if (z > 0 && vk[(j = v - GX)] && !seen[j]) {
      seen[j] = 1;
      Q[t++] = j;
    }
    if (z < GZ - 1 && vk[(j = v + GX)] && !seen[j]) {
      seen[j] = 1;
      Q[t++] = j;
    }
    if (y > 0 && vk[(j = v - LAYER)] && !seen[j]) {
      seen[j] = 1;
      Q[t++] = j;
    }
    if (y < GY - 1 && vk[(j = v + LAYER)] && !seen[j]) {
      seen[j] = 1;
      Q[t++] = j;
    }
  }
  const list = [],
    ext = [];
  for (let v = LAYER; v < NV; v++)
    if (vk[v] && !seen[v]) {
      list.push(v);
      const x = v % GX,
        z = ((v / GX) | 0) % GZ,
        y = (v / LAYER) | 0;
      ext.push(
        x === 0 ||
          x === GX - 1 ||
          z === 0 ||
          z === GZ - 1 ||
          y === GY - 1 ||
          !vk[v - 1] ||
          !vk[v + 1] ||
          !vk[v - GX] ||
          !vk[v + GX] ||
          !vk[v - LAYER] ||
          !vk[v + LAYER],
      );
    }
  if (!list.length) return;
  const ne = ext.filter(Boolean).length,
    prob = Math.min(1, 900 / Math.max(1, ne));
  let g = 0,
    sx = 0,
    sy = 0,
    sz = 0,
    minY = 99;
  list.forEach((v, i) => {
    const p = vPos(v);
    sx += p[0];
    sy += p[1];
    sz += p[2];
    minY = Math.min(minY, p[1]);
    g += destroyVoxel(v, 0, 0, 0, true, ext[i] && Math.random() < prob);
  });
  const n = list.length,
    cx = sx / n,
    cz = sz / n;
  popLabel(cx, sy / n + 2, cz, '붕괴 +' + fmt(g), n >= 60 ? 'big' : '');
  for (let i = 0; i < Math.min(90, 10 + n / 6); i++) {
    const a = rand(0, 6.283),
      r = rand(0, Math.sqrt(n) * 0.25 + 1.5);
    emit(
      SMOKE,
      cx + Math.cos(a) * r,
      rand(0.5, 2),
      cz + Math.sin(a) * r,
      Math.cos(a) * rand(2, 6),
      rand(0.5, 2.5),
      Math.sin(a) * rand(2, 6),
      rand(2, 3.5),
      2,
      6,
      0.6,
      0.56,
      0.5,
      0.55,
      { drag: 0.9 },
    );
  }
  rig.shake = Math.min(2.5, rig.shake + Math.min(1.6, 0.3 + n / 300));
  sRumble(n);
  combo();
}

/* ================= 탄두 비행 ================= */
function dropWarhead(tx, ty, tz, main) {
  const st = run.st,
    isNuke = st.nuke > 0 && run.left === 1;
  if (!main && st.scope > 0) {
    const a = rand(0, 6.283),
      r = Math.sqrt(Math.random()) * st.scope;
    tx += Math.cos(a) * r;
    tz += Math.sin(a) * r;
  }
  const sx = tx - 16,
    sy = ty + 95,
    sz = tz - 12,
    dx = tx - sx,
    dy = ty - sy,
    dz = tz - sz,
    dl = Math.hypot(dx, dy, dz),
    sp = main ? 72 : 88,
    kind = isNuke ? 'nuke' : main ? 'main' : 'war';
  missiles.push({
    kind,
    x: sx,
    y: sy,
    z: sz,
    vx: (dx / dl) * sp,
    vy: (dy / dl) * sp,
    vz: (dz / dl) * sp,
    R: st.radius * (isNuke ? st.nuke : 1) * (main ? 1.15 : 1),
    P: st.power * (isNuke ? 6 : 1),
    pierce: st.pierce + (isNuke ? 3 : 0),
    acc: 0,
    mesh: warheadMesh(kind, S.lv),
  });
  run.left--;
  chainBudget += 10 + 5 * S.lv.chain;
  renderAmmo();
  sWhistle();
}
function boomMissile(b) {
  explodeAt(
    b.x,
    b.y,
    b.z,
    b.R,
    b.P,
    b.kind === 'mini' ? 0 : run.st.cluster + (b.kind === 'nuke' ? 4 : 0),
    b.acc,
    b.kind === 'nuke',
  );
}
function updMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const b = missiles[i];
    let alive = true;
    const speed = Math.hypot(b.vx, b.vy, b.vz),
      steps = Math.max(1, Math.ceil((speed * dt) / 0.35)),
      h = dt / steps;
    for (let s = 0; s < steps; s++) {
      if (b.kind === 'mini') b.vy -= 26 * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      if (b.y <= 0) {
        b.y = 0.3;
        boomMissile(b);
        alive = false;
        break;
      }
      if (Math.abs(b.x) > HX + 40 || Math.abs(b.z) > HZ + 40) {
        alive = false;
        break;
      }
      const v = cellAtW(b.x, b.y, b.z);
      if (v >= 0 && vk[v]) {
        if (b.pierce > 0 && vhp[v] <= b.P * 1.5) {
          b.pierce--;
          b.acc += destroyVoxel(v, b.x, b.y + 2, b.z, false, true);
          collapseT = 0.2;
          b.vx *= 0.97;
          b.vy *= 0.97;
          b.vz *= 0.97;
          for (let k = 0; k < 5; k++)
            emit(FIRE, b.x, b.y, b.z, rand(-5, 5), rand(2, 8), rand(-5, 5), 0.35, 0.4, 0.1, 1, 0.85, 0.5, 1, {
              flat: true,
              grav: 15,
            });
          continue;
        }
        b.x -= b.vx * h * 0.5;
        b.y -= b.vy * h * 0.5;
        b.z -= b.vz * h * 0.5;
        boomMissile(b);
        alive = false;
        break;
      }
    }
    if (!alive) {
      scene.remove(b.mesh);
      missiles.splice(i, 1);
      continue;
    }
    b.mesh.position.set(b.x, b.y, b.z);
    if (b.kind !== 'mini') {
      _v.set(b.vx, b.vy, b.vz).normalize();
      b.mesh.quaternion.setFromUnitVectors(UPV, _v);
      const fl = b.mesh.userData.flame;
      fl.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      const bs = b.kind === 'war' ? 1 : 1.7;
      for (let k = 0; k < 2; k++)
        emit(
          SMOKE,
          b.x - _v.x * 3 * bs + rand(-0.3, 0.3),
          b.y - _v.y * 3 * bs,
          b.z - _v.z * 3 * bs + rand(-0.3, 0.3),
          rand(-0.6, 0.6),
          rand(-0.2, 0.6),
          rand(-0.6, 0.6),
          rand(0.9, 1.6),
          0.9 * bs,
          3.2 * bs,
          0.93,
          0.93,
          0.95,
          0.5,
          { drag: 1.5 },
        );
      emit(
        FIRE,
        b.x - _v.x * 2.6 * bs,
        b.y - _v.y * 2.6 * bs,
        b.z - _v.z * 2.6 * bs,
        -_v.x * 8,
        -_v.y * 8,
        -_v.z * 8,
        0.22,
        1.1 * bs,
        0.3,
        1,
        1,
        1,
        1,
        { drag: 2 },
      );
    } else if (Math.random() < 0.6)
      emit(SMOKE, b.x, b.y, b.z, 0, 0.3, 0, 0.6, 0.4, 1.1, 0.4, 0.4, 0.42, 0.45, { drag: 1 });
  }
}

/* 조준 표시: 반경 그대로 보여주는 고리 */
const reticle = new THREE.Group();
reticle.visible = false;
scene.add(reticle);
{
  const rm = new THREE.MeshBasicMaterial({
    color: 0xffc531,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), rm);
  ring.rotation.x = -Math.PI / 2;
  reticle.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), rm);
  dot.rotation.x = -Math.PI / 2;
  reticle.add(dot);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.3), rm);
    t.rotation.x = -Math.PI / 2;
    t.rotation.z = (i * Math.PI) / 2;
    t.position.set(Math.sin((i * Math.PI) / 2) * 0.8, 0, Math.cos((i * Math.PI) / 2) * 0.8);
    reticle.add(t);
  }
  reticle.traverse(o => {
    o.renderOrder = 20;
  });
}
