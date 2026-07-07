# RESUME — 다음 세션 이어가기

> 마지막 갱신: 2026-07-07 (세션 2 종료 시점)

## 현재 상태: v1.2.6 — GitHub 배포 시작 ✅

- **GitHub**: https://github.com/ai4pastor/a4p-omnisearch (**ai4pastor 조직**, public, remote=origin/main)
  - 수강생 설치 링크: `https://raw.githubusercontent.com/ai4pastor/a4p-omnisearch/main/userscript/a4p-omnisearch.user.js` — 클릭하면 Tampermonkey 설치 화면. 이후 push만 하면 자동 업데이트.
  - **BRAT 릴리스 1.2.0** 생성됨 (main.js/manifest.json/styles.css 첨부 + 루트 manifest.json). BRAT 주소: `ai4pastor/a4p-omnisearch`.
- **유저스크립트 v1.2.6** — A2 "잉크·에디토리얼" 디자인(토큰 기반, 브랜드 그린 #134538/다크 #6FB394, 종이 패널), 4개 엔진(구글·네이버·Bing·유튜브 /results), ◐ 화면 모드(자동=페이지 배경 감지→라이트→다크), SVG 헤더 아이콘 7종 + 0.2초 data-tip 툴팁, "N건" 카운트, 기본 10개 표시, 검색결과 페이지 전용 가드(구글맵·이미지·홈 오작동 수정).
- **Helper 플러그인 v1.2.0** — 문구만 갱신(4개 엔진). 기능 변경 없음.
- **실기기 확인 완료**: 구글 웹검색(다크/라이트), 구글맵에서 안 뜨는 것. 사용자 피드백 루프 6회(v1.2.1~1.2.6) 모두 반영.

## 다음 세션 할 일

1. **BRAT 설치 확인** — 사용자가 BRAT로 설치 재시도한 결과 확인부터. 실패 시 릴리스 자산/루트 manifest 재점검.
2. **실브라우저 잔여 테스트** — 네이버(#sub_pack 실DOM), Bing(#b_context), 유튜브(/results 플로팅 패널 + SPA 이동).
3. 메인 볼트(csh_remote)에 Helper 설치 — 배포 전 최종 테스트.
4. `docs/수강생-설치가이드.md`: `[스크린샷: …]` 채우기 + 2단계 설치 링크를 GitHub raw 주소로 명시.
5. 유저스크립트 업데이트 배포 절차: 수정 → `node --check` + 파서 테스트 + 스모크 → @version bump → commit·push (끝. 서버 불필요). Helper 수정 시: 버전 bump → build → **새 GitHub 릴리스** (BRAT 업데이트 경로).

## 설계 핵심 (빠른 리마인드)

- 설정 코드 = `A4P1:` + base64url(UTF-8 JSON `{v, vault, omniPort, restPort, restKey, root, bibleFormat, cats}`). 개인 키 포함 — 공유 금지.
- 디자인: CSS 토큰(LIGHT/DARK_TOKENS) + THEMES 맵 → 라이트/미디어다크/강제다크 3경로 생성. 자동 모드는 `pageIsDark()`(페이지 배경 휘도)로 om-light/om-dark 클래스를 명시적으로 박음.
- 카드 포인트색 `--cardc` = 볼트색(--vc) > 제목색(--title) > 테마(--accent). 단일 볼트는 해시 자동색 비활성.
- 구버전 저장값 마이그레이션: 목록에 없는 테마→A4P, 레거시 제목색(#94E2D5 등)→무시, 스킨 목록 외→Editorial.
- 성경구절: 66권 약어 + 보조 쿼리 `요3_16` 병행 → 인용 설교·설교조각 함께 검색.
- 크레딧 체인 유지: Simon Cambier → 구요한(CMDSPACE) → A4P.

## 검증 스위트

- `node --check userscript/a4p-omnisearch.user.js` + `node test/bible-parser.test.mjs` (20/20)
- jsdom 스모크 (세션 스크래치패드에 있었음 — 필요 시 재생성: 4엔진 + yt-watch/구글맵·이미지·홈 미생성 가드, GM/GM_config/jQuery 스텁, 56케이스)
- `cd obsidian-plugin && npm run build`
