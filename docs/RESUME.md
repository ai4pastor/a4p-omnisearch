# RESUME — 다음 세션 이어가기

> 마지막 갱신: 2026-07-04 (세션 1 종료 시점)

## 현재 상태: v1.1.1 — 개발 볼트 실기기 테스트 전부 정상 ✅

- **유저스크립트** `userscript/a4p-omnisearch.user.js` (v1.1.0 표기) — 구글 위젯 정상 작동 확인. 성경구절 카드, 카테고리 칩, 인용 복사, 본문 미리보기, 설정 코드(⚡) 온보딩 모두 실기기 검증 완료.
- **Helper 플러그인** `obsidian-plugin/` (v1.1.1) — `~/obsidian_dev_vault`에 설치·검증 완료. 상태 진단 → [⚡ 자동 설정] → 자료 위치 [자동 감지] + 폴더 자동완성(FolderSuggest) → [📋 설정 코드 복사] 흐름 전부 정상.
- **검증 스위트**: `node --check` + `node test/bible-parser.test.mjs`(20/20) + `cd obsidian-plugin && npm run build` + 스크래치패드 jsdom 스모크 테스트.

## 다음 세션 할 일 (사용자 결정 사항)

1. **디자인 요소 수정** ← 다음 작업. 위젯 UI(카드·구절 카드·칩·테마)·Helper 설정 탭 시각 개선. 사용자가 구체적 요구를 줄 예정.
2. 디자인 완료 후 **GitHub 레포 생성** — public 예정(원클릭 설치 + @updateURL 자동 업데이트 + BRAT 배포). 생성 전 public 전환 재확인 필수.
3. 메인 볼트(csh_remote) 설치는 아직 안 함 — 배포 전 최종 테스트로.
4. 네이버 실DOM 미검증 (#sub_pack 셀렉터 — 플로팅 패널 폴백은 있음).
5. `docs/수강생-설치가이드.md`의 `[스크린샷: …]` 자리 채우기 (사용자가 직접 캡처).

## 설계 핵심 (빠른 리마인드)

- 설정 코드 = `A4P1:` + base64url(UTF-8 JSON `{v, vault, omniPort, restPort, restKey, root, bibleFormat, cats}`). 개인 키 포함 — 공유 금지.
- 카테고리 칩은 볼트 상대경로 키워드 매칭. Helper가 감지한 경로가 설정 코드로 위젯에 주입됨.
- 성경구절: 66권 약어(볼트 워크플로우 표준), 보조 쿼리로 `요3_16` 병행 → 인용 설교·설교조각 함께 검색.
- 플러그인 자동 설정 순서: disable → data.json 패치 → enable.
- 크레딧 체인 유지: Simon Cambier → 구요한(CMDSPACE) → A4P.

## 버전 관리 메모

- 유저스크립트를 고치면: `node --check` + 파서 테스트 → 버전 bump → (레포 생성 후엔) push만 하면 수강생 자동 업데이트.
- Helper를 고치면: `npm run build` → 3파일(manifest.json, main.js, styles.css)을 볼트 플러그인 폴더에 복사 → 플러그인 껐다 켜기.
