// A4P Omnisearch 위젯 스모크 테스트 (jsdom) — 56케이스
// 실행 준비: npm install   (레포 루트에서 — devDependencies: jsdom, jquery)
// 실행:      npm test  (파서 테스트 포함)  또는  node test/widget-smoke.mjs
// 검증 범위: 4개 엔진 마운트 위치, 에디토리얼 스킨/테마 클래스, 카테고리 칩,
//            결과 렌더, ◐ 모드 순환(auto→light→dark)·GM 저장, SVG 아이콘 7종,
//            비검색 페이지(유튜브 watch, 구글 지도·이미지·홈) 미생성 가드.
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

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
