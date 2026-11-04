/* VFX 실험실 — tools/vfx-lab.html 에서만 쓴다. 게임 화면(index.html)의 마크업과 스크립트를 그대로 불러온 뒤
 *  - 폭발을 버튼 · 숫자 키로 바로 터뜨리고
 *  - 일시정지 · 한 프레임씩 · 느리게 보기로 살펴보고
 *  - 손맛 값(FEEL_TUNE)을 슬라이더로 맞춰 "값 복사"로 꺼낸다.
 * 주소 끝에 ?shots 를 붙이면 패널과 자체 루프 없이 열린다. 그때는 tools/vfx-shots.js 가 LAB.tick() 으로 시간을 직접 흘린다.
 * 게임 스크립트와 전역 이름이 겹치지 않도록 전부 이 함수 안에 두고, 밖에는 window.LAB 만 내놓는다. */
(() => {
  'use strict';
  const SHOTS = new URLSearchParams(location.search).has('shots');
  const nativeRaf = window.requestAnimationFrame.bind(window);

  /* 시계: 게임이 요청한 다음 프레임 콜백을 모아 두었다가, 실험실이 정한 만큼만 시간을 흘려 보낸다.
   * 게임의 frame(now)은 now 차이로 dt 를 구하므로, now 를 실험실이 정하면 배속 · 정지 · 한 프레임 진행이 된다. */
  const clock = { q: [], now: 0, speed: 1, paused: false, steps: 0 };
  window.requestAnimationFrame = cb => {
    clock.q.push(cb);
    return clock.q.length;
  };
  /* draw 가 false 면 게임 계산만 하고 그리지 않는다. 찍지 않을 프레임까지 그리면 GPU 없는 환경에서 아주 느려진다 */
  function tick(sec, draw) {
    clock.now += sec * 1000;
    const q = clock.q.splice(0),
      real = draw === false && typeof renderer !== 'undefined' ? renderer.render : null;
    if (real) renderer.render = () => {};
    try {
      for (const cb of q) cb(clock.now);
    } finally {
      if (real) renderer.render = real;
    }
  }

  const LAB = { ready: false, tick, setup, hit, chain, drop, info, topAt };
  window.LAB = LAB;
  const panel = document.getElementById('lab');
  boot().catch(e => {
    console.error(e);
    panel.textContent = '실험실을 열지 못했습니다: ' + e.message + ' (npm start 로 띄운 주소에서 열어 주세요)';
  });

  async function boot() {
    if (SHOTS) document.body.classList.add('shots');
    const base = new URL('../index.html', location.href);
    const res = await fetch(base);
    if (!res.ok) throw new Error('index.html 을 읽지 못했습니다');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const css = [];
    for (const l of doc.querySelectorAll('link[rel="stylesheet"]')) {
      const n = document.createElement('link');
      n.rel = 'stylesheet';
      n.href = new URL(l.getAttribute('href'), base).href;
      css.push(
        new Promise(ok => {
          n.onload = n.onerror = ok;
          setTimeout(ok, 3000); // 웹 글꼴이 막힌 환경에서도 기다리다 멈추지 않게
        }),
      );
      document.head.appendChild(n);
    }
    const srcs = [];
    for (const node of [...doc.body.childNodes]) {
      if (node.nodeName === 'SCRIPT') srcs.push(new URL(node.getAttribute('src'), base).href);
      else if (node.nodeType === 1) document.body.insertBefore(document.importNode(node, true), panel);
    }
    await Promise.all(css); // #stage 크기가 CSS 로 정해지므로 스타일이 온 뒤에 3D 엔진을 켠다
    for (const src of srcs) await loadScript(src); // 게임과 같은 순서로 하나씩
    if (typeof engineOK === 'undefined' || !engineOK) throw new Error('3D 엔진(WebGL)을 켜지 못했습니다');
    init();
  }
  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => no(new Error('스크립트를 불러오지 못했습니다: ' + src));
      document.body.appendChild(s);
    });
  }

  function init() {
    clock.now = last; // 04-game.js 가 기억하는 마지막 프레임 시각. 첫 프레임 dt 가 0 이 되게 맞춘다
    document.body.classList.add('full');
    resize(); // 게임은 출격 때 화면이 넓어진 뒤 도시에 들어간다. 같은 순서가 되도록 카메라 비율을 먼저 맞춘다
    setup({ city: 0, lv: { radius: 4, power: 3 } });
    if (!SHOTS) {
      buildPanel();
      bindInput();
      runLoop();
    }
    LAB.ready = true;
  }

  /* ---------- 장면 준비와 터뜨리기 ---------- */
  /* o: { city: 도시 번호, lv: { radius, power, ... } }. 저장은 막혀 있으니 S 를 마음대로 바꿔도 된다 */
  function setup(o) {
    const lv = defSave().lv;
    Object.assign(lv, (o && o.lv) || {});
    for (const u of UPG) lv[u.id] = clamp(lv[u.id] | 0, 0, u.max);
    S.lv = lv;
    S.city = clamp((o && o.city) | 0, 0, CITIES.length - 1);
    enterStrike();
    mainDropped = true; // 첫 탄두 자동 투하를 막는다. 터뜨리는 건 실험실이 한다
    run.left = 99; // 탄두가 떨어져 작전 보고서가 뜨지 않게
    rig.ex = 0; // 도시에 들어갈 때의 줌인 연출을 건너뛴다
    $('#banner').hidden = true;
  }
  function ensureStrike() {
    if (phase !== 'strike' || !run) setup({ city: S.city, lv: S.lv });
  }
  function topAt(x, z) {
    for (let y = GY - 1; y >= 0; y--) {
      const v = cellAtW(x, y + 0.5, z);
      if (v >= 0 && vk[v]) return [x, y + 1, z];
    }
    return [x, 0.3, z];
  }
  let ptr = null; // 마지막으로 캔버스 위에 있던 마우스 위치
  function aimPoint() {
    const p = ptr && pickCity(ptr);
    return p || topAt(rand(-14, 14), rand(-14, 14));
  }
  /* kind: 'main' 본탄(가장 높은 건물) · 'war' 추가 탄두(마우스 위치) · 'nuke' 메가톤. 비행 없이 바로 명중시킨다 */
  function hit(kind, at) {
    ensureStrike();
    const st = run.st,
      nuke = kind === 'nuke',
      p = at || (kind === 'war' ? aimPoint() : pickMainTarget());
    boomMissile({
      kind,
      x: p[0],
      y: p[1],
      z: p[2],
      R: st.radius * (nuke ? Math.max(2.2, st.nuke) : 1) * (kind === 'main' ? 1.15 : 1),
      P: st.power * (nuke ? 6 : 1),
      pierce: 0,
      acc: 0,
    });
    run.left = 99;
  }
  /* 연쇄 기폭 크기의 작은 폭발 하나 */
  function chain() {
    ensureStrike();
    const st = run.st,
      p = aimPoint();
    explodeAt(p[0], p[1] - 0.5, p[2], Math.max(1.3, st.radius * 0.45), st.power * 0.55, 0, 0, false);
  }
  /* 실제 게임처럼 하늘에서 본탄을 떨어뜨린다(휘파람 · 비행 · 관통 포함) */
  function drop() {
    ensureStrike();
    const t = pickMainTarget();
    dropWarhead(t[0], t[1], t[2], true);
    run.left = 99;
  }
  function info() {
    const a = [`불 ${FIRE.list.length} · 연기 ${SMOKE.list.length} · 구체 ${blasts.length} · 블록 ${destroyedVox}`];
    if (typeof FEEL !== 'undefined')
      a.push(
        `충격 ${FEEL.trauma.toFixed(2)} · 멈춤 ${Math.max(0, FEEL.stop).toFixed(3)}초 · 느리게 ${Math.max(0, FEEL.slow).toFixed(2)}초`,
        `섬광 ${FEEL.flash.toFixed(2)} · 낙차 ${FEEL.dip.toFixed(2)} · 밀림 ${FEEL.kick.toFixed(3)}`,
      );
    else a.push(`흔들림 ${rig.shake.toFixed(2)}`);
    return a.join('\n');
  }

  /* ---------- 패널 ---------- */
  const LV_IDS = ['radius', 'power', 'cluster', 'chain', 'nuke'];
  /* 손맛 값 슬라이더: 키 → [이름, 최소, 최대, 간격]. 여기 없는 키는 현재 값으로 범위를 짐작한다 */
  const TUNE_META = {
    stopBase: ['히트스톱 기본(초)', 0, 0.2, 0.005],
    stopPerR: ['히트스톱 반경당', 0, 0.02, 0.0005],
    stopMax: ['히트스톱 최대', 0, 0.3, 0.005],
    stopNuke: ['히트스톱 메가톤', 0, 0.5, 0.01],
    slowNuke: ['슬로모션 길이(메가톤)', 0, 3, 0.05],
    slowK: ['슬로모션 시작 배속', 0.05, 1, 0.05],
    trauma: ['폭발마다 충격', 0, 0.5, 0.01],
    traumaPerR: ['폭발 충격 반경당', 0, 0.2, 0.005],
    traumaHit: ['명중 충격', 0, 1, 0.01],
    traumaHitPerR: ['명중 충격 반경당', 0, 0.2, 0.005],
    traumaFade: ['충격 빠지는 속도(1초에)', 0.2, 5, 0.1],
    shake: ['흔들림 폭(칸)', 0, 6, 0.1],
    roll: ['화면 기울기(라디안)', 0, 0.15, 0.005],
    shakeHz: ['흔들림 빠르기', 0.2, 3, 0.05],
    kick: ['카메라 밀림', 0, 0.2, 0.005],
    kickPerR: ['카메라 밀림 반경당', 0, 0.02, 0.0005],
    kickMax: ['카메라 밀림 최대', 0, 0.3, 0.005],
    kickNuke: ['카메라 밀림 메가톤', 0, 0.4, 0.01],
    flash: ['섬광', 0, 1, 0.01],
    flashPerR: ['섬광 반경당', 0, 0.1, 0.005],
    flashMax: ['섬광 최대', 0, 1, 0.01],
    flashNuke: ['섬광 메가톤', 0, 1, 0.01],
    flashFade: ['섬광 사라지는 속도', 2, 60, 1],
    dip: ['조명 낙차', 0, 0.9, 0.01],
    dipPerR: ['조명 낙차 반경당', 0, 0.1, 0.005],
    dipMax: ['조명 낙차 최대', 0, 0.9, 0.01],
    dipNuke: ['조명 낙차 메가톤', 0, 0.9, 0.01],
    dipNight: ['밤 도시 낙차 비율', 0, 1, 0.05],
    dipFade: ['조명 돌아오는 속도', 0.5, 15, 0.5],
  };
  const num = v => String(+(+v).toFixed(4));
  let tuneDefault = null,
    infoEl = null;
  function mk(tag, props, kids) {
    const e = Object.assign(document.createElement(tag), props || {});
    for (const k of kids || []) e.append(k);
    return e;
  }
  function btn(txt, key, fn, data) {
    const b = mk('button', { type: 'button', onclick: fn });
    if (key) b.append(mk('kbd', { textContent: key }));
    b.append(txt);
    if (data) b.dataset.lab = data;
    return b;
  }
  function slider(name, min, max, step, get, set, changed) {
    const out = mk('output'),
      inp = mk('input', { type: 'range', min, max, step, value: get() }),
      lab = mk('label', {}, [mk('span', { textContent: name }), out, inp]);
    const show = () => {
      out.textContent = num(get());
      lab.classList.toggle('changed', !!(changed && changed()));
    };
    inp.oninput = () => {
      set(+inp.value);
      show();
    };
    show();
    lab.sync = () => {
      inp.value = get();
      show();
    };
    return lab;
  }
  function buildPanel() {
    const narrow = innerWidth < 600;
    const fire = mk('div', { className: 'row' }, [
      btn('본탄', '1', () => hit('main'), 'main'),
      btn('추가 탄두', '2', () => hit('war'), 'war'),
      btn('메가톤', '3', () => hit('nuke'), 'nuke'),
      btn('연쇄', '4', chain, 'chain'),
      btn('하늘에서 투하', '5', drop, 'drop'),
    ]);
    const pauseB = btn('일시정지', 'P', () => togglePause());
    const togglePause = () => {
      clock.paused = !clock.paused;
      pauseB.lastChild.textContent = clock.paused ? '재생' : '일시정지';
    };
    LAB.togglePause = togglePause;
    const speed = mk('select', { ariaLabel: '배속' });
    for (const s of [1, 0.5, 0.25, 0.1]) speed.append(mk('option', { value: s, textContent: '×' + s }));
    speed.onchange = () => (clock.speed = +speed.value);
    const play = mk('div', { className: 'row' }, [pauseB, btn('한 프레임', '.', () => clock.steps++), speed]);

    const citySel = mk('select', { ariaLabel: '도시' });
    CITIES.forEach((c, i) => citySel.append(mk('option', { value: i, textContent: c.name })));
    citySel.value = S.city;
    citySel.onchange = () => setup({ city: +citySel.value, lv: S.lv });
    const lvs = LV_IDS.map(id =>
      slider(
        UP[id].name + ' Lv',
        0,
        UP[id].max,
        1,
        () => S.lv[id],
        v => {
          S.lv[id] = v;
          if (run) {
            run.st = stats();
            reticle.scale.setScalar(run.st.radius);
          }
        },
      ),
    );
    const scene0 = mk('div', { className: 'row' }, [
      citySel,
      btn('도시 새로', 'R', () => setup({ city: S.city, lv: S.lv })),
    ]);

    infoEl = mk('div', { className: 'info' });
    const kids = [
      mk('h3', { textContent: '터뜨리기' }),
      fire,
      mk('h3', { textContent: '재생' }),
      play,
      infoEl,
      mk('h3', { textContent: '장면' }),
      scene0,
      ...lvs,
    ];

    if (typeof FEEL_TUNE !== 'undefined') {
      tuneDefault = Object.assign({}, FEEL_TUNE);
      const out = mk('textarea', { readOnly: true, ariaLabel: '복사할 값' });
      const sliders = Object.keys(FEEL_TUNE).map(k => {
        const v = tuneDefault[k],
          m = TUNE_META[k] || [k, 0, Math.max(1, v * 4), v >= 1 ? 0.1 : 0.001];
        return slider(
          m[0],
          m[1],
          m[2],
          m[3],
          () => FEEL_TUNE[k],
          x => (FEEL_TUNE[k] = x),
          () => FEEL_TUNE[k] !== tuneDefault[k],
        );
      });
      const copyB = btn('값 복사', '', () => {
        out.value = tuneText();
        out.select();
        const done = t => (copyB.textContent = t);
        if (navigator.clipboard)
          navigator.clipboard.writeText(out.value).then(
            () => done('복사했습니다'),
            () => done('아래 글을 직접 복사해 주세요'),
          );
        else done('아래 글을 직접 복사해 주세요');
        setTimeout(() => done('값 복사'), 1800);
      });
      const resetB = btn('기본값', '', () => {
        Object.assign(FEEL_TUNE, tuneDefault);
        sliders.forEach(s => s.sync());
        out.value = '';
      });
      kids.push(
        mk('details', {}, [
          mk('summary', { className: 'sub', textContent: `손맛 값 ${sliders.length}개 (FEEL_TUNE · 02-engine.js)` }),
          mk('div', { className: 'in' }, [...sliders, mk('div', { className: 'row' }, [copyB, resetB]), out]),
        ]),
      );
    }
    kids.push(
      mk('p', {
        className: 'note',
        textContent:
          '진짜 저장은 바뀌지 않습니다. 화면을 클릭하면 게임처럼 탄두가 날아가고, 2 · 4 키는 마우스가 가리키는 곳에 바로 터집니다. 바꾼 값은 새로고침하면 돌아가니 "값 복사"로 꺼내 두세요.',
      }),
    );
    panel.append(
      mk('details', { open: !narrow }, [
        mk('summary', { textContent: 'VFX 실험실' }),
        mk('div', { className: 'in' }, kids),
      ]),
    );
  }
  /* 복사용 글: FEEL_TUNE 그대로 붙여 넣을 수 있는 모양. 바뀐 값에는 원래 값을 주석으로 단다 */
  function tuneText() {
    const lines = Object.keys(FEEL_TUNE).map(k => {
      const v = FEEL_TUNE[k],
        d = tuneDefault[k];
      return `  ${k}: ${num(v)},${v !== d ? ` // 바뀜 (원래 ${num(d)})` : ''}`;
    });
    return `const FEEL_TUNE = {\n${lines.join('\n')}\n};`;
  }

  function bindInput() {
    glCanvas.addEventListener('pointermove', e => (ptr = e));
    glCanvas.addEventListener('pointerleave', () => (ptr = null));
    const KEYS = {
      1: () => hit('main'),
      2: () => hit('war'),
      3: () => hit('nuke'),
      4: chain,
      5: drop,
      r: () => setup({ city: S.city, lv: S.lv }),
      p: () => LAB.togglePause(),
      '.': () => clock.steps++,
    };
    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && e.target.closest && e.target.closest('input, select, textarea')) return;
      const f = KEYS[e.key.toLowerCase()];
      if (!f) return;
      e.preventDefault();
      f();
    });
  }
  function runLoop() {
    let prev = performance.now(),
      n = 0;
    const loop = t => {
      const d = Math.min(0.1, Math.max(0, (t - prev) / 1000));
      prev = t;
      if (clock.steps > 0) {
        clock.steps--;
        tick(1 / 60);
      } else tick(clock.paused ? 0 : d * clock.speed);
      if (++n % 6 === 0) infoEl.textContent = info();
      nativeRaf(loop);
    };
    nativeRaf(loop);
  }
})();
