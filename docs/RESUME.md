# RESUME — 다음 세션 이어가기

> 마지막 갱신: 2026-07-26 (세션 7 — v1.6.2 노트 열기 시 옵시디언 창 활성화)

## 최신: v1.6.2 — 노트 클릭 시 옵시디언 창 포그라운드 전환 (유저스크립트만, raw 푸시 배포)

- **문제**: 카드 클릭이 Local REST `POST /open/`으로 노트를 열어(백그라운드 XHR) 노트는 바뀌지만 **옵시디언 창이 화면 앞으로 안 올라옴** (성경구절 칩은 딥링크라 올라오는 비대칭). 온보딩 시 `useLocalRest` 자동 on이라 모든 정상 설치 사용자가 해당.
- **해법**: REST 성공(status<300) 후 **vault-only 딥링크** `obsidian://open?vault=<볼트>`(file 없음 = 열린 노트 안 바꾸고 창만 활성화) 발사. REST 실패 폴백(전체 딥링크)이 이미 활성화를 겸하므로 클릭당 딥링크 정확히 1회.
- 구현: `goObsidian(url)` 네비 헬퍼(테스트 심 `window.__omNav`) + `focusUrl(item)` 신설, 모든 딥링크 지점(openItem/openViaRest 폴백/openNoteByName) 헬퍼로 통일. 설정 `focusOnOpen`(체크박스, **기본 true**). 브라우저 "Obsidian 열기" 확인창은 "항상 허용" 한 번이면 끝(설치가이드 FAQ 갱신).
- 검증: 파서 25/25 · 스모크 **140/140**(v1.6.2 케이스 4건: REST+포커스 딥링크/focusOnOpen off/REST 다운 폴백 중복 없음, makeEnv에 `calls.navUrls` 관측 추가).

## 이전: v1.6.1 — 실기기 피드백 2건 (유저스크립트만, raw 푸시 배포 — 릴리스는 다음 플러그인 변경 때 통일)

- **카드 호버 복사 버튼(인용/name/rel/abs) 제거** — 설교 날짜 배지·태그를 가리고 실사용 없음(사용자 스크린샷 피드백). 복사는 키보드 `y`(위키링크)/`c`(인용)로 유지. `copyCitation`/`absPath` 함수는 키보드·설정 연계로 존치.
- **글자 크기 설정** — 구글 검색결과 대비 너무 작다는 피드백. 위젯 CSS의 font-size 28곳을 `calc(Xpx * var(--fs, 1))`로 일괄 변환(설정 대화상자 CONFIG_CSS는 제외), 루트에 `--fs` 주입. 설정 `fontScale`(int %, **기본 110** = 10% 확대, 80~150 클램프).
- 검증: 파서 25/25 · 스모크 **136/136**(인덱스 정합 테스트를 REST /open/ 관측 방식으로 재작성 — .om-link 클릭은 `$.Event("click",{button:0})` 필요).

## 이전: v1.6.0 — 고도화 6종 (유저스크립트만 코드 변경, 플러그인은 버전 통일 bump)

1. **칩 건수 배지** — `state.catCounts`(applyPipeline에서 "그 칩을 눌렀을 때 볼 건수" 계산) + `renderCatCounts()`. 0건 칩은 `om-cat-zero` 흐림(클릭은 가능 — 핀 늦은 합류 대비 + 빈 카테고리 복귀 링크 전제).
2. **더 보기** — `state.limit`/`state.filteredCount`, slice(0, limit). `resetLimit()`은 결과 집합이 바뀌는 제스처(검색·칩·타입·minRel·리셋 링크)에서만, 정렬 변경은 유지. **기존 인덱스 버그 동시 수정**: `.om-link`/`.om-act`가 형제 기준 `.index()`를 쓰던 것을 `.om-result` 집합 기준으로 — `.om-filter-hint`/`.om-more`가 끼면 엉뚱한 노트가 열리던 문제.
3. **설교 파일명 배지** — `sermonMeta()` (`YYMMDD_[대청어]_제목`, 월/일 유효성 검사) → `2026-04-12 · 대예배` 배지 + 표시 제목 prefix 제거. `item.basename` 원본 불변(복사·열기 보존).
4. **doctrine 칩 재검색** — enrich의 `<span class="om-doc">` → button(data-q), 클릭 시 refine 재검색. `enrichResults`를 `patchCard()`로 추출 + **`item._note` 캐시**(재렌더 시 REST 재요청 없음), cap = max(30, limit).
5. **콜론형 인용 병행** — runSearch에서 aux에 `약어장:절` 추가(원 쿼리와 같으면 생략). **파서는 불변** — bible-parser.test가 auxQueries를 정확 단언하므로 파서 마커 구간(`// ---------- 성경구절 인식` ~ enrichment)은 수정 금지.
6. **검색 결과 캐시** — sessionStorage, 키 `om_sr__1__{engine}__{ports}__{query}`, TTL 5분, 최대 12항목, `_note` 제외 스냅샷. **SWR**: 히트 시 즉시 렌더 + 백그라운드 재검색으로 덮어씀, 전 포트 다운이면 캐시 유지(에러 화면 미표시). 핀 합류 후 재저장.

검증: 파서 25/25 · **스모크 131/131**(v1.6.0 케이스 26건 추가, makeEnv에 `session` seed·`__ERR__` 포트다운 센티널 확장) · 빌드 OK.

## 이전: v1.5.0 — 검색체계 개편 (주석 제외 + 자료 카테고리 + 다양성 정렬)

**문제**: "요1:1" 검색 시 장 단위 통합주석(`170. 성경/171. 성경주석/`, 1,385개 — 노트당 `[[요1_N]]` 링크 ~55개)이 보조쿼리 `요1_1`에 강하게 걸려 결과 상위 도배 → 본인 작성 노트(설교·조각·묵상·자료)가 안 보임.

**변경 (유저스크립트 + 플러그인 모두)**:
- **주석 완전 제외**: '주석' 칩 삭제. `catComm` 설정을 "제외 키워드"로 의미 전환(wire format `cats.comm` 유지 → 하위호환 무손상). `hideComm`(기본 on)으로 해제 가능. 매칭은 **디렉토리 경로만**(신규 `dirOf`/`dirMatches` 헬퍼) — "주석에 대한 생각.md" 파일명 오탐 없음. 핀(`_pinned`) 노트는 항상 통과.
- **'자료' 칩 신설**: `catRef` 기본 `700. Reference,800. Readwise,자료`. wire format에 `cats.ref` 추가(additive — 구 유저스크립트는 무시).
- **다양성 정렬**: bibleRef && diversify(기본 on) && 전체 탭일 때, 핀 아래를 설교→조각→묵상→자료→기타 라운드로빈 교차 배치. **성경 버킷은 로테이션 제외** — refOnly면 핀 직후, 혼합 쿼리면 맨 뒤 (기존 auxFirst 의미 보존). 분류는 first-match `frag→bible→devo→ref→sermon` ('설교'⊂'설교조각' 오분류 방지).
- **`om_cat:"comm"` 잔존값 마이그레이션**: 사라진 칩 저장값은 로드 시 "all"로 복귀 (0건 화면 방지).
- 플러그인: `CategoryKey`/`CATEGORY_KEYS`에 `ref` 추가(구 data.json은 loadSettings 루프가 자동 보충), 설정 탭에 자료 행 + 주석 행 라벨 "(검색에서 제외)", 자동 감지에 ref 규칙. `setup-code.ts` 무수정(CATEGORY_KEYS 순회).
- 검증: 파서 25/25, **스모크 105/105**(v1.5.0 케이스 7종 추가), 빌드 OK.

## 이전: v1.4.0 — 전체 배포 완료 ✅

- **유저스크립트 1.4.0** (커밋 abf6912, origin 푸시됨, raw 라이브 확인): 구절 노트 REST 직접 조회·핀(Omnisearch 상위 50건 캡 우회), 빈 카테고리 → 전체 보기 복귀 링크. (v1.3.3: 숨김 필터 안내·원클릭 해제 + 중복 설치 실행 가드.)
- **플러그인**: 1.3.2 이후 **코드 변경 없음**. v1.4.0 릴리스는 프로젝트 버전 통일 목적 — 버전 파일(manifest×2·package·versions.json)만 1.4.0 bump(커밋 88481f3), main.js 재빌드 동일.
- **GitHub 릴리스 1.4.0** 발행: main.js/manifest.json(=1.4.0)/styles.css 첨부, Latest, 자산 내 manifest 버전 1.4.0 확인. BRAT는 이 릴리스를 최신으로 인식.
- 검증: 파서 25/25, 스모크 91/91, 빌드 OK.

## ⚠️ 네트워킹 교훈 (절대 잊지 말 것)

- **루프백 호스트를 하나로 통일하면 안 된다.** 실측(lsof): **Omnisearch HTTP = `[::1]`(IPv6 전용) 바인딩**, **Local REST API = `127.0.0.1`(IPv4) 바인딩**. 유저스크립트 fetchPort는 반드시 `localhost`(브라우저가 IPv6/IPv4 자동 폴백), 플러그인 프로브는 localhost→127.0.0.1 순차 폴백, isPortFree는 127.0.0.1+::1 듀얼스택 bind 테스트.
- v1.3.0에서 fetchPort를 127.0.0.1로 "통일"했다가 전면 연결 실패가 될 뻔함 (1.3.2에서 롤백). 사용자 설치본이 1.2.6(localhost)이라 노출 전 차단.
- **Omnisearch는 짧은 시간에 disable/enable 반복 시 캐시를 비우고 "Restart Obsidian" 요구** (1.3.1 교훈). 포트 이동은 확정 충돌일 때만 1회.

## 이력: v1.3.2 (릴리스 1.3.0 → 1.3.1 → 1.3.2 → **1.4.0**)

### v1.3.2 (세션 4): "요1:1 검색 0건" 진단·수정
- **원인 1 (사용자 증상)**: 위젯 슬롯에 dev vault(51361)만 등록돼 있었음. 메인 볼트(csh_remote, 51367)는 정상 — 요1_1 검색 50건, 성경 노트 31,118개, DB·폴더 설정 문제 없음. → **메인 볼트에서 설정 코드 복사 → ⚡ 붙여넣기**로 해결.
- **원인 2 (잠복 버그)**: 위 네트워킹 교훈 참조. fetchPort localhost 롤백 + probe 듀얼 호스트 + isPortFree 듀얼스택.
- 진단(🩺)에 **등록된 볼트 요약** 표시 추가 — "연결 OK인데 0건"의 원인을 사용자가 즉시 인지.
- 검증: 파서 25/25, 스모크 78/78, 빌드 OK.

### v1.3.1: 포트 자동 이동 과잉 반응 수정 (인덱싱 지연을 충돌로 오판 → 캐시 초기화 악순환 차단)

- **GitHub**: https://github.com/ai4pastor/a4p-omnisearch (ai4pastor 조직, public)
  - 수강생 설치 링크: `https://raw.githubusercontent.com/ai4pastor/a4p-omnisearch/main/userscript/a4p-omnisearch.user.js` (배포본 1.3.0 확인 완료, 메타블록 최상단 정리됨)
  - **BRAT 릴리스 1.3.0** 생성됨 (main.js/manifest.json/styles.css 첨부). 루트 manifest.json도 1.3.0.
- **v1.3.0 내용** (세션 3):
  - 플러그인: 카테고리 폴더 **행 단위 UI**(＋추가/🗑삭제/자동완성, 배열 저장 + 구버전 콤마 문자열 자동 마이그레이션), **상태 실검증**(HTTP 프로브 → ✅/⚠️충돌/❌다운 3단계 + 🔄 재검사 버튼), **멀티볼트 포트 충돌 자동 회피**(볼트 열 때 자동 감지 → net bind 스캔으로 빈 포트 이동 → "설정 코드 다시 복사" Notice), 고급 포트 수동 편집. 신규 파일 `src/probe.ts`.
  - 유저스크립트: 설정 코드 **멀티볼트 온보딩**(같은 볼트=갱신/빈 슬롯=신규/만석=prompt 선택, 슬롯1 기본값 특례), 성경 검색 **score 응답별 정규화(_rel) + refOnly 그룹 정렬**, 장 단위 **prefix 보조쿼리**(`요3_` — 실볼트 curl 실측 OK), 카테고리 칩 **디렉토리 경로만 매칭**, 진단에 다른 볼트 포트 점유 경고 + 현재/최신 버전 표시(@connect raw.githubusercontent.com 추가), fetchPort 127.0.0.1 통일.
  - 문서: 설치가이드에 🔄 업데이트 섹션(구 abadcsh-tech 설치본은 404라 자동 업데이트 불가 → 덮어 설치 안내) + 🗂 멀티볼트 섹션 + GitHub 설치 링크 명시.
- **v1.2.6 이력**: 검색결과 페이지 전용 가드, A2 에디토리얼 디자인, 4엔진(구글·네이버·Bing·유튜브), ◐ 화면 모드.

## 다음 세션 할 일

0. **사용자 즉시 조치 (1.6.0 배포됨)**: ① Tampermonkey 업데이트 확인 → 유저스크립트 1.6.0 ② BRAT 업데이트 → Helper 1.6.0 ③ 구글에서 **요1:1 재검색** — 주석 부재 + 교차 배치 + 칩 건수 + 더 보기 + 설교 날짜 배지 확인 ④ ✝️ doctrine 칩 클릭 재검색·뒤로가기 즉시 표시 체감 확인 ⑤ 자료 칩(`700. Reference`·`800. Readwise`)이 내 볼트 폴더와 맞는지 Helper 설정 탭에서 확인(다르면 수정 → 설정 코드 재복사 → ⚡).
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
- `npm test` — 위젯 스모크 140/140 (jsdom, 멀티볼트 온보딩·정렬·카테고리·진단·주석 제외·다양성 정렬·칩 배지·더 보기·캐시·글자 배율·창 활성화 케이스 포함)
- `cd obsidian-plugin && npm run build`
- 배포 절차: 유저스크립트 = @version bump + push (자동 업데이트). 플러그인 = 버전 bump(manifest×2·package·versions.json) + build + **새 GitHub 릴리스** (BRAT).
