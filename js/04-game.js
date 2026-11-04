/* 04-game.js — 화면 문구 · 연구실 UI · 발사→타격→결과 흐름 · 입력 · 메인 루프
 * 로드 순서: 01-data → 02-engine → 03-city → 04-game (index.html). 네 파일은 전역 스코프를 공유한다. */
'use strict';
if (!engineOK) throw new Error('3D 엔진 준비 실패로 04-game.js 을(를) 건너뜁니다');
/* ================= 화면 문구 ================= */
const labels = [];
function popLabel(x, y, z, txt, cls) {
  if (labels.length > 26) {
    const o = labels.shift();
    o.el.remove();
  }
  const el = document.createElement('div');
  el.className = 'pop' + (cls ? ' ' + cls : '');
  el.textContent = txt;
  $('#labels').appendChild(el);
  labels.push({ el, x, y, z, life: 1.4, max: 1.4 });
}
function updLabels(dt) {
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i];
    l.life -= dt;
    l.y += dt * 1.6;
    if (l.life <= 0) {
      l.el.remove();
      labels.splice(i, 1);
      continue;
    }
    _v2.set(l.x, l.y, l.z).project(camera);
    if (_v2.z > 1) {
      l.el.style.opacity = 0;
      continue;
    }
    l.el.style.transform = `translate(${(((_v2.x + 1) / 2) * vw).toFixed(1)}px,${(((1 - _v2.y) / 2) * vh).toFixed(1)}px) translate(-50%,-50%)`;
    l.el.style.opacity = Math.min(1, (l.life / l.max) * 2.5);
  }
}
function clearLabels() {
  for (const l of labels) l.el.remove();
  labels.length = 0;
}
let bannerTimer = 0;
function banner(txt, sub, dur) {
  const b = $('#banner');
  b.textContent = '';
  const s = document.createElement('small');
  s.textContent = sub;
  b.append(s, document.createTextNode(txt));
  b.hidden = false;
  if (b.animate && !reduceMotion.matches)
    b.animate(
      [
        { opacity: 0, transform: 'scale(1.25)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.15 },
        { opacity: 1, offset: 0.75 },
        { opacity: 0, transform: 'scale(.96)' },
      ],
      { duration: dur * 1000, easing: 'ease-out' },
    );
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    b.hidden = true;
  }, dur * 1000);
}
let comboN = 0,
  comboT = 0;
function combo() {
  comboN++;
  comboT = 1.5;
  if (run && comboN > run.maxCombo) run.maxCombo = comboN;
  if (comboN >= 3) {
    const c = $('#combo');
    c.hidden = false;
    c.textContent = comboN + ' 연쇄!';
    c.style.fontSize = Math.min(64, 28 + comboN * 1.2) + 'px';
  }
}
function setPrompt(t) {
  const p = $('#prompt');
  if (!t) {
    p.hidden = true;
    return;
  }
  p.hidden = false;
  if (p.textContent !== t) p.textContent = t;
}
function renderAmmo() {
  const el = $('#hAmmo');
  if (!run) {
    el.textContent = '';
    return;
  }
  const st = run.st;
  let h = '';
  for (let k = 0; k < st.ammo; k++) {
    const used = k < st.ammo - run.left,
      nk = st.nuke > 0 && k === st.ammo - 1;
    h += `<i class="${used ? 'used' : ''}${nk ? ' nuke' : ''}"></i>`;
  }
  el.innerHTML = h;
}
let hudT = 0;
function updHud(force) {
  if (!force && time - hudT < 0.1) return;
  hudT = time;
  const pct = destroyedVox / totalVox;
  $('#hPts').textContent = fmt(S.pts);
  $('#hPct').textContent = Math.round(pct * 100) + '%';
  $('#hBar').style.width = Math.min(100, pct * 100) + '%';
}
function wipe(mid, done) {
  const w = $('#wipe');
  w.hidden = false;
  const fast = reduceMotion.matches;
  const a = w.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: fast ? 150 : 520,
    fill: 'forwards',
    easing: 'ease-in',
  });
  a.onfinish = () => {
    mid();
    requestAnimationFrame(() => {
      const b = w.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: fast ? 150 : 750,
        fill: 'forwards',
        easing: 'ease-out',
      });
      b.onfinish = () => {
        w.hidden = true;
        if (done) done();
      };
    });
  };
}

/* ================= 연구실(발사장) ================= */
let rocket = null,
  tower = null;
function rebuildRocket(bump) {
  if (rocket) {
    padGroup.remove(rocket);
    disposeTree(rocket);
  }
  if (tower) {
    padGroup.remove(tower);
    disposeTree(tower);
  }
  rocket = buildRocket(S.lv);
  rocket.position.set(0, 0.42, 0);
  padGroup.add(rocket);
  tower = buildTower(rocket.userData);
  padGroup.add(tower);
  const R = rocket.userData;
  if (bump) {
    R.bump = 1;
    for (let i = 0; i < 46; i++) {
      const a = rand(0, 6.283),
        y = rand(0.5, R.H);
      emit(
        FIRE,
        Math.sin(a) * R.r1 * 1.3,
        y,
        Math.cos(a) * R.r1 * 1.3,
        Math.sin(a) * rand(1, 3),
        rand(1, 4),
        Math.cos(a) * rand(1, 3),
        rand(0.5, 1),
        0.55,
        0.15,
        1,
        0.85,
        0.35,
        1,
        { flat: true, drag: 2 },
      );
    }
  }
  rig.tx = 0;
  rig.tz = 0;
  rig.ty = R.H * 0.32;
  rig.size = 20 + R.H * 0.62;
  rig.ex = 0;
}
function renderPlate() {
  $('#pName').textContent = '키움 ' + (S.runs + 1) + '호';
  $('#pSpec').textContent =
    `${rankName()} · 전장 ${rocket ? Math.round(rocket.userData.H * 2.5) : 33}m · 탄두 ${stats().ammo}발`;
}
function renderLab() {
  $('#lPts').textContent = fmt(S.pts);
  $('#rankName').textContent = rankName();
  $('#rankLv').textContent = '총 개량 ' + totalLv() + '단계';
  const st = stats();
  $('#upgs').innerHTML = UPG.map(u => {
    const l = S.lv[u.id],
      mx = l >= u.max,
      cost = mx ? 0 : costOf(u, l),
      can = !mx && S.pts >= cost;
    return `<article class="upg${mx ? ' maxed' : ''}${can ? ' can' : ''}"><h3>${u.name}<span>Lv ${l}/${u.max}</span></h3>
      <span class="val">${u.fmt(u.val(l))}${mx ? '' : ' <b>→ ' + u.fmt(u.val(l + 1)) + '</b>'}</span>
      <button class="buy" type="button" data-id="${u.id}" ${can ? '' : 'disabled'}>${mx ? '최대' : fmt(cost) + ' P'}</button>
      <p>${u.desc}</p><div class="meter"><i style="width:${(l / u.max) * 100}%"></i></div></article>`;
  }).join('');
  $('#cities').innerHTML = CITIES.map((c, i) => {
    const locked = i > S.unlocked,
      weak = !locked && st.power * 2 * 0.7 < c.hp;
    return `<button class="city${i === S.city ? ' sel' : ''}" type="button" data-ci="${i}" ${locked ? 'disabled' : ''}>
      <span class="cname">${locked ? '잠긴 도시' : c.name}</span>
      <span class="cmeta">${locked ? `이전 도시 ${Math.round(UNLOCK * 100)}% 파괴 시 해금` : `블록 내구 ${c.hp < 10 ? c.hp : fmt(c.hp)} · 블록당 ${fmt(c.val)}P · 최고 ${Math.round((S.best[i] || 0) * 100)}%`}</span>
      ${weak ? '<span class="cwarn">위력이 부족해요. 블록이 잘 안 부서집니다</span>' : ''}</button>`;
  }).join('');
  renderPlate();
}
function clearFx() {
  FIRE.list.length = 0;
  SMOKE.list.length = 0;
  clearDeb();
  for (const b of blasts) {
    scene.remove(b.m);
    b.m.material.dispose();
  }
  blasts.length = 0;
  for (const m of missiles) scene.remove(m.mesh);
  missiles.length = 0;
  pending.length = 0;
  boomLight.intensity = 0;
  clearLabels();
  comboN = 0;
  comboT = 0;
  $('#combo').hidden = true;
  collapseT = -1;
}
function enterPad() {
  phase = 'pad';
  document.body.classList.remove('full');
  $('#hud').hidden = true;
  $('#plate').hidden = false;
  $('#result').hidden = true;
  setPrompt('');
  reticle.visible = false;
  clearFx();
  cityGroup.visible = false;
  padGroup.visible = true;
  applyLighting(PAD_LIGHT);
  scene.fog.near = 140;
  scene.fog.far = 360;
  rebuildRocket(false);
  $('#go').disabled = false;
  renderLab();
}
function updatePad(dt) {
  const R = rocket.userData;
  R.bump = Math.max(0, R.bump - dt * 2.2);
  rocket.scale.setScalar(1 + 0.09 * Math.sin(R.bump * Math.PI));
  tower.userData.beacon.visible = time % 1.2 < 0.6;
  if (Math.random() < dt * 2.4) {
    const a = rand(0, 6.283);
    emit(
      SMOKE,
      Math.sin(a) * R.r1,
      R.yS2 - 0.2,
      Math.cos(a) * R.r1,
      Math.sin(a) * 1.2,
      rand(-0.3, 0.2),
      Math.cos(a) * 1.2,
      rand(1.4, 2.2),
      0.5 * R.s,
      2.4 * R.s,
      0.97,
      0.97,
      0.98,
      0.5,
      { drag: 0.9 },
    );
  }
  rig.dx = 0.22 + 0.03 * Math.sin(time * 0.25);
  const sf = padGroup.userData.surf;
  if (sf) sf.material.opacity = 0.45 + 0.3 * Math.sin(time * 1.7);
}

/* ================= 발사 ================= */
let launchT = 0,
  rocketY = 0,
  rocketV = 0,
  lifted = false,
  wiping = false;
function startLaunch() {
  if (phase !== 'pad') return;
  initAudio();
  phase = 'launch';
  launchT = 0;
  rocketY = 0;
  rocketV = 0;
  lifted = false;
  wiping = false;
  $('#go').disabled = true;
  $('#plate').hidden = true;
  document.body.classList.add('full');
  rocket.scale.setScalar(1);
  rocket.userData.flame.visible = true;
  banner('점화', 'IGNITION', 1.1);
  sIgnite();
}
function updateLaunch(dt) {
  launchT += dt;
  const R = rocket.userData;
  for (const a of tower.userData.arms) a.rotation.y = lerp(a.rotation.y, a.userData.side * 1.4, Math.min(1, dt * 2.2));
  tower.userData.beacon.visible = time % 0.4 < 0.2;
  const ign = Math.min(1, launchT);
  R.flame.scale.set(1 + Math.random() * 0.1, (0.3 + 0.9 * ign) * (1 + Math.random() * 0.18), 1 + Math.random() * 0.1);
  if (launchT > 1.05) {
    if (!lifted) {
      lifted = true;
      banner('발사!', 'LIFT-OFF', 1.3);
    }
    const tt = launchT - 1.05;
    rocketV += (2.5 + 7 * tt) * dt;
    rocketY += rocketV * dt;
  }
  const tilt = Math.min(0.32, Math.max(0, rocketY - 6) * 0.012);
  rocket.rotation.x = -tilt;
  rocket.position.set(0, 0.42 + rocketY, -Math.max(0, rocketY - 6) * tilt * 0.5);
  _v.set(0, 0, 0);
  rocket.localToWorld(_v);
  const near = Math.max(0, 1 - rocketY / 14),
    ns = Math.round(4 + 6 * near);
  for (let i = 0; i < ns; i++) {
    if (near > 0.05) {
      const side = Math.random() < 0.55,
        a = rand(0, 6.283),
        sp = rand(5, 14) * near + 2;
      emit(
        SMOKE,
        _v.x + rand(-0.5, 0.5),
        0.8,
        _v.z + rand(-0.5, 0.5),
        side ? -rand(8, 16) : Math.cos(a) * sp,
        rand(0.4, 2.2),
        side ? rand(-2, 2) : Math.sin(a) * sp,
        rand(2.4, 4.2),
        1.6 * R.s,
        7 * R.s,
        0.9,
        0.89,
        0.88,
        0.62,
        { drag: 0.7 },
      );
    } else
      emit(
        SMOKE,
        _v.x + rand(-0.3, 0.3),
        _v.y - rand(0, 1),
        _v.z + rand(-0.3, 0.3),
        rand(-1, 1),
        rand(-4, -1),
        rand(-1, 1),
        rand(1.6, 2.6),
        1.2 * R.s,
        4.5 * R.s,
        0.92,
        0.92,
        0.93,
        0.55,
        { drag: 1 },
      );
  }
  for (let i = 0; i < 3; i++)
    emit(
      FIRE,
      _v.x,
      _v.y - 0.3,
      _v.z,
      rand(-1.5, 1.5),
      -rand(10, 20),
      rand(-1.5, 1.5),
      rand(0.15, 0.3),
      R.r1 * 1.6,
      R.r1 * 0.6,
      1,
      1,
      1,
      1,
      { drag: 2 },
    );
  rig.shake = lifted ? 0.6 * Math.exp(-rocketY / 25) + 0.05 : 0.25 * ign;
  rig.ty = lerp(rig.ty, R.H * 0.32 + rocketY * 0.7, Math.min(1, dt * 2.5));
  if (lifted) rig.ex += dt * 4;
  if (!wiping && (launchT > 4.2 || rocketY > 60)) {
    wiping = true;
    wipe(enterStrike);
  }
}

/* ================= 도시 타격 ================= */
let strikeT = 0,
  endT = 0,
  mainDropped = false;
function enterStrike() {
  phase = 'strike';
  strikeT = 0;
  endT = 0;
  mainDropped = false;
  clearFx();
  padGroup.visible = false;
  rocket.userData.flame.visible = false;
  genCity(S.city);
  cityGroup.visible = true;
  applyLighting(city);
  scene.fog.near = 210;
  scene.fog.far = 520;
  const st = stats();
  run = { st, left: st.ammo, score: 0, maxCombo: 0, ci: S.city };
  chainBudget = 0;
  rig.tx = 0;
  rig.ty = 0;
  rig.tz = 1.5;
  rig.size = camera.aspect < 1 ? 66 : 52;
  rig.ex = 60;
  rig.shake = 0;
  rig.dx = 0.22;
  reticle.scale.setScalar(st.radius);
  reticle.visible = false;
  $('#hud').hidden = false;
  $('#hCity').textContent = city.name;
  renderAmmo();
  updHud(true);
  banner(city.name, 'TARGET', 1.8);
  setPrompt('');
}
function pickMainTarget() {
  let best = -1e9,
    out = [0, 1, 0];
  for (let gz = 0; gz < GZ; gz++)
    for (let gx = 0; gx < GX; gx++) {
      let h = -1;
      for (let y = GY - 1; y >= 0; y--)
        if (vk[vIdx(gx, y, gz)]) {
          h = y;
          break;
        }
      if (h < 0) continue;
      const sc = h - Math.hypot(gx - HX + 0.5, gz - HZ + 0.5) * 0.35 + Math.random() * 0.5;
      if (sc > best) {
        best = sc;
        out = [gx - HX + 0.5, h + 1, gz - HZ + 0.5];
      }
    }
  return out;
}
const canFire = () => phase === 'strike' && mainDropped && run.left > 0 && !missiles.some(m => m.kind !== 'mini');
function updateStrike(dt) {
  strikeT += dt;
  rig.ex = lerp(rig.ex, 0, Math.min(1, dt * 1.5));
  if (phase !== 'strike') return;
  if (!mainDropped && strikeT > 1.2) {
    mainDropped = true;
    const t = pickMainTarget();
    dropWarhead(t[0], t[1], t[2], true);
  }
  const flying = missiles.some(m => m.kind !== 'mini');
  if (!mainDropped || flying) setPrompt(mainDropped ? '탄두 낙하 중' : '목표 확인 중');
  else if (run.left > 0)
    setPrompt(
      `도시를 터치해 추가 탄두 투하 · 남은 ${run.left}발${run.st.nuke > 0 && run.left === 1 ? ' (메가톤)' : ''}`,
    );
  else setPrompt('');
  if (mainDropped && run.left === 0 && !missiles.length && !pending.length && collapseT < 0) {
    endT += dt;
    if (endT > 2.2) endRun();
  } else endT = 0;
  updHud();
}
function endRun() {
  phase = 'result';
  setPrompt('');
  reticle.visible = false;
  const pct = destroyedVox / totalVox,
    ci = run.ci;
  S.best[ci] = Math.max(S.best[ci] || 0, pct);
  S.runs++;
  let unlock = '';
  if (pct >= UNLOCK && ci === S.unlocked && ci < CITIES.length - 1) {
    S.unlocked++;
    S.city = S.unlocked;
    unlock = `새 목표 해금: ${CITIES[ci + 1].name}. 다음 출격 목표로 정해 두었어요.`;
  }
  persist();
  updHud(true);
  $('#rTitle').textContent =
    pct >= 0.8 ? '완전 초토화' : pct >= UNLOCK ? '작전 성공' : pct >= 0.15 ? '부분 성공' : '아쉬운 결과';
  $('#rEarn').textContent = '+' + fmt(run.score) + ' P';
  $('#rBlocks').textContent = fmt(destroyedVox) + ' / ' + fmt(totalVox);
  $('#rPct').textContent = Math.round(pct * 100) + '%';
  $('#rCombo').textContent = run.maxCombo + '연쇄';
  $('#rPts').textContent = fmt(S.pts) + ' P';
  const u = $('#rUnlock');
  u.classList.toggle('hint', !unlock);
  if (unlock) {
    u.hidden = false;
    u.textContent = unlock;
  } else if (ci === S.unlocked && ci < CITIES.length - 1) {
    u.hidden = false;
    u.textContent = `${Math.round(UNLOCK * 100)}% 이상 부수면 ${CITIES[ci + 1].name}이(가) 열립니다. 위력과 반경을 올려 보세요.`;
  } else u.hidden = true;
  $('#result').hidden = false;
  $('#toLab').focus();
}

/* ================= 입력 ================= */
const ray = new THREE.Raycaster(),
  _ndc = new THREE.Vector2();
function pickCity(e) {
  const r = glCanvas.getBoundingClientRect();
  _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(_ndc, camera);
  const o = ray.ray.origin,
    d = ray.ray.direction;
  if (d.y > -0.01) return null;
  const tg = o.y / -d.y;
  for (let t = Math.max(0, (o.y - GY - 1) / -d.y); t < tg; t += 0.25) {
    const x = o.x + d.x * t,
      y = o.y + d.y * t,
      z = o.z + d.z * t,
      v = cellAtW(x, y, z);
    if (v >= 0 && vk[v]) return [x, y, z];
  }
  const gx = o.x + d.x * tg,
    gz = o.z + d.z * tg;
  return Math.abs(gx) > HX + 4 || Math.abs(gz) > HZ + 4 ? null : [gx, 0, gz];
}
let downX = 0,
  downY = 0;
glCanvas.addEventListener('pointermove', e => {
  if (phase !== 'strike' || e.pointerType === 'touch') return;
  const p = pickCity(e);
  reticle.visible = !!p && canFire();
  if (p) reticle.position.set(p[0], p[1] + 0.06, p[2]);
});
glCanvas.addEventListener('pointerleave', () => {
  if (canFire()) reticle.visible = false;
});
glCanvas.addEventListener('pointerdown', e => {
  initAudio();
  downX = e.clientX;
  downY = e.clientY;
});
glCanvas.addEventListener('pointerup', e => {
  if (!canFire() || Math.hypot(e.clientX - downX, e.clientY - downY) > 16) return;
  const p = pickCity(e);
  if (!p) return;
  reticle.visible = true;
  reticle.position.set(p[0], p[1] + 0.06, p[2]);
  dropWarhead(p[0], p[1], p[2], false);
});
window.addEventListener('keydown', e => {
  if (
    (e.key === ' ' || e.key === 'Enter') &&
    canFire() &&
    (document.activeElement === document.body || document.activeElement === glCanvas)
  ) {
    e.preventDefault();
    const t = pickMainTarget();
    dropWarhead(t[0], t[1], t[2], false);
  }
});
$('#go').addEventListener('click', startLaunch);
$('#toLab').addEventListener('click', () => {
  $('#result').hidden = true;
  wipe(enterPad);
});
$('#again').addEventListener('click', () => {
  initAudio();
  $('#result').hidden = true;
  wipe(enterPad, () => setTimeout(startLaunch, 250));
});
$('#retreat').addEventListener('click', () => {
  if (phase !== 'strike') return;
  run.left = 0;
  for (const m of missiles) scene.remove(m.mesh);
  missiles.length = 0;
  pending.length = 0;
  endRun();
});
document.querySelectorAll('.mute').forEach(b =>
  b.addEventListener('click', () => {
    initAudio();
    setMuted(!muted);
  }),
);
$('#upgs').addEventListener('click', e => {
  const b = e.target.closest('.buy');
  if (!b || b.disabled || phase !== 'pad') return;
  initAudio();
  const u = UP[b.dataset.id],
    l = S.lv[u.id];
  if (l >= u.max) return;
  const c = costOf(u, l);
  if (S.pts < c) return;
  S.pts -= c;
  S.lv[u.id]++;
  persist();
  sBuy();
  rebuildRocket(true);
  renderLab();
  const nb = document.querySelector(`.buy[data-id="${u.id}"]`);
  if (nb && !nb.disabled) nb.focus();
});
$('#cities').addEventListener('click', e => {
  const b = e.target.closest('.city');
  if (!b || b.disabled) return;
  S.city = +b.dataset.ci;
  persist();
  renderLab();
});
let resetArm = 0;
$('#reset').addEventListener('click', () => {
  const b = $('#reset');
  if (Date.now() - resetArm < 3000) {
    S = defSave();
    persist();
    resetArm = 0;
    b.textContent = '초기화했습니다';
    rebuildRocket(false);
    renderLab();
  } else {
    resetArm = Date.now();
    b.textContent = '한 번 더 누르면 모든 기록이 지워집니다';
    setTimeout(() => {
      if (b.textContent.startsWith('한 번')) b.textContent = '기록 초기화';
    }, 3000);
  }
});

/* ================= 그래픽 설정 · 끊김 감지 ================= */
const GFX_NOTE = {
  high: '그림자와 불꽃을 모두 그립니다.',
  mid: '그림자와 불꽃을 줄여 조금 가볍게 그립니다.',
  low: '그림자를 끄고 화면을 덜 선명하게 그립니다. 배터리를 덜 씁니다.',
};
function renderGfx() {
  document
    .querySelectorAll('#gfx button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === gfxSave.pref)));
  $('#gfxNote').textContent =
    gfxSave.pref === 'auto'
      ? `화면이 끊기면 알아서 낮춥니다. 지금은 ${GFX[gfxLevel].name}이에요.`
      : GFX_NOTE[gfxSave.pref];
}
let toastTimer = 0;
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4000);
}
/* 자동 모드: 2초씩 평균 프레임을 재서 40fps 아래가 두 번 이어지면 한 단계 낮춘다.
 * 다시 올리지는 않는다(오르내림 반복 방지). 1.5초 넘게 멈춘 프레임(탭 전환 등)은 빼고 잰다. */
const fpsW = { t: 0, n: 0, slow: 0, hold: 1.5 };
function resetFpsWatch() {
  fpsW.t = fpsW.n = fpsW.slow = 0;
  fpsW.hold = 1.5; // 품질을 바꾼 직후에는 셰이더를 다시 만드느라 잠깐 끊기니 쉬었다 잰다
}
function watchFps(raw) {
  if (gfxSave.pref !== 'auto' || gfxLevel === 'low' || document.hidden || raw <= 0 || raw > 1.5) return;
  if (fpsW.hold > 0) {
    fpsW.hold -= raw;
    return;
  }
  fpsW.t += raw;
  fpsW.n++;
  if (fpsW.t < 2) return;
  const fps = fpsW.n / fpsW.t;
  fpsW.t = fpsW.n = 0;
  fpsW.slow = fps < 40 ? fpsW.slow + 1 : 0;
  if (fpsW.slow < 2) return;
  const next = GFX_ORDER[GFX_ORDER.indexOf(gfxLevel) + 1];
  gfxSave.auto = next;
  persistGfx();
  applyGfx(next);
  resetFpsWatch();
  renderGfx();
  toast(`화면이 끊겨서 그래픽을 ${GFX[next].name}으로 낮췄어요.`);
}
$('#gfx').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  gfxSave.pref = b.dataset.q;
  if (gfxSave.pref === 'auto') gfxSave.auto = ''; // 자동을 다시 고르면 처음부터 다시 잰다
  persistGfx();
  applyGfx(gfxStartLevel());
  resetFpsWatch();
  renderGfx();
});
/* 실기기 확인용 측정 표시: 주소 끝에 ?fps 를 붙이면 화면 오른쪽 아래에 나온다 */
const perfEl = /[?&]fps\b/.test(location.search) ? document.createElement('div') : null;
if (perfEl) {
  perfEl.id = 'perf';
  stageEl.appendChild(perfEl);
}
let perfN = 0,
  perfAcc = 0;
function updPerf(raw) {
  if (!perfEl) return;
  perfN++;
  perfAcc += raw;
  if (perfAcc < 0.5) return;
  const r = renderer.info.render,
    vox = cityGroup.visible
      ? ` · 블록 ${fmt(voxMesh[0].count + voxMesh[1].count)}/${fmt(totalVox - destroyedVox)}`
      : '';
  perfEl.textContent =
    `${Math.round(perfN / perfAcc)} fps · 그래픽 ${GFX[gfxLevel].name} · 그리기 ${r.calls}회 · 삼각형 ${fmt(r.triangles)}` +
    `${vox} · 불꽃 ${FIRE.list.length} · 연기 ${SMOKE.list.length}`;
  perfN = perfAcc = 0;
}

/* ================= 메인 루프 ================= */
let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000,
    dt = Math.min(0.05, raw);
  last = now;
  watchFps(raw);
  updPerf(raw);
  time += dt;
  if (phase === 'pad') updatePad(dt);
  else if (phase === 'launch') updateLaunch(dt);
  else updateStrike(dt);
  if (phase === 'strike' || phase === 'result') {
    updMissiles(dt);
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        pending.splice(i, 1);
        explodeAt(p.x, p.y, p.z, p.R, p.P, 0, 0, false);
      }
    }
    if (collapseT >= 0) {
      collapseT -= dt;
      if (collapseT < 0) collapse();
    }
  }
  updDeb(dt);
  updPool(FIRE, dt);
  updPool(SMOKE, dt);
  updBlasts(dt);
  updLabels(dt);
  if (comboT > 0) {
    comboT -= dt;
    if (comboT <= 0) {
      comboN = 0;
      $('#combo').hidden = true;
    }
  }
  flushVox();
  if (phase !== 'launch') {
    rig.shake *= Math.pow(0.05, dt);
    if (rig.shake < 0.01) rig.shake = 0;
  }
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
applyGfx(gfxStartLevel()); // 픽셀 비율·그림자를 정하고 resize() 까지 한다
new ResizeObserver(resize).observe(stageEl);
genPadEnv();
setMuted(false);
enterPad();
renderGfx();
if (document.fonts && document.fonts.ready)
  document.fonts.ready.then(() => {
    if (bodyTex) bodyTex.userData.redraw();
    if (padTex) padTex.userData.redraw();
  });
requestAnimationFrame(frame);
