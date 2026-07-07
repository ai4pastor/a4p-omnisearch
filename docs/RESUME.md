# RESUME — 다음 세션 이어가기

> 마지막 갱신: 2026-07-07 (세션 3 종료 시점)

## 현재 상태: v1.3.0 — 배포 완료 ✅ (커밋 75d8569 + 릴리스 1.3.0)

- **GitHub**: https://github.com/ai4pastor/a4p-omnisearch (ai4pastor 조직, public)
  - 수강생 설치 링크: `https://raw.githubusercontent.com/ai4pastor/a4p-omnisearch/main/userscript/a4p-omnisearch.user.js` (배포본 1.3.0 확인 완료, 메타블록 최상단 정리됨)
  - **BRAT 릴리스 1.3.0** 생성됨 (main.js/manifest.json/styles.css 첨부). 루트 manifest.json도 1.3.0.
- **v1.3.0 내용** (세션 3):
  - 플러그인: 카테고리 폴더 **행 단위 UI**(＋추가/🗑삭제/자동완성, 배열 저장 + 구버전 콤마 문자열 자동 마이그레이션), **상태 실검증**(HTTP 프로브 → ✅/⚠️충돌/❌다운 3단계 + 🔄 재검사 버튼), **멀티볼트 포트 충돌 자동 회피**(볼트 열 때 자동 감지 → net bind 스캔으로 빈 포트 이동 → "설정 코드 다시 복사" Notice), 고급 포트 수동 편집. 신규 파일 `src/probe.ts`.
  - 유저스크립트: 설정 코드 **멀티볼트 온보딩**(같은 볼트=갱신/빈 슬롯=신규/만석=prompt 선택, 슬롯1 기본값 특례), 성경 검색 **score 응답별 정규화(_rel) + refOnly 그룹 정렬**, 장 단위 **prefix 보조쿼리**(`요3_` — 실볼트 curl 실측 OK), 카테고리 칩 **디렉토리 경로만 매칭**, 진단에 다른 볼트 포트 점유 경고 + 현재/최신 버전 표시(@connect raw.githubusercontent.com 추가), fetchPort 127.0.0.1 통일.
  - 문서: 설치가이드에 🔄 업데이트 섹션(구 abadcsh-tech 설치본은 404라 자동 업데이트 불가 → 덮어 설치 안내) + 🗂 멀티볼트 섹션 + GitHub 설치 링크 명시.
- **v1.2.6 이력**: 검색결과 페이지 전용 가드, A2 에디토리얼 디자인, 4엔진(구글·네이버·Bing·유튜브), ◐ 화면 모드.

## 다음 세션 할 일

1. **실기기 수동 시나리오** (검증 계획 S1~S4):
   - S1: Helper 설정 탭 ✅ 상태에서 Omnisearch 끄고 🔄 재검사 → ❌ 전환 확인
   - S2: 볼트 A+B 동시 열기 → B가 자동으로 빈 포트 이동하는지 + 두 볼트 코드 각각 ⚡ 붙여넣기 → 동시 검색 확인
   - S3: 폴더 행 추가/삭제 후 재시작 유지, 구 data.json(콤마 문자열) 마이그레이션 확인
   - S4: 새 설정 코드로 위젯 칩/미리보기 정상 확인
2. **사용자 기기 유저스크립트 재설치** — 기존 설치본이 구 주소(abadcsh-tech)면 새 링크로 덮어 설치해야 1.3.0 수신.
3. 실브라우저 잔여 테스트: 네이버(#sub_pack)·Bing(#b_context)·유튜브(/results) 실DOM.
4. 설치가이드 `[스크린샷: …]` 4곳 채우기.
5. 메인 볼트(csh_remote)에 Helper 설치 — 최종 테스트.

## 설계 핵심 (빠른 리마인드)

- 설정 코드 = `A4P1:` + base64url(UTF-8 JSON `{v:1, vault, label, omniPort, restPort?, restKey?, root?, bibleFormat, cats}`). cats는 **콤마 문자열 wire format 유지**(플러그인 내부는 배열 저장, setup-code에서 join). v:1 절대 유지.
- 프로브 판정: Omnisearch = 실존 파일명 검색 → 응답 vault 비교 (ok/conflict/unknown/down). REST = Bearer 키 인증(`authenticated`) — 키가 볼트별 랜덤이라 정체성 증명.
- 포트 회피: 프로브 먼저(자기 서버 구분) → down+빈 포트면 재시작만 → 충돌이면 findFreePort(+1, 상대 포트·27124 스킵) → 패치 후 1초×3회 재프로브. Omnisearch 포트=문자열, REST=숫자.
- 유저스크립트 정렬: 성경 검색 시에만 그룹 분리(refOnly면 aux 먼저), 그룹 내 _rel(응답별 정규화) 정렬. 비성경 검색은 raw score 유지.
- 크레딧 체인: Simon Cambier → 구요한(CMDSPACE) → A4P.

## 검증 스위트

- `node --check userscript/a4p-omnisearch.user.js` + `node test/bible-parser.test.mjs` (25/25)
- `npm test` — 위젯 스모크 77/77 (jsdom, 멀티볼트 온보딩·정렬·카테고리·진단 케이스 포함)
- `cd obsidian-plugin && npm run build`
- 배포 절차: 유저스크립트 = @version bump + push (자동 업데이트). 플러그인 = 버전 bump(manifest×2·package·versions.json) + build + **새 GitHub 릴리스** (BRAT).
