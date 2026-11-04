# RoketMan — 폭탄 키우기

해안 발사장에서 미사일을 키우고 발사해, 3D 복셀 도시를 무너뜨린 만큼 포인트를 모아 다시 미사일을 키우는 성장형 웹 게임입니다.

- 빌드 과정이 없습니다. HTML · CSS · JS 파일을 그대로 엽니다.
- 3D는 three.js r128을 씁니다. `vendor/`에 들어 있어서 인터넷 없이도 돌아갑니다. 웹 글꼴만 인터넷이 필요하고, 없으면 기본 글꼴로 나옵니다.
- 진행 상황은 브라우저 localStorage에 자동 저장됩니다.

## 실행

- `index.html`을 더블클릭합니다 (Chrome · Edge · Safari 최신판).
- 또는 로컬 서버로 엽니다.

```bash
npm start
```

→ http://localhost:8123

## 플레이 방법

1. **연구실**: 오른쪽 패널(휴대폰은 아래)에서 포인트로 개량을 사면 발사대 위 로켓이 바로 커집니다.
2. **출격**: 점화 → 발사 → 화면 전환 → 목표 도시.
3. **타격**: 첫 탄두는 가장 높은 건물로 자동으로 떨어집니다. 남은 탄두는 화면을 터치하거나 클릭한 곳에 떨어집니다. 키보드 Space · Enter는 가장 높은 건물에 자동 투하합니다.
4. 부순 블록만큼 포인트를 받습니다. 한 번 출격에 35% 이상 부수면 다음 도시가 열립니다.

## 개발

| 문서 | 내용 |
| --- | --- |
| [HANDOFF.md](HANDOFF.md) | 인계서: 구조 · 데이터 · 밸런스 · 알려진 이슈 · 다음 작업 |
| [AGENTS.md](AGENTS.md) | Codex 등 AI 코딩 에이전트용 작업 규칙 |

```bash
npm install
npx playwright install chromium
npm run check   # 문법 · 파일 간 이름 충돌 검사 (1초)
npm run smoke   # 데스크톱 · 휴대폰 화면으로 한 판 자동 플레이 검사
npm run format  # 코드 정리 (Prettier)
npm run shots   # 폭발 프레임 띠 캡처 → vfx-shots/*.png (바꾸기 전과 후 비교용)
```

- **VFX 실험실**: `npm start` 뒤 http://localhost:8123/tools/vfx-lab.html 에서 폭발을 바로 터뜨리고, 일시정지 · 한 프레임씩 보며, 손맛 값(히트스톱 · 흔들림 · 섬광)을 슬라이더로 맞춥니다. 진짜 저장은 바뀌지 않습니다.

three.js는 MIT 라이선스이며, 원문 고지는 `vendor/three.r128.min.js` 머리말에 있습니다.
