# A4P Omnisearch — 목회자 통합검색

구글·네이버에서 검색하면 **내 옵시디언 볼트의 설교·설교조각·묵상·성경구절 노트가 검색 결과 옆에 함께 뜹니다.**
웹 지식과 내 두 번째 뇌(볼트)가 한 번의 검색으로 동시에 답합니다.

> AI for Pastors (ai4pastor.com) 강의 수강생 배포용.

## 구성

```
┌─────────────────────┐        ┌──────────────────────────┐
│  브라우저 (Chrome)   │        │  옵시디언 (내 볼트)        │
│                     │  HTTP  │                          │
│  유저스크립트 위젯    │ ◄────► │  Omnisearch (검색 서버)    │
│  구글/네이버 옆 표시  │        │  Local REST API (본문/칩) │
│                     │        │  A4P Helper (설정 도우미)  │
└─────────────────────┘        └──────────────────────────┘
```

| 폴더 | 내용 |
|---|---|
| `userscript/a4p-omnisearch.user.js` | 브라우저 검색 위젯 (Tampermonkey 유저스크립트) |
| `obsidian-plugin/` | A4P Omnisearch Helper — 옵시디언 설정 도우미 플러그인 |
| `docs/수강생-설치가이드.md` | 수강생용 5단계 설치 가이드 |
| `test/bible-parser.test.mjs` | 성경구절 파서 단위 테스트 (`node test/bible-parser.test.mjs`) |

## 목회자 특화 기능

- **✝️ 성경구절 인식** — `요 3:16`, `요한복음 3장 16절`, `시편 23편`, `롬 3:10-12` 를 인식해 구절 카드를 고정 표시하고, 구절 노트명 형식(`요3_16`)으로 보조 검색을 병행. frontmatter `성경구절:` 표준을 쓰는 볼트에서는 **그 구절을 인용한 설교·설교조각까지 함께** 검색됩니다.
- **카테고리 필터** — `전체 | 설교 | 조각 | 묵상 | 성경 | 주석` 칩. 폴더 키워드는 설정에서 내 볼트 구조에 맞게 변경.
- **신학 주제 칩** — frontmatter `doctrine`(🔖 WORD 분류)을 카드에 표시. `성경구절` 칩은 클릭하면 해당 구절 노트가 열림.
- **인용 복사** — 카드에서 `“발췌…” — [[노트명]]` 형식으로 복사해 설교문에 바로 붙이기 (키보드 `c`).
- **⚡ 설정 코드** — 옵시디언 Helper 플러그인이 만든 코드 한 줄을 붙여넣으면 포트·API 키·볼트 이름이 자동 설정.
- **🩺 연결 진단** — 문제가 생기면 한국어 체크리스트로 원인과 해결책 안내.
- 원본의 강력한 기능 유지 — 멀티볼트(최대 6개), 관련도 바, 본문 미리보기, 테마 9종, 키보드 내비(j/k/Enter/y/c).

## 빌드 (개발자용)

```bash
# 유저스크립트: 단일 파일, 빌드 불필요. 검증:
node --check userscript/a4p-omnisearch.user.js
node test/bible-parser.test.mjs

# 옵시디언 플러그인:
cd obsidian-plugin && npm install && npm run build   # → main.js
```

플러그인 설치(수동): `manifest.json`, `main.js`, `styles.css` 세 파일을 볼트의 `.obsidian/plugins/a4p-omnisearch/` 에 복사.

## 크레딧 & 라이선스

MIT License. 이 프로젝트는 다음 작업의 포크·확장입니다:

- 원작: **Simon Cambier** — [Inject Omnisearch results into your search engine](https://github.com/scambier/userscripts) ([Omnisearch](https://github.com/scambier/obsidian-omnisearch) 프로젝트)
- 1차 포크: **구요한 (CMDSPACE)** — [obsidian-omnisearch-google-cmds](https://github.com/johnfkoo951/obsidian-omnisearch-google-cmds) (멀티볼트·관련도 바·Local REST 연동·테마)
- 본 포크: **A4P (abadcsh)** — 목회자 특화 기능(성경구절 인식·카테고리·doctrine 칩·설정 코드 온보딩·네이버 지원·도우미 플러그인)
