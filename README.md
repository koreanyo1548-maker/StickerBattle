# 스티커 원정대

배포 파일은 `index.html` 하나다. 직접 고치지 말고 `src/`와 `assets/art/`를 고친 뒤 빌드한다.

```
node tools/build.mjs          # index.html 생성
node tools/build.mjs --check  # index.html이 소스와 일치하는지 확인
```

| 경로 | 내용 |
|---|---|
| `src/page.html` | HTML 뼈대. `/*@styles*/`, `/*@script*/` 자리에 내용이 들어간다 |
| `src/styles.css` | 스타일 |
| `src/prelude.js`, `src/epilogue.js` | 스크립트 전체를 감싸는 시작/끝 |
| `src/content/`, `src/domain/`, `src/application/`, `src/rendering/`, `src/presentation/` | 스크립트 모듈. 순서는 `tools/build.mjs`의 `scriptFiles` |
| `assets/art/*.webp` | 그림. 소스에서는 `"@art:이름"`으로 참조하고 빌드 때 data URI로 들어간다 |
| `tools/load-modules.mjs` | 화면 없는 모듈을 node에서 불러오는 도우미 |
| `tools/test-rules.mjs` | 규칙·게임 흐름 테스트: `node --test tools/test-rules.mjs` |
| `tools/balance-bot.mjs` | 실제 엔진으로 봇을 끝까지 돌려 블라인드별 클리어율·전투 길이 점검. `solo`로 첫 슬라임을 시작 동료 혼자 잡는지 검사. `BOT`로 콘텐츠 덮어쓰기 |
| `tools/tune-monsters.mjs` | 봇 결과에 맞춰 몬스터 체력·공격을 자동 보정. 결과를 `data.js`의 `monsterStats`에 옮긴다 |
| `tools/make-placeholder-art.mjs` | 임시 그림(몬스터·보상 카드 뒷면)과 가이드 생성. 규격은 `docs/art-spec.md` |

규칙 문서: `docs/rpg-redesign.md`(현재 규칙). `docs/design-sketch.md`, `docs/implementation-plan.md`는 이전 설계 기록이다. 그림 규격: `docs/art-spec.md`.
