# AGENTS.md — RoketMan(폭탄 키우기) 작업 규칙

Codex 같은 AI 코딩 에이전트가 이 저장소에서 작업할 때 지키는 규칙입니다.
게임 구조 · 데이터 · 밸런스 · 알려진 이슈 · 다음 작업 목록은 **[HANDOFF.md](HANDOFF.md)** 에 있습니다. 작업을 시작하기 전에 먼저 읽으세요.

## 언어
- 대화 · 코드 주석 · 커밋 메시지 · PR 설명은 **한국어**로 씁니다. 코드 식별자는 영어 그대로 둡니다.
- 커밋은 Conventional Commits 형식을 따르고 제목은 한국어로 씁니다.
  - 예: `feat: 일일 미션 3종 추가`, `fix: 휴대폰 세로 화면에서 도시 왼쪽이 잘리는 문제`
  - 쓰는 머리말: `feat:` `fix:` `refactor:` `docs:` `test:` `chore:`
- 게임 화면 문구는 존댓말로 짧게 씁니다. 기술 용어 대신 유저가 아는 말을 씁니다 ("인스턴스"가 아니라 "블록").

## 프로젝트 성격 (지킬 것)
- **빌드 단계가 없는 정적 웹 게임**입니다. 요청받지 않았다면 번들러 · 프레임워크 · TypeScript를 들이지 않습니다.
- 스크립트 로드 순서는 고정입니다. `index.html` 끝에 있습니다.
  `vendor/three.r128.min.js` → `js/01-data.js` → `js/02-engine.js` → `js/03-city.js` → `js/04-game.js`
- 네 JS 파일은 ES 모듈이 아닙니다. **일반 `<script>`라서 최상위 `let`/`const`/`function`을 전역에서 같이 씁니다.**
  - 새 최상위 이름이 다른 파일의 이름과 겹치면 페이지를 불러올 때 SyntaxError가 나서 게임 전체가 멈춥니다. `npm run check`가 이 충돌을 잡아 줍니다.
  - `window`에 이미 있는 이름(`name` `top` `status` `location` `parent` `self` 등)은 최상위 변수 이름으로 쓰지 않습니다.
  - 파일 안에서만 쓰는 도우미는 블록 `{ }` 안이나 함수 안에 둡니다.
- three.js는 **r128로 고정**합니다. 버전을 올릴 때는 HANDOFF.md의 "three.js 버전" 절을 따르고 PR을 따로 냅니다.
- 실존 도시 · 인물 · 브랜드는 쓰지 않습니다. 도시는 모두 가상이고, "주민은 모두 대피했다"는 설정을 유지합니다.

## 바꾸면 안 되는 것 (저장 호환성)
- 저장 키 `bomb-grow-lab-v1`과 저장 객체 `S`의 필드(`pts` `earned` `lv` `unlocked` `city` `best` `runs`).
  필드 구조를 바꿀 때는 `js/01-data.js`의 불러오기 부분에 마이그레이션 코드를 넣습니다.
- 개량 id: `radius` `power` `ammo` `scope` `pierce` `cluster` `chain` `mult` `nuke`. 저장 데이터가 이 id로 레벨을 기억합니다.
  이름과 설명 문구는 바꿔도 되지만 id는 그대로 둡니다.
- 개량 비용 · 보상 · 해금 기준 같은 밸런스 수치를 바꿀 때는 PR 설명에 **바꾸기 전과 후를 표로** 남깁니다.

## 확인 방법 (PR 전에 반드시)
```bash
npm install
npx playwright install chromium
npm run check
npm run smoke
npm run format:check
```
- `npm run check`: 문법과 파일 간 최상위 이름 충돌을 검사합니다. 브라우저 없이 1초 안에 끝납니다.
- `npm run smoke`: 데스크톱(1280×760)과 휴대폰(390×844) 화면에서 불러오기 → 개량 구매 → 출격 → 도시 생성 → 탄두 명중 → 결과 → 연구실 복귀 → 저장 → 콘솔 에러 0건을 검사합니다. 마지막 줄이 "모두 통과"여야 합니다.
  - GPU 없는 소프트웨어 WebGL로 돌아서 느립니다(1~3분). 발사 연출은 기다리지 않고 게임 함수를 직접 불러 건너뜁니다.
  - 새 화면이나 새 단계를 만들면 `tools/smoke.js`에 검사를 추가합니다.
- 화면을 바꿨다면 `npm start`로 띄워서 데스크톱과 휴대폰 폭 둘 다 확인합니다. 페이지에 가로 스크롤이 생기면 안 됩니다.
- 코드 스타일은 Prettier(`.prettierrc.json`, 한 줄 120자)를 따릅니다. 커밋 전에 `npm run format`을 실행합니다.

## 작업 방식
- `main`에 직접 푸시하지 않습니다. 기능 브랜치를 만들어 PR을 열고, 병합은 저장소 주인이 합니다.
- PR 하나에는 주제 하나만 담습니다. 성능 · 밸런스 · 새 기능을 한 PR에 섞지 않습니다.
- 작업이 끝나면 HANDOFF.md의 "알려진 이슈"와 "다음 작업 후보"를 최신 상태로 고칩니다.
