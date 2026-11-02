// 빠른 구문 검사(브라우저 불필요). 네 스크립트는 전역 스코프를 공유하므로
// 따로 한 번, 합쳐서 한 번 파싱해 문법 오류와 "파일 간 최상위 이름 중복"을 잡는다.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const files = ['01-data.js', '02-engine.js', '03-city.js', '04-game.js'].map(f => path.join(__dirname, '..', 'js', f));
let ok = true;
for (const f of files) {
  try {
    new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f });
  } catch (e) {
    ok = false;
    console.error('문법 오류:', path.basename(f), e.message);
  }
}
try {
  new vm.Script(files.map(f => fs.readFileSync(f, 'utf8')).join('\n;\n'), { filename: '합친 스크립트' });
} catch (e) {
  ok = false;
  console.error('파일 간 충돌(최상위 이름 중복 등):', e.message);
}
console.log(ok ? '구문 검사 통과' : '구문 검사 실패');
process.exit(ok ? 0 : 1);
