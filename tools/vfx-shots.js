// 폭발 프레임 띠(contact sheet) 만들기.  사용: npm run shots  (장면 일부만: npm run shots -- main nuke)
// VFX 실험실(tools/vfx-lab.html?shots)을 열고 무작위 값을 고정한 뒤, 시간을 1/60초씩 직접 흘리며
// 정해 둔 순간마다 화면을 찍어 한 장으로 붙인다. 결과는 vfx-shots/<장면>.png (저장소에 올리지 않음).
// 실시간으로 돌리지 않으므로 GPU 없는 환경에서도 매번 같은 그림이 나온다. 바꾸기 전과 후를 비교할 때 쓴다.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve');

const PORT = 8125;
const OUT = path.join(__dirname, '..', 'vfx-shots');
const VIEW = { width: 800, height: 500 };
const THUMB = 390; // 띠 한 칸의 가로 폭(px)
const COLS = 4;
// 찍는 순간(1/60초 단위, 명중한 프레임이 0)
const FRAMES = [0, 1, 2, 3, 5, 8, 12, 18, 27, 39, 54, 72, 96, 132, 180, 240];
const SCENES = [
  { id: 'main', name: '본탄 명중 · 느티 마을', city: 0, lv: { radius: 4, power: 3 }, kind: 'main' },
  {
    id: 'war',
    name: '추가 탄두 · 갈매기 항구',
    city: 2,
    lv: { radius: 10, power: 10, cluster: 3 },
    kind: 'war',
    at: [6.5, -3.5], // 가운데에서 비켜 맞힌다 (x, z)
  },
  {
    id: 'nuke',
    name: '메가톤 · 청람 메트로',
    city: 3,
    lv: { radius: 14, power: 14, nuke: 1, cluster: 4 },
    kind: 'nuke',
  },
  {
    id: 'night',
    name: '본탄 명중 · 네온 메가시티(밤)',
    city: 4,
    lv: { radius: 10, power: 16, chain: 6 },
    kind: 'main',
  },
];

// 페이지의 Math.random 을 씨앗이 있는 난수로 바꾼다(mulberry32). 같은 씨앗이면 같은 도시 · 같은 폭발이 나온다.
function seedScript() {
  let s = 1;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__seed = n => (s = n | 0);
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

(async () => {
  const pick = process.argv.slice(2);
  const scenes = pick.length ? SCENES.filter(s => pick.includes(s.id)) : SCENES;
  if (!scenes.length) throw new Error('장면 이름이 없습니다. 쓸 수 있는 이름: ' + SCENES.map(s => s.id).join(', '));
  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(PORT);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '', contentType: 'text/css' }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript(seedScript);
    await page.goto(`http://127.0.0.1:${PORT}/tools/vfx-lab.html?shots`);
    // 실험실이 requestAnimationFrame 을 붙잡고 있으므로 기본(raf) 대신 시간 간격으로 확인한다
    await page.waitForFunction(() => window.LAB && LAB.ready, null, { timeout: 30000, polling: 100 });
    // 요소 스크린샷은 requestAnimationFrame 으로 '안정'을 기다리므로, #stage 영역을 잘라 찍는다
    const clip = await page.evaluate(() => {
      const r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const sheet = await ctx.newPage();

    for (const sc of scenes) {
      const t0 = Date.now();
      await page.evaluate(sc => {
        __seed(7);
        LAB.setup(sc);
        for (let i = 0; i < 3; i++) LAB.tick(1 / 60); // 그림자 · 화면 크기가 자리 잡게 몇 프레임 돌린다
        LAB.hit(sc.kind, sc.at ? LAB.topAt(sc.at[0], sc.at[1]) : null);
        LAB.tick(0); // 명중한 프레임을 그린다
      }, sc);
      const shots = [];
      let n = 0;
      for (const f of FRAMES) {
        // 다음에 찍을 프레임까지 계산만 하고, 찍을 프레임 하나만 그린다
        const info = await page.evaluate(k => {
          for (let i = 1; i <= k; i++) LAB.tick(1 / 60, i === k);
          return LAB.info();
        }, f - n);
        n = f;
        shots.push({ n, info, png: (await page.screenshot({ clip })).toString('base64') });
      }
      const cells = shots
        .map(
          s => `<figure><img src="data:image/png;base64,${s.png}"><figcaption><b>${(s.n / 60).toFixed(3)}초</b>
            · ${s.n}프레임<br>${esc(s.info).replace(/\n/g, '<br>')}</figcaption></figure>`,
        )
        .join('');
      await sheet.setViewportSize({ width: COLS * (THUMB + 6) + 18, height: 400 });
      await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:10px 12px 12px;background:#0d1322;color:#eaeef8;font:12px/1.35 ui-monospace,Menlo,monospace}
        h1{font-size:15px;margin:0 0 8px}
        .g{display:grid;grid-template-columns:repeat(${COLS},${THUMB}px);gap:6px}
        figure{margin:0;background:#141c31}
        img{display:block;width:${THUMB}px;height:auto}
        figcaption{padding:3px 6px 4px;font-size:10.5px;color:#97a3c2}
        figcaption b{color:#ffc531;font-size:12px}
      </style><h1>${esc(sc.name)} · 1/60초씩 직접 진행</h1><div class="g">${cells}</div>`);
      const file = path.join(OUT, sc.id + '.png');
      await sheet.screenshot({ path: file, fullPage: true });
      console.log(`${sc.id}: ${path.relative(process.cwd(), file)} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    }
    if (errors.length) {
      console.error('페이지 에러:\n' + errors.slice(0, 5).join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
