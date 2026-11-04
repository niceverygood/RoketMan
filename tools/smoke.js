// 스모크 테스트.  준비: npm install && npx playwright install chromium   실행: npm run smoke
// GPU 없는 소프트웨어 WebGL 로 돌아서 프레임이 느리다(5~20fps). 그래서 발사 연출을 끝까지 기다리지 않고
// 게임 함수(enterStrike, dropWarhead, endRun)를 직접 불러 단계를 넘긴다. 게임 스크립트는 전역 스코프라
// page.evaluate 에서 phase·S·run 같은 상태를 바로 읽을 수 있다.
const { chromium } = require('playwright');
const { start } = require('./serve');

const PORT = 8124;
const VIEWPORTS = [
  { name: '데스크톱', width: 1280, height: 760 },
  { name: '휴대폰', width: 390, height: 844, mobile: true },
];

(async () => {
  const server = await start(PORT);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  let failed = 0;
  const check = (cond, msg) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
    if (!cond) failed++;
  };
  try {
    for (const vp of VIEWPORTS) {
      const tag = `[${vp.name}]`;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: !!vp.mobile,
        hasTouch: !!vp.mobile,
      });
      // 웹 글꼴은 테스트에 필요 없고, 네트워크가 막힌 환경에서도 돌도록 차단한다.
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '', contentType: 'text/css' }));
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => m.type() === 'error' && errors.push(m.text()));
      await page.addInitScript(() => {
        try {
          localStorage.setItem('bomb-grow-lab-v1', JSON.stringify({ pts: 100000 }));
        } catch (e) {}
      });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForFunction(() => typeof phase !== 'undefined' && phase === 'pad' && rocket, null, {
        timeout: 20000,
      });

      check(await page.locator('#err').isHidden(), `${tag} 3D 엔진 오류 문구 없음`);
      check((await page.locator('.upg').count()) === 9, `${tag} 개량 카드 9개`);
      check(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${tag} 가로 스크롤 없음`,
      );

      const before = await page.evaluate(() => ({ pts: S.pts, lv: S.lv.radius }));
      await page.locator('.buy[data-id="radius"]').click();
      const after = await page.evaluate(() => ({ pts: S.pts, lv: S.lv.radius }));
      check(
        after.lv === before.lv + 1 && after.pts < before.pts,
        `${tag} 폭발 반경 구매 → Lv ${after.lv}, 포인트 차감`,
      );

      await page.locator('#go').click();
      check(
        await page.evaluate(() => phase === 'launch' && document.body.classList.contains('full')),
        `${tag} 출격 → 발사 연출 시작`,
      );

      await page.evaluate(() => enterStrike());
      const city = await page.evaluate(() => ({ phase, total: totalVox }));
      check(city.phase === 'strike' && city.total > 100, `${tag} 도시 생성 (블록 ${city.total}개)`);

      await page.evaluate(() => {
        mainDropped = true;
        const t = pickMainTarget();
        dropWarhead(t[0], t[1], t[2], true);
      });
      await page.waitForFunction(() => missiles.length === 0 && pending.length === 0, null, { timeout: 90000 });
      const hit = await page.evaluate(() => ({ blocks: destroyedVox, score: Math.floor(run.score) }));
      check(hit.blocks > 0 && hit.score > 0, `${tag} 탄두 명중 → 블록 ${hit.blocks}개 파괴, +${hit.score}P`);

      // 손맛(02-engine.js FEEL): 명중 뒤 히트스톱 · 섬광 · 조명 낙차가 모두 제자리로 돌아오고, 새 명중에는 다시 켜지는지
      const settled = await page
        .waitForFunction(
          () =>
            FEEL.stop <= 0 &&
            FEEL.slow <= 0 &&
            !FEEL.flash &&
            !FEEL.dip &&
            $('#flash').hidden &&
            sun.intensity === lightBase.sun,
          null,
          { timeout: 20000 },
        )
        .then(
          () => true,
          () => false,
        );
      check(settled, `${tag} 손맛: 명중 뒤 멈춤 · 섬광 · 조명이 제자리로`);
      const feel = await page.evaluate(() => {
        boomMissile({ kind: 'war', x: 0, y: 1, z: 0, R: 4, P: 1, pierce: 0, acc: 0 });
        return { stop: FEEL.stop, trauma: FEEL.trauma, flash: FEEL.flash, dip: FEEL.dip, kick: FEEL.kickV };
      });
      check(
        feel.stop > 0 && feel.trauma > 0 && feel.flash > 0 && feel.dip > 0 && feel.kick > 0,
        `${tag} 손맛: 탄두가 맞으면 히트스톱 ${Math.round(feel.stop * 1000)}ms · 흔들림 · 섬광 · 카메라 밀림`,
      );

      await page.evaluate(() => endRun());
      check(await page.locator('#result').isVisible(), `${tag} 작전 보고서 표시`);
      await page.locator('#toLab').click();
      await page.waitForFunction(() => phase === 'pad', null, { timeout: 20000 });
      check(await page.locator('#panel').isVisible(), `${tag} 연구실 복귀`);
      check(
        await page.evaluate(() => !FEEL.trauma && FEEL.stop <= 0 && !FEEL.flash && $('#flash').hidden),
        `${tag} 손맛: 연구실로 오면 흔들림 · 섬광 초기화`,
      );
      check(
        await page.evaluate(() => JSON.parse(localStorage.getItem('bomb-grow-lab-v1')).runs === 1),
        `${tag} 저장 반영 (출격 1회 기록)`,
      );
      check(errors.length === 0, `${tag} 콘솔 에러 0건${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`);

      // VFX 실험실(tools/vfx-lab.html): 게임 화면을 그대로 불러와 폭발을 바로 터뜨리는 개발용 화면.
      // 실험실은 requestAnimationFrame 을 붙잡아 자기 시계로 돌리므로 waitForFunction 은 시간 간격으로 확인한다.
      const lab = await ctx.newPage();
      const labErrors = [];
      lab.on('pageerror', e => labErrors.push(e.message));
      lab.on('console', m => m.type() === 'error' && labErrors.push(m.text()));
      await lab.goto(`http://127.0.0.1:${PORT}/tools/vfx-lab.html`);
      await lab.waitForFunction(() => window.LAB && LAB.ready && phase === 'strike', null, {
        timeout: 30000,
        polling: 100,
      });
      const saveBefore = await lab.evaluate(() => localStorage.getItem('bomb-grow-lab-v1'));
      if (!(await lab.locator('#lab > details').evaluate(d => d.open)))
        await lab.locator('#lab > details > summary').click();
      await lab.locator('[data-lab="main"]').click();
      const labHit = await lab.evaluate(() => destroyedVox);
      check(labHit > 0, `${tag} VFX 실험실: 본탄 버튼 → 블록 ${labHit}개 파괴`);
      await lab.locator('[data-lab="nuke"]').click();
      await lab.waitForTimeout(500);
      check(
        (await lab.evaluate(() => localStorage.getItem('bomb-grow-lab-v1'))) === saveBefore,
        `${tag} VFX 실험실: 진짜 저장은 그대로`,
      );
      check(
        await lab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${tag} VFX 실험실: 가로 스크롤 없음`,
      );
      check(
        labErrors.length === 0,
        `${tag} VFX 실험실: 콘솔 에러 0건${labErrors.length ? ' → ' + labErrors.slice(0, 3).join(' | ') : ''}`,
      );
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
