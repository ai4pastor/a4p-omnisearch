// A4P Omnisearch 위젯 스모크 테스트 (jsdom) — 105케이스
// 실행 준비: npm install   (레포 루트에서 — devDependencies: jsdom, jquery)
// 실행:      npm test  (파서 테스트 포함)  또는  node test/widget-smoke.mjs
// 검증 범위: 4개 엔진 마운트 위치, 에디토리얼 스킨/테마 클래스, 카테고리 칩,
//            결과 렌더, ◐ 모드 순환(auto→light→dark)·GM 저장, SVG 아이콘 7종,
//            비검색 페이지(유튜브 watch, 구글 지도·이미지·홈) 미생성 가드.
// v1.3.0 추가: 메타블록 정적 검사, 127.0.0.1 통일, 멀티볼트 설정 코드 슬롯 선택(5종),
//            refOnly 그룹 정렬·응답별 정규화, 카테고리 디렉토리 매칭, 진단 볼트 불일치·버전 표시.
// v1.5.0 추가: 주석 칩 제거·기본 제외(디렉토리 매칭), '자료' 칩, 다양성 정렬(교차 배치),
//            설정 코드 cats.ref, om_cat 잔존값 마이그레이션.
import { JSDOM } from "jsdom";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const SRC = fs.readFileSync(new URL("../userscript/a4p-omnisearch.user.js", import.meta.url), "utf8");

const SCENARIOS = [
  { name: "google",  url: "https://www.google.com/search?q=%EC%9A%94%203%3A16",         body: '<div id="rcnt"><div id="rhs"></div></div>', expectHost: "#rhs",      engine: "google" },
  { name: "naver",   url: "https://search.naver.com/search.naver?query=%EC%82%AC%EB%9E%91", body: '<div id="container"></div>',                 expectHost: "#a4p-float", engine: "naver" },
  { name: "bing",    url: "https://www.bing.com/search?q=grace",                         body: '<div id="b_content"><ol id="b_context"></ol></div>', expectHost: "#b_context", engine: "bing" },
  { name: "youtube", url: "https://www.youtube.com/results?search_query=%EC%84%A4%EA%B5%90", body: '<div id="content"></div>',               expectHost: "#a4p-float", engine: "youtube" },
  { name: "yt-watch (위젯 없어야 함)", url: "https://www.youtube.com/watch?v=abc", body: '<div id="content"></div>', expectHost: null, engine: "youtube" },
  { name: "google-maps (위젯 없어야 함)", url: "https://www.google.com/maps/search/%EC%B9%B4%ED%8E%98?q=%EC%B9%B4%ED%8E%98", body: '<div id="app-container"></div>', expectHost: null, engine: "google" },
  { name: "google-images (위젯 없어야 함)", url: "https://www.google.com/search?q=%EB%B6%80%ED%99%9C&tbm=isch", body: '<div id="islmp"></div>', expectHost: null, engine: "google" },
  { name: "google-home (위젯 없어야 함)", url: "https://www.google.com/", body: '<div id="main"></div>', expectHost: null, engine: "google" },
];

const FAKE_RESULTS = JSON.stringify([{
  score: 12.3, vault: "csh_remote", path: "300. Sermons/302. 청소년부/하나님의 사랑.md",
  basename: "하나님의 사랑", foundWords: ["사랑"], matches: [],
  excerpt: "하나님이 세상을 이처럼 <mark>사랑</mark>하사 독생자를 주셨으니…",
}]);

let pass = 0, fail = 0;
const check = (label, cond) => { cond ? (pass++, console.log("  ✅", label)) : (fail++, console.log("  ❌", label)); };

for (const sc of SCENARIOS) {
  console.log(`\n[${sc.name}] ${sc.url}`);
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${sc.body}</body></html>`,
    { url: sc.url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;

  // ---- GM / 라이브러리 스텁 ----
  const store = { om_collapsed: false };
  window.GM = {
    getValue: (k, d) => Promise.resolve(k in store ? store[k] : d),
    setValue: (k, v) => { store[k] = v; },
    xmlHttpRequest: (opts) => setTimeout(() => opts.onload({ response: FAKE_RESULTS }), 0),
  };
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };

  // jQuery를 jsdom 창 컨텍스트 안에서 직접 실행 (실제 @require 로딩과 동일한 경로)
  const jqSrc = fs.readFileSync(require.resolve("jquery"), "utf8"); // main = dist/jquery.js
  window.eval(jqSrc);
  const $ = window.jQuery;

  // GM_config 스텁: 필드 default를 그대로 돌려준다
  const defaults = {};
  window.GM_config = function (cfg) {
    for (const [k, f] of Object.entries(cfg.fields || {})) defaults[k] = f.default;
    return { isInit: true, get: (k) => defaults[k], open: () => {}, init: () => {} };
  };
  window.waitForKeyElements = () => {};

  // 유저스크립트 실행 (메타 블록 제외한 본문 전체)
  const body = SRC.slice(SRC.indexOf("==/UserScript=="));
  const script = body.slice(body.indexOf("\n") + 1);
  try {
    window.eval(`(function(){ const GM = window.GM; ${script.replace(/^"use strict";/, "")} })()`);
  } catch (e) { check("스크립트 실행 (throw 없음)", false); console.log("     ", e.message); continue; }
  check("스크립트 실행 (throw 없음)", true);

  await new Promise((r) => setTimeout(r, 400)); // onInit tick + fetch stub (구절 보조쿼리 포함 여유)

  const widget = window.document.getElementById("OmnisearchObsidianResults");
  if (sc.expectHost === null) {
    check("검색 페이지가 아니므로 위젯 미생성", !widget);
    continue;
  }
  check("위젯 생성됨", !!widget);
  if (!widget) continue;
  check(`위젯 위치 = ${sc.expectHost}`, !!widget.closest(sc.expectHost));
  check("skin-editorial 클래스", widget.className.includes("skin-editorial"));
  check("theme-a4p 클래스", widget.className.includes("theme-a4p"));
  check("◐ 모드 버튼 존재", !!widget.querySelector(".om-mode"));
  check("카테고리 칩 6개", widget.querySelectorAll(".om-cats button").length === 6);
  check("결과 카드 렌더", widget.querySelectorAll(".om-result").length >= 1);
  check("스타일 주입됨", !!window.document.querySelector("style"));

  // 모드 토글 순환: auto(페이지 감지) → light → dark → auto
  const modeBtn = $(widget).find(".om-mode");
  const title = () => modeBtn.attr("data-tip") || "";
  const autoStart = title().includes("자동") &&
    (widget.className.includes("om-light") || widget.className.includes("om-dark")); // 자동도 명시 클래스를 박는다
  modeBtn.trigger("click");
  const lightOn = title().includes("라이트") && widget.className.includes("om-light");
  modeBtn.trigger("click");
  const darkOn = title().includes("다크") && widget.className.includes("om-dark") && !widget.className.includes("om-light");
  modeBtn.trigger("click");
  const backToAuto = title().includes("자동");
  check("모드 순환 auto→light→dark→auto", autoStart && lightOn && darkOn && backToAuto);
  check("모드가 GM 저장소에 기억됨", store.om_mode === "auto");
  check("헤더 아이콘이 SVG로 렌더됨", widget.querySelectorAll(".om-h-actions .om-icon-btn svg").length === 7);
}

// ================================================================
// v1.3.0 신규 케이스: 메타블록 정적 검사, 127.0.0.1 통일, 멀티볼트 온보딩(슬롯 선택),
// refOnly 그룹 정렬 + 응답별 정규화, 카테고리 디렉토리 매칭, 진단 볼트 불일치 + 버전 표시
// ================================================================

console.log("\n[정적 검사] 메타블록");
check("첫 줄이 // ==UserScript== (use strict 없음)", SRC.startsWith("// ==UserScript=="));
{
  const metaVer = (SRC.match(/@version\s+([\d.]+)/) || [])[1];
  const constVer = (SRC.match(/const VERSION = "([\d.]+)"/) || [])[1];
  check(`@version(${metaVer}) === VERSION 상수(${constVer})`, !!metaVer && metaVer === constVer);
}
check("@connect raw.githubusercontent.com 존재", /@connect\s+raw\.githubusercontent\.com/.test(SRC));

// ---- 확장 스텁 환경 빌더 (GM_config set/save 기록 + prompt/confirm/alert 스텁 + XHR url 기록) ----
async function makeEnv(opts = {}) {
  const url = opts.url || "https://www.google.com/search?q=" + encodeURIComponent(opts.q || "사랑");
  const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="rcnt"><div id="rhs"></div></div></body></html>`,
    { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const calls = { xhrUrls: [], sets: [], saves: 0, order: [], confirms: 0, lastAlert: "" };
  const gmStore = Object.assign({}, opts.gmStore || {});
  window.GM = {
    getValue: (k, d) => Promise.resolve(k in gmStore ? gmStore[k] : d),
    setValue: (k, v) => { gmStore[k] = v; },
    xmlHttpRequest: (o) => {
      calls.xhrUrls.push(o.url);
      setTimeout(() => {
        if (/raw\.githubusercontent\.com/.test(o.url)) {
          o.onload({ status: 200, responseText: opts.latestVersion ? `// @version      ${opts.latestVersion}\n` : "", response: "" });
        } else {
          o.onload({ status: 200, response: opts.respond ? opts.respond(o.url) : FAKE_RESULTS });
        }
      }, 0);
    },
  };
  window.GM_getValue = (k, d) => (k in gmStore ? gmStore[k] : d);
  window.GM_setValue = (k, v) => { gmStore[k] = v; };
  window.TextDecoder = TextDecoder; // jsdom 창에 없을 수 있어 Node 전역 주입
  window.TextEncoder = TextEncoder;
  const jqSrc2 = fs.readFileSync(require.resolve("jquery"), "utf8");
  window.eval(jqSrc2);
  const defaults = {};
  const cfgStore = Object.assign({}, opts.gmValues || {});
  window.GM_config = function (cfg) {
    for (const [k, f] of Object.entries(cfg.fields || {})) defaults[k] = f.default;
    return {
      isInit: true,
      get: (k) => (k in cfgStore ? cfgStore[k] : defaults[k]),
      set: (k, v) => { cfgStore[k] = v; calls.sets.push([k, v]); calls.order.push("set:" + k); },
      save: () => { calls.saves++; calls.order.push("save"); }, // 실물과 달리 reload하지 않음 (jsdom)
      open: () => {}, init: () => {},
    };
  };
  window.waitForKeyElements = () => {};
  const promptQueue = (opts.prompts || []).slice();
  window.prompt = () => (promptQueue.length ? promptQueue.shift() : null);
  window.confirm = () => { calls.confirms++; return opts.confirmResult !== undefined ? opts.confirmResult : true; };
  window.alert = (msg) => { calls.order.push("alert"); calls.lastAlert = String(msg); };
  const body2 = SRC.slice(SRC.indexOf("==/UserScript=="));
  const script2 = body2.slice(body2.indexOf("\n") + 1);
  window.eval(`(function(){ const GM = window.GM; ${script2} })()`);
  await new Promise((r) => setTimeout(r, 400));
  return { window, $: window.jQuery, calls, cfgStore };
}

const makeCode = (payload) =>
  "A4P1:" + Buffer.from(JSON.stringify({ v: 1, ...payload }), "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const clickBolt = (env) => env.$(`#OmnisearchObsidianResults .om-setup-code`).trigger("click");

console.log("\n[네트워크] 검색 요청 호스트");
{
  // localhost 필수 — Omnisearch는 ::1에만 바인딩될 수 있어 127.0.0.1 고정 시 연결 실패 (v1.3.2 회귀 가드)
  const env = await makeEnv({ q: "사랑" });
  check("fetchPort가 localhost 사용 (127.0.0.1 고정 금지)", env.calls.xhrUrls.length > 0 && env.calls.xhrUrls.every((u) => /^http:\/\/localhost:/.test(u)));
}

console.log("\n[멀티볼트 온보딩] 설정 코드 슬롯 선택");
{
  // 첫 볼트: 슬롯1이 기본값(port 51361, vault 공백)이어도 빈 슬롯으로 간주 → v1에 저장, 전역 설정은 confirm 없이 적용
  const env = await makeEnv({ prompts: [makeCode({ vault: "VaultA", omniPort: "51361", bibleFormat: "{약어}{장}_{절}", cats: { sermon: "설교" } })] });
  clickBolt(env);
  check("첫 코드 → 슬롯1에 저장 (기본값 특례)", env.cfgStore.v1_vault === "VaultA");
  check("첫 볼트는 confirm 없이 전역 설정 적용", env.calls.confirms === 0 && env.cfgStore.bibleNoteFormat === "{약어}{장}_{절}");
  check("요약 alert가 save보다 먼저", env.calls.order.indexOf("alert") >= 0 && env.calls.order.indexOf("alert") < env.calls.order.indexOf("save"));
  check("alert에 등록 볼트 목록 포함", env.calls.lastAlert.includes("VaultA"));
}
{
  // 두 번째 볼트: v1 점유 → 첫 빈 슬롯 v2로. confirm(false) → 전역 설정 미변경
  const env = await makeEnv({
    gmValues: { v1_port: "51361", v1_vault: "VaultA", v1_name: "A" },
    prompts: [makeCode({ vault: "VaultB", omniPort: "51362", cats: { sermon: "다른설교" } })],
    confirmResult: false,
  });
  clickBolt(env);
  check("두 번째 코드 → 빈 슬롯 v2에 저장", env.cfgStore.v2_vault === "VaultB" && env.cfgStore.v1_vault === "VaultA");
  check("confirm 거절 시 전역 설정 미변경", env.calls.confirms === 1 && env.cfgStore.catSermon === undefined);
}
{
  // 같은 볼트 재붙여넣기 → 기존 슬롯 갱신 (중복 등록 없음)
  const env = await makeEnv({
    gmValues: { v1_port: "51361", v1_vault: "VaultA", v2_port: "51362", v2_vault: "VaultB", v2_lrKey: "oldkey" },
    prompts: [makeCode({ vault: "VaultB", omniPort: "51999" })],
  });
  clickBolt(env);
  check("같은 볼트 → 해당 슬롯 갱신 (v2 포트 교체)", env.cfgStore.v2_port === "51999" && env.cfgStore.v1_port === "51361");
  check("교체 시 잔여값 정리 (이전 lrKey 제거)", env.cfgStore.v2_lrKey === "");
}
{
  // 6슬롯 만석 → prompt로 교체 슬롯 선택
  const full = {};
  for (let i = 1; i <= 6; i++) { full[`v${i}_port`] = String(51360 + i); full[`v${i}_vault`] = "V" + i; }
  const env = await makeEnv({ gmValues: full, prompts: [makeCode({ vault: "New", omniPort: "52000" }), "3"] });
  clickBolt(env);
  check("만석 + 슬롯 '3' 선택 → v3 교체", env.cfgStore.v3_vault === "New");
  const env2 = await makeEnv({ gmValues: full, prompts: [makeCode({ vault: "New", omniPort: "52000" }), null] });
  clickBolt(env2);
  check("만석 + 취소 → 아무것도 저장 안 함", env2.calls.sets.length === 0 && env2.calls.saves === 0);
}

console.log("\n[검색 정확도] refOnly 그룹 정렬 + 응답별 정규화");
{
  const mainResp = JSON.stringify([
    { score: 50, vault: "csh_remote", path: "300. Sermons/설교A.md", basename: "설교A", excerpt: "요 3 16 언급" },
    { score: 25, vault: "csh_remote", path: "300. Sermons/설교B.md", basename: "설교B", excerpt: "…" },
  ]);
  const auxResp = JSON.stringify([
    { score: 200, vault: "csh_remote", path: "1000. 성경/요3_16.md", basename: "요3_16", excerpt: "하나님이 세상을…" },
  ]);
  const respond = (u) => (decodeURIComponent(u).includes("요3_16") ? auxResp : mainResp);
  const env = await makeEnv({ q: "요 3:16", respond });
  const titles = env.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env.$(el).find(".om-title").text()).get();
  check("순수 구절 검색 → 구절노트(aux)가 최상단", titles[0] === "요3_16");
  const html = env.$(`#OmnisearchObsidianResults .om-list`).html() || "";
  check("메인 그룹 % 바가 자기 그룹 기준 (설교B=50%)", html.includes("50%"));
  const env2 = await makeEnv({ q: "요 3:16 은혜", respond });
  const titles2 = env2.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env2.$(el).find(".om-title").text()).get();
  check("혼합 쿼리 → 메인 결과가 먼저, aux는 뒤", titles2[0] === "설교A" && titles2.indexOf("요3_16") > titles2.indexOf("설교B"));
}

console.log("\n[카테고리] 디렉토리 경로만 매칭 (파일명 오분류 방지)");
{
  const resp = JSON.stringify([
    { score: 10, vault: "csh_remote", path: "300. Sermons/성경적 세계관.md", basename: "성경적 세계관", excerpt: "…" },
    { score: 8, vault: "csh_remote", path: "1000. 성경/요3_16.md", basename: "요3_16", excerpt: "…" },
  ]);
  const env = await makeEnv({ q: "세계관", respond: () => resp });
  env.$(`#OmnisearchObsidianResults .om-cat[data-v="bible"]`).trigger("click");
  const titles = env.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env.$(el).find(".om-title").text()).get();
  check("'성경' 칩: 폴더만 매칭 (파일명 '성경적 세계관' 제외)", titles.length === 1 && titles[0] === "요3_16");
}

console.log("\n[진단] 볼트 불일치 경고 + 버전 표시");
{
  const otherResp = JSON.stringify([
    { score: 5, vault: "other_vault", path: "note.md", basename: "note", excerpt: "…" },
  ]);
  const env = await makeEnv({
    q: "사랑",
    gmValues: { v1_port: "51361", v1_vault: "csh_remote" },
    respond: () => otherResp,
    latestVersion: "9.9.9",
  });
  env.$(`#OmnisearchObsidianResults .om-diagnose`).trigger("click");
  await new Promise((r) => setTimeout(r, 200));
  const diag = env.$(`#OmnisearchObsidianResults .om-list`).html() || "";
  check("다른 볼트가 포트 점유 → ⚠️ 경고", diag.includes("다른 볼트") && diag.includes("other_vault"));
  check("진단에 현재 버전 표시", diag.includes("현재 버전 v"));
  check("새 버전 안내 (9.9.9 스텁)", diag.includes("새 버전 v9.9.9"));
  check("진단에 등록 볼트 요약 표시", diag.includes("등록된 볼트 1개") && diag.includes("포트 51361"));
}

console.log("\n[v1.3.3] 숨김 필터 안내 + 원클릭 해제");
{
  const resp = JSON.stringify([
    { score: 100, vault: "csh_remote", path: "300. Sermons/설교A.md", basename: "설교A", excerpt: "…" },
    { score: 40, vault: "csh_remote", path: "300. Sermons/설교B.md", basename: "설교B", excerpt: "…" },
  ]);
  // 사용자가 예전에 최소 관련도 슬라이더를 90%로 올려놓고 잊은 상황 재현
  const env = await makeEnv({ q: "설교", respond: () => resp, gmStore: { om_minRel: 90 } });
  const titles = () => env.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env.$(el).find(".om-title").text()).get();
  check("minRel 90% 저장 상태 → 1건만 표시", titles().length === 1);
  const hintEl = env.$(`#OmnisearchObsidianResults .om-filter-hint`);
  check("필터 숨김 안내 표시 (1건 숨김 + 90%)", hintEl.length === 1 && /1건 숨김/.test(hintEl.text()) && /90%/.test(hintEl.text()));
  env.$(`#OmnisearchObsidianResults .om-filter-reset`).trigger("click");
  check("필터 해제 클릭 → 2건 모두 표시", titles().length === 2);
  check("필터 해제가 GM 저장소에 반영 (om_minRel=0)", (await env.window.GM.getValue("om_minRel", -1)) === 0);
  check("해제 후 안내 사라짐", env.$(`#OmnisearchObsidianResults .om-filter-hint`).length === 0);
}

console.log("\n[v1.4.0] 구절 노트 직접 조회·핀 (Omnisearch 상위 50건 캡 우회)");
{
  // 실기기 재현: 주석 노트가 상위 50건 독점 → 구절 노트가 응답에 없음 → 성경 칩 0건이던 상황
  const commResults = JSON.stringify([
    { score: 4498, vault: "csh_remote", path: "170. 성경/171. 성경주석/신약/04.요한복음/요한복음 1장 통합주석.md", basename: "요한복음 1장 통합주석", excerpt: "요1:1 주석…" },
    { score: 1647, vault: "csh_remote", path: "300. Sermons/사랑의 설교.md", basename: "사랑의 설교", excerpt: "요1_1 인용…" },
  ]);
  const respond = (u) => {
    const url = decodeURIComponent(u);
    if (url.includes("/vault/") && url.endsWith("/")) return JSON.stringify({ files: ["04.요한복음/", "01.마태복음/"] });
    if (url.includes("/vault/") && url.includes("요1_1.md")) return JSON.stringify({ content: "---\nx: 1\n---\n태초에 말씀이 계시니라 이 말씀이 하나님과 함께 계셨으니", tags: [] });
    if (url.includes("/vault/")) return JSON.stringify({ content: "" }); // 그 외 노트 fetch (enrich)
    return commResults; // Omnisearch 응답 (구절 노트 없음)
  };
  const env = await makeEnv({
    q: "요1:1",
    respond,
    gmStore: {},
    gmValues: {
      v1_port: "51367", v1_vault: "csh_remote", v1_lrPort: "27123", v1_lrKey: "testkey",
      useLocalRest: true, catBible: "170. 성경/신약,170. 성경/구약",
    },
  });
  const titles = () => env.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env.$(el).find(".om-title-text").text()).get();
  check("구절 노트(요1_1)가 REST 직접 조회로 최상단 핀", titles()[0] === "요1_1");
  check("핀 노트의 경로가 실제 탐색 결과 (신약/04.요한복음)", (env.window.document.querySelector("#OmnisearchObsidianResults .om-result .om-path") || {}).textContent?.includes("04.요한복음") ?? true);
  // 성경 칩: 주석·설교는 걸러지고 핀된 구절 노트만 남는다
  env.$(`#OmnisearchObsidianResults .om-cat[data-v="bible"]`).trigger("click");
  const bibleTitles = titles();
  check("성경 칩 → 구절 노트만 표시 (주석·설교 제외)", bibleTitles.length === 1 && bibleTitles[0] === "요1_1");
  // 책 폴더 캐시 저장 확인
  const cacheVal = await env.window.GM.getValue("om_bookDir__csh_remote__요한복음", "");
  check("책 폴더 경로가 GM에 캐시됨", cacheVal === "170. 성경/신약/04.요한복음");
}

console.log("\n[v1.4.0] 빈 카테고리 → 전체 보기 복귀");
{
  const resp = JSON.stringify([
    { score: 10, vault: "csh_remote", path: "300. Sermons/설교A.md", basename: "설교A", excerpt: "…" },
  ]);
  const env = await makeEnv({ q: "설교", respond: () => resp });
  env.$(`#OmnisearchObsidianResults .om-cat[data-v="devo"]`).trigger("click"); // 묵상 칩 — 해당 없음
  const emptyHint = env.$(`#OmnisearchObsidianResults .om-cat-reset`);
  check("빈 카테고리에서 '전체 보기' 링크 표시", emptyHint.length === 1);
  emptyHint.trigger("click");
  check("전체 보기 클릭 → 결과 복귀", env.$(`#OmnisearchObsidianResults .om-result`).length === 1);
}

console.log("\n[v1.3.3] 중복 실행 가드");
{
  const env = await makeEnv({ q: "사랑" });
  const before = env.window.document.querySelectorAll("#OmnisearchObsidianResults").length;
  // 같은 페이지에서 스크립트를 한 번 더 실행 (중복 설치본 시뮬레이션)
  const body3 = SRC.slice(SRC.indexOf("==/UserScript=="));
  const script3 = body3.slice(body3.indexOf("\n") + 1);
  env.window.eval(`(function(){ const GM = window.GM; ${script3} })()`);
  await new Promise((r) => setTimeout(r, 400));
  const after = env.window.document.querySelectorAll("#OmnisearchObsidianResults").length;
  check("두 번째 인스턴스는 조용히 종료 (위젯 1개 유지)", before === 1 && after === 1);
  check("가드 속성이 문서에 박힘", env.window.document.documentElement.getAttribute("data-a4p-omnisearch") === "1");
}

// ================================================================
// v1.5.0 신규 케이스: 주석 칩 제거·기본 제외, '자료' 칩 신설, 다양성 정렬,
// 설정 코드 cats.ref, om_cat 잔존값 마이그레이션
// ================================================================

console.log("\n[v1.5.0] 카테고리 칩 구성 (주석 → 자료)");
{
  const env = await makeEnv({ q: "사랑" });
  const cats = env.$(`#OmnisearchObsidianResults .om-cat`);
  check("칩 6개 유지", cats.length === 6);
  check("'자료'(ref) 칩 존재", env.$(`#OmnisearchObsidianResults .om-cat[data-v="ref"]`).text().includes("자료"));
  check("'주석'(comm) 칩 부재", env.$(`#OmnisearchObsidianResults .om-cat[data-v="comm"]`).length === 0);
}

console.log("\n[v1.5.0] 주석 노트 기본 제외 (디렉토리 매칭 — 파일명 오탐 없음)");
{
  const resp = JSON.stringify([
    { score: 100, vault: "csh_remote", path: "170. 성경/171. 성경주석/신약/04.요한복음/요한복음 1장 통합주석.md", basename: "요한복음 1장 통합주석", excerpt: "…" },
    { score: 50, vault: "csh_remote", path: "300. Sermons/설교A.md", basename: "설교A", excerpt: "…" },
    { score: 30, vault: "csh_remote", path: "100. notes/140. Ideas/주석에 대한 생각.md", basename: "주석에 대한 생각", excerpt: "…" },
  ]);
  const titlesOf = (env) => env.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env.$(el).find(".om-title-text").text()).get();
  const env = await makeEnv({ q: "사랑", respond: () => resp });
  const titles = titlesOf(env);
  check("주석 폴더 노트는 기본 제외", !titles.includes("요한복음 1장 통합주석"));
  check("파일명에만 '주석'이 있는 노트는 표시 (디렉토리 매칭)", titles.includes("주석에 대한 생각"));
  check("일반 노트 정상 표시", titles.includes("설교A"));
  // 해제: '주석 노트 숨기기' 꺼짐 → 주석도 표시
  const env2 = await makeEnv({ q: "사랑", respond: () => resp, gmValues: { hideComm: false } });
  check("hideComm 해제 → 주석 노트 표시", titlesOf(env2).includes("요한복음 1장 통합주석"));
}

console.log("\n[v1.5.0] '자료' 칩 필터 (700. Reference + 800. Readwise)");
{
  const resp = JSON.stringify([
    { score: 30, vault: "csh_remote", path: "700. Reference/712. 신학/로고스 개념 연구.md", basename: "로고스 개념 연구", excerpt: "…" },
    { score: 20, vault: "csh_remote", path: "800. Readwise/Books/하이라이트.md", basename: "하이라이트", excerpt: "…" },
    { score: 10, vault: "csh_remote", path: "300. Sermons/설교A.md", basename: "설교A", excerpt: "…" },
  ]);
  const env = await makeEnv({ q: "로고스", respond: () => resp });
  env.$(`#OmnisearchObsidianResults .om-cat[data-v="ref"]`).trigger("click");
  const titles = env.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env.$(el).find(".om-title-text").text()).get();
  check("자료 칩 → Reference·Readwise 노트만 표시", titles.length === 2 && titles.includes("로고스 개념 연구") && titles.includes("하이라이트"));
}

console.log("\n[v1.5.0] 다양성 정렬 (설교→조각→묵상→자료 교차 배치)");
{
  const mainResp = JSON.stringify([
    { score: 100, vault: "csh_remote", path: "300. Sermons/설교A.md", basename: "설교A", excerpt: "…" },
    { score: 90, vault: "csh_remote", path: "300. Sermons/설교B.md", basename: "설교B", excerpt: "…" },
    { score: 70, vault: "csh_remote", path: "100. notes/160. 묵상노트/묵상1.md", basename: "묵상1", excerpt: "…" },
    { score: 60, vault: "csh_remote", path: "700. Reference/712. 신학/자료1.md", basename: "자료1", excerpt: "…" },
  ]);
  const auxResp = JSON.stringify([
    { score: 200, vault: "csh_remote", path: "100. notes/180. 설교조각/조각1.md", basename: "조각1", excerpt: "…" },
  ]);
  const respond = (u) => (decodeURIComponent(u).includes("요1_1") ? auxResp : mainResp);
  const titlesOf = (env) => env.$(`#OmnisearchObsidianResults .om-result`).map((i, el) => env.$(el).find(".om-title-text").text()).get();
  const env = await makeEnv({ q: "요1:1", respond });
  check("교차 배치: 설교→조각→묵상→자료→설교", JSON.stringify(titlesOf(env)) === JSON.stringify(["설교A", "조각1", "묵상1", "자료1", "설교B"]));
  const env2 = await makeEnv({ q: "요1:1", respond, gmValues: { diversify: false } });
  const t2 = titlesOf(env2);
  check("diversify 해제 → 기존 그룹 정렬 복귀 (aux 먼저 + 점수순)", JSON.stringify(t2) === JSON.stringify(["조각1", "설교A", "설교B", "묵상1", "자료1"]));
}

console.log("\n[v1.5.0] 설정 코드 cats.ref 파싱");
{
  const env = await makeEnv({ prompts: [makeCode({ vault: "VaultA", omniPort: "51361", cats: { sermon: "설교", ref: "내자료", comm: "내주석" } })] });
  clickBolt(env);
  check("cats.ref → catRef 저장", env.cfgStore.catRef === "내자료");
  check("cats.comm → catComm 유지 (제외 키워드로 사용)", env.cfgStore.catComm === "내주석");
}

console.log("\n[v1.5.0] om_cat 잔존값('comm') 마이그레이션");
{
  const resp = JSON.stringify([
    { score: 10, vault: "csh_remote", path: "300. Sermons/설교A.md", basename: "설교A", excerpt: "…" },
  ]);
  // 구버전에서 '주석' 칩을 눌러 둔 사용자: 칩이 사라진 뒤에도 필터만 남아 0건이 되면 안 된다
  const env = await makeEnv({ q: "설교", respond: () => resp, gmStore: { om_cat: "comm" } });
  check("사라진 칩 저장값 → 전체 탭 복귀 (결과 표시)", env.$(`#OmnisearchObsidianResults .om-result`).length === 1);
  check("마이그레이션이 GM 저장소에 반영 (om_cat=all)", (await env.window.GM.getValue("om_cat", "")) === "all");
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
