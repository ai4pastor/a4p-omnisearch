// ==UserScript==
// @name         A4P Omnisearch — 목회자 통합검색
// @namespace    https://github.com/ai4pastor/a4p-omnisearch
// @downloadURL  https://raw.githubusercontent.com/ai4pastor/a4p-omnisearch/main/userscript/a4p-omnisearch.user.js
// @updateURL    https://raw.githubusercontent.com/ai4pastor/a4p-omnisearch/main/userscript/a4p-omnisearch.user.js
// @homepageURL  https://ai4pastor.com
// @supportURL   https://github.com/ai4pastor/a4p-omnisearch/issues
// @version      1.6.2
// @description  구글·네이버·Bing·유튜브 검색 결과 옆에 내 옵시디언 볼트를 함께 띄우는 목회자 통합검색. 성경구절 인식(요3:16 → 구절 노트 + 인용 설교·설교조각), 목회 카테고리 필터(설교/조각/묵상/성경/자료), 주석 노트 기본 제외, 카테고리 다양성 정렬, 신학 doctrine 칩, 인용 복사, 설정 코드 한 번 붙여넣기 온보딩, 연결 진단, 라이트/다크 수동 전환. Omnisearch HTTP + Local REST API 기반.
// @author       A4P (abadcsh, ai4pastor.com)
// @contributor  구요한 (CMDSPACE) — obsidian-omnisearch-google-cmds fork base
// @contributor  Simon Cambier (original "Obsidian Omnisearch in Google" — https://github.com/scambier/userscripts)
// @license      MIT  (원작 크레딧 체인 유지: Simon Cambier → 구요한/CMDSPACE → A4P)
// @match        https://google.com/*
// @match        https://www.google.com/*
// @match        http://google.com/*
// @match        http://www.google.com/*
// @include      https://www.google.*/*
// @include      https://google.*/*
// @match        https://search.naver.com/*
// @match        https://www.bing.com/*
// @match        https://bing.com/*
// @match        https://www.youtube.com/*
// @icon         https://obsidian.md/favicon.ico
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @require      https://raw.githubusercontent.com/sizzlemctwizzle/GM_config/master/gm_config.js
// @require      https://gist.githubusercontent.com/scambier/109932d45b7592d3decf24194008be4d/raw/9c97aa67ff9c5d56be34a55ad6c18a314e5eb548/waitForKeyElements.js
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      localhost
// @connect      127.0.0.1
// @connect      raw.githubusercontent.com
// ==/UserScript==
/* globals GM_config, jQuery, $, waitForKeyElements */
(function () {
    "use strict";

    // 중복 실행 가드: 같은 스크립트가 2개 설치돼 동시에 켜지면(구버전+신버전 공존)
    // 설정 저장소가 갈라져 "설정은 맞는데 0건" 같은 유령 증상이 난다. DOM 속성은
    // Tampermonkey 스크립트 샌드박스 간에도 공유되므로 먼저 실행된 쪽만 살아남는다.
    if (document.documentElement.hasAttribute("data-a4p-omnisearch")) {
        console.warn("[A4P Omnisearch] 다른 인스턴스가 이미 실행 중 — 이 복사본은 종료합니다. Tampermonkey에서 중복 설치본을 삭제하세요.");
        return;
    }
    document.documentElement.setAttribute("data-a4p-omnisearch", "1");

    const ID = "OmnisearchObsidianResults";
    const VERSION = "1.6.2";
    const UPDATE_URL = "https://raw.githubusercontent.com/ai4pastor/a4p-omnisearch/main/userscript/a4p-omnisearch.user.js";
    const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

    // ---------- 검색엔진 어댑터 ----------
    // 각 엔진: 쿼리 파라미터 이름 + 결과 사이드바 셀렉터 + 사이드바가 없을 때의 폴백 부모.
    // sidebar:null = 항상 우측 플로팅 패널 사용 (유튜브처럼 사이드바가 없는 사이트).
    const ENGINES = {
        google:  { key: "google",  param: "q",            sidebar: "#rhs",       fallbackParent: "#rcnt" },
        naver:   { key: "naver",   param: "query",        sidebar: "#sub_pack",  fallbackParent: "#container" },
        bing:    { key: "bing",    param: "q",            sidebar: "#b_context", fallbackParent: "#b_content" },
        youtube: { key: "youtube", param: "search_query", sidebar: null,         fallbackParent: null },
    };
    const HOST = location.hostname;
    const ENGINE =
        /(^|\.)search\.naver\.com$/.test(HOST) ? ENGINES.naver
        : /(^|\.)bing\.com$/.test(HOST)        ? ENGINES.bing
        : /(^|\.)youtube\.com$/.test(HOST)     ? ENGINES.youtube
        : ENGINES.google;
    let sidebarSelector = ENGINE.sidebar; // 부팅 시 폴백/플로팅 패널로 재지정될 수 있음

    // ---------- persisted live state ----------
    const getVal = (k, d) => Promise.resolve(GM.getValue(k, d));
    const setVal = (k, v) => { try { GM.setValue(k, v); } catch (e) {} };

    const S = {};          // static settings (from GM_config)
    const state = {
        raw: [],           // merged results from all ports
        view: [],          // filtered + sorted + sliced
        topScore: 1,
        selected: -1,
        collapsed: false,
        controlsOpen: false,
        sort: "score",     // score | name | vault
        minRel: 0,         // 0..100 (% of top score)
        type: "all",       // all | md | pdf | img
        cat: "all",        // 목회 카테고리: all | sermon | frag | devo | bible | ref
        refine: "",        // overrides the URL query when set
        mode: "auto",      // 화면 모드: auto(OS 따라감) | light | dark — 헤더 ◐ 버튼으로 순환
        expanded: new Set(),
        vaultsSeen: 0,
        bibleRef: null,    // parseBibleRef() 결과 (성경구절 고정 카드용)
        firstVault: "",    // 딥링크 폴백용 첫 결과의 볼트명
        catCounts: null,   // 카테고리 칩 건수 배지 (applyPipeline에서 계산)
        limit: 0,          // "더 보기" 표시 상한 (0 = S.nbResults 사용)
        filteredCount: 0,  // slice 전 필터 통과 총 건수 (더 보기 남은 건수 계산용)
    };

    // 목회 카테고리 정의: key → [라벨, 설정 필드명]. 경로 키워드는 설정에서 로드(S.catKeywords).
    // v1.5.0: '주석' 칩 제거(catComm은 제외 키워드로 의미 전환), '자료' 칩 신설.
    const CATS = [
        ["all",    "전체",  null],
        ["sermon", "설교",  "catSermon"],
        ["frag",   "조각",  "catFrag"],
        ["devo",   "묵상",  "catDevo"],
        ["bible",  "성경",  "catBible"],
        ["ref",    "자료",  "catRef"],
    ];

    // ---------- helpers ----------
    const escapeHtml = (str) =>
        String(str ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    // Body-only preview: drop YAML frontmatter noise but KEEP Omnisearch's <mark> match highlight.
    const cleanExcerpt = (raw) => {
        let s = String(raw ?? "").replace(/<br\s*\/?>/gi, " ");
        if (S.cleanFrontmatter) {
            s = s
                .replace(/&quot;|&#0?39;/g, " ")                   // escaped quotes from the API
                .replace(/\b(type|aliases|author|description|date created|date modified|tags|CMDS|index|status|cssclasses|publish|created|modified|up|related|related notes|linked idea|source|source-vault|cover|banner|word_code|doctrine|route|world|outcome|성경구절|요약)\s*:/gi, " ")
                .replace(/!?\[\[[^\]]*\]\]/g, " ")                 // wikilinks / embeds
                .replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:]+)?\b/g, " ") // ISO dates / timestamps
                .replace(/["'`“”‘’]/g, " ")    // stray quotes/backticks (curly 포함)
                .replace(/(^|\s)#{1,6}\s+/g, " ")                  // markdown 헤딩 마커
                .replace(/(^|\s)[-—]{2,}(\s|$)/g, " ")             // 구분선 잔여물
                .replace(/(^|\s)-\s+/g, " ");                      // list markers
        }
        return s.replace(/\s{2,}/g, " ").trim();
    };

    const breadcrumb = (path) =>
        escapeHtml(String(path ?? "").replace(/\.md$/i, "")).split("/").join(' <span class="om-sep">›</span> ');

    // 노트의 "폴더 경로"만 소문자로 — 카테고리/제외 매칭은 디렉토리 기준(파일명 오탐 방지).
    const dirOf = (p) => String(p || "").toLowerCase().replace(/\/[^/]*$/, "");
    const dirMatches = (path, kws) => { const d = dirOf(path); return kws.some((k) => d.includes(k)); };

    // 설교 파일명 규칙(YYMMDD_부서_제목)을 파싱해 날짜·부서 배지를 만든다 (v1.6.0).
    // basename 원본은 절대 가공하지 않음 — 위키링크 복사·열기·인용은 원본을 쓴다.
    const SERMON_DEPTS = { "대": "대예배", "청": "청소년부", "어": "어린이부" };
    const SERMON_RE = /^(\d{2})(\d{2})(\d{2})[._\- ]?(대|청|어)(?:예배|소년부|린이부)?[._\- ]\s*(.+)$/;
    function sermonMeta(basename) {
        const m = SERMON_RE.exec(String(basename || ""));
        if (!m) return null;
        const mm = +m[2], dd = +m[3];
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null; // 날짜가 아닌 숫자 prefix 오탐 차단
        return { date: `20${m[1]}-${m[2]}-${m[3]}`, dept: SERMON_DEPTS[m[4]], title: m[5].trim() };
    }

    const extOf = (p) => String(p ?? "").split(".").pop().toLowerCase();
    const matchType = (p, t) => {
        const e = extOf(p);
        if (t === "md") return e === "md";
        if (t === "pdf") return e === "pdf";
        if (t === "img") return IMG_EXT.includes(e);
        return true;
    };

    const validHex = (h) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(h || "").trim());

    // Vault configs come from the split settings slots (built in loadSettings → S.vaults).
    const parsePorts = () => S.vaults || [];

    // Build the obsidian:// deeplink.
    //   `obsidian://open?file=` resolves by path WITHOUT the .md extension — keeping ".md"
    //   makes it fail to open the note (it just switches vault). Strip .md only; keep .pdf/.png/etc.
    //   Advanced URI (plugin) resolves reliably across multiple open vault windows when enabled.
    function openUrl(item) {
        const v = item._dvault || item.vault || "";
        if (S.useAdvancedUri) {
            // Advanced URI reliably opens files even in background vault windows.
            // filepath wants the real path WITH extension.
            return `obsidian://adv-uri?vault=${encodeURIComponent(v)}&filepath=${encodeURIComponent(item.path)}`;
        }
        // Vanilla open resolves by path WITHOUT .md. (Note: vanilla can still fail to open a
        // note in a *background* vault window — that's an Obsidian limitation; use Advanced URI.)
        const file = String(item.path || "").replace(/\.md$/i, "");
        return `obsidian://open?vault=${encodeURIComponent(v)}&file=${encodeURIComponent(file)}`;
    }

    // Vault-only deeplink: activates (raises) that vault's window without changing the open note.
    function focusUrl(item) {
        const v = item._dvault || item.vault || "";
        return `obsidian://open?vault=${encodeURIComponent(v)}`;
    }

    // Single choke point for obsidian:// navigations (tests observe via window.__omNav).
    function goObsidian(url) {
        if (window.__omNav) { window.__omNav(url); return; }
        window.location.href = url;
    }

    const hasRest = (item) => S.useLocalRest && item && item._restKey && lrBase(item._restPort);

    // Open directly via Local REST API (POST /open/{path}) — talks to that vault's own server,
    // so it works regardless of which vault window is focused or which plugins it has.
    function openViaRest(item) {
        const base = lrBase(item._restPort);
        const enc = String(item.path || "").split("/").map(encodeURIComponent).join("/");
        GM.xmlHttpRequest({
            method: "POST",
            url: `${base}/open/${enc}`,
            headers: { "Authorization": "Bearer " + item._restKey },
            timeout: S.requestTimeout,
            onload: (r) => {
                if (r.status >= 300) {
                    console.warn("[Omnisearch CMDS] /open", r.status, "→ falling back to deeplink");
                    goObsidian(openUrl(item));
                } else if (S.focusOnOpen) {
                    // REST opened the note silently — raise the vault window so the user sees it.
                    goObsidian(focusUrl(item));
                }
            },
            onerror: () => { goObsidian(openUrl(item)); }, // fall back to obsidian://
            ontimeout: () => { goObsidian(openUrl(item)); },
        });
    }

    // Preferred opener: Local REST (most reliable for configured vaults) → else obsidian:// deeplink.
    function openItem(item) {
        if (!item) return;
        if (hasRest(item)) openViaRest(item);
        else goObsidian(openUrl(item));
    }

    const hexToRgb = (h) => {
        let s = String(h).replace("#", "").trim();
        if (s.length === 3) s = s.split("").map((c) => c + c).join("");
        const n = parseInt(s, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(",");
    };
    function applyCustomColors() {
        const root = document.getElementById(ID);
        if (!root) return;
        if (validHex(S.accentColor)) {
            root.style.setProperty("--accent", S.accentColor.trim());
            root.style.setProperty("--accent-rgb", hexToRgb(S.accentColor.trim()));
        }
        if (validHex(S.titleColor)) root.style.setProperty("--title", S.titleColor.trim());
    }

    // Stable color per vault (used when no explicit #color is set for the port).
    const hashHue = (str) => {
        let h = 0;
        for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return h % 360;
    };
    const vaultColor = (item) =>
        validHex(item._color) ? item._color : `hsl(${hashHue(item._label || item.vault || "")}, 62%, 58%)`;

    // Absolute filesystem path. The Omnisearch API does NOT return the OS path (only the
    // vault NAME + vault-relative path), so we resolve it one of two ways:
    //   1) explicit per-vault root (vN_root), or
    //   2) a shared parent dir + the vault name (works when vaults sit under one folder
    //      and the vault name == its folder name, which is the usual case).
    const absPath = (item) => {
        const explicit = S.vaultRoots[item._label] || S.vaultRoots[item.vault];
        if (explicit) return explicit.replace(/\/+$/, "") + "/" + item.path;
        if (S.vaultsParentDir && item.vault) {
            return S.vaultsParentDir.replace(/\/+$/, "") + "/" + item.vault + "/" + item.path;
        }
        return null;
    };

    // Best-effort tag extraction from the excerpt (Omnisearch HTTP API has no tags field).
    function extractTags(rawExcerpt) {
        const raw = String(rawExcerpt ?? "").replace(/&#?\w+;/g, " "); // strip HTML entities (&#039; &quot; …)
        const out = [], seen = new Set();
        const add = (t) => {
            t = String(t).trim().replace(/^#/, "").replace(/[,.;:]+$/, "");
            if (!t || t.length < 2 || t.length > 30 || /^\d+$/.test(t)) return;
            if (/[*`~|<>"'()→←↔]/.test(t)) return;           // reject markdown / junk fragments
            const k = t.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k); out.push(t);
        };
        (raw.match(/#[^\s#<>&,;\[\]"'*`…]{2,30}/g) || []).forEach(add);           // inline #hashtags
        (raw.match(/\[([^\[\]]*,[^\[\]]*)\]/g) || []).forEach((seg) =>            // [a, b, c] arrays
            seg.replace(/^\[|\]$/g, "").split(",").forEach(add));
        const tm = raw.match(/\btags\s*:\s*([^\n]{0,120})/i);                     // YAML "tags: a b c" run
        if (tm) tm[1].split(/\b[a-z][\w-]*\s*:/i)[0].split(/[\s,]+/).slice(0, 12).forEach(add);
        return out.slice(0, S.maxTags);
    }

    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ---------- 성경구절 인식 (Bible reference parser) ----------
    // 66권 [약어, 정식명, ...별칭]. 볼트 표준 약어표(04. 설교문 작업 워크플로우)와 동일.
    // 노트 파일명 형식: {약어}{장}_{절} (예: 요3_16) — 설정(bibleNoteFormat)으로 변경 가능.
    const BIBLE_BOOKS = [
        ["창", "창세기"], ["출", "출애굽기"], ["레", "레위기"], ["민", "민수기"], ["신", "신명기"],
        ["수", "여호수아"], ["삿", "사사기"], ["룻", "룻기"], ["삼상", "사무엘상"], ["삼하", "사무엘하"],
        ["왕상", "열왕기상"], ["왕하", "열왕기하"], ["대상", "역대상"], ["대하", "역대하"],
        ["스", "에스라"], ["느", "느헤미야"], ["에", "에스더"], ["욥", "욥기"],
        ["시", "시편"], ["잠", "잠언"], ["전", "전도서"], ["아", "아가"],
        ["사", "이사야"], ["렘", "예레미야"], ["애", "예레미야애가", "애가"], ["겔", "에스겔"], ["단", "다니엘"],
        ["호", "호세아"], ["욜", "요엘"], ["암", "아모스"], ["옵", "오바댜"], ["욘", "요나"],
        ["미", "미가"], ["나", "나훔"], ["합", "하박국"], ["습", "스바냐"], ["학", "학개"],
        ["슥", "스가랴"], ["말", "말라기"],
        ["마", "마태복음"], ["막", "마가복음"], ["눅", "누가복음"], ["요", "요한복음"], ["행", "사도행전"],
        ["롬", "로마서"], ["고전", "고린도전서"], ["고후", "고린도후서"], ["갈", "갈라디아서"],
        ["엡", "에베소서"], ["빌", "빌립보서"], ["골", "골로새서"],
        ["살전", "데살로니가전서"], ["살후", "데살로니가후서"],
        ["딤전", "디모데전서"], ["딤후", "디모데후서"], ["딛", "디도서"], ["몬", "빌레몬서"],
        ["히", "히브리서"], ["약", "야고보서"], ["벧전", "베드로전서"], ["벧후", "베드로후서"],
        ["요일", "요한1서", "요한일서"], ["요이", "요한2서", "요한이서"], ["요삼", "요한3서", "요한삼서"],
        ["유", "유다서"], ["계", "요한계시록", "계시록"],
    ];
    // 이름 → 약어 lookup. 긴 이름이 먼저 매칭되도록 길이 내림차순 alternation.
    const BIBLE_LOOKUP = {};
    const BIBLE_NAMES = [];
    for (const row of BIBLE_BOOKS) {
        const abbr = row[0];
        for (const name of row) { BIBLE_LOOKUP[name] = abbr; BIBLE_NAMES.push(name); }
    }
    BIBLE_NAMES.sort((a, b) => b.length - a.length);
    const BIBLE_RE = new RegExp(
        "(?:^|[\\s\"'\\(\\[])(" + BIBLE_NAMES.map(escapeRegExp).join("|") + ")" +
        "\\s*(\\d{1,3})" +                                  // 장
        "(?:\\s*[:_.]\\s*(\\d{1,3})|\\s*장\\s*(\\d{1,3})\\s*절?|\\s*[장편])?" + // 절 (요3:16 | 요 3장 16절 | 시편 23편)
        "(?:\\s*[-~]\\s*(\\d{1,3})\\s*절?)?"                 // 범위 끝
    );

    const bibleFullName = (abbr) => { for (const row of BIBLE_BOOKS) if (row[0] === abbr) return row[1]; return abbr; };

    // 노트명 템플릿 적용: "{약어}{장}_{절}" → 요3_16
    const verseNoteName = (fmt, abbr, ch, v) =>
        String(fmt || "{약어}{장}_{절}").replace("{약어}", abbr).replace("{장}", ch).replace("{절}", v == null ? "" : v);

    // 쿼리에서 성경구절 참조를 찾아 { abbr, book, chapter, verse, verseEnd, display, noteNames, auxQueries } 반환.
    // 매칭 없으면 null. 범위 구절은 볼트 표준대로 개별 절로 분리 (상한 5절).
    function parseBibleRef(query, fmt) {
        const m = BIBLE_RE.exec(" " + String(query || ""));
        if (!m) return null;
        const abbr = BIBLE_LOOKUP[m[1]];
        const chapter = parseInt(m[2], 10);
        const verse = m[3] != null ? parseInt(m[3], 10) : (m[4] != null ? parseInt(m[4], 10) : null);
        const verseEnd = m[5] != null ? parseInt(m[5], 10) : null;
        if (!abbr || !chapter || chapter > 176) return null; // 시편 최대 150편 + 여유
        // 오탐 가드: 한 글자 약어(전·말·시·요 등)는 절이 있거나 장/편 표기가 있을 때만 인정
        // ("전 3개월", "말 10마리" 같은 일반 문장을 성경구절로 오인하지 않도록)
        if (m[1].length === 1 && verse == null && !/[장편]/.test(m[0])) return null;
        const book = bibleFullName(abbr);
        const noteNames = [];
        if (verse != null) {
            const end = verseEnd != null && verseEnd > verse ? Math.min(verseEnd, verse + 4) : verse; // 상한 5절
            for (let v = verse; v <= end; v++) noteNames.push(verseNoteName(fmt, abbr, chapter, v));
        } else {
            noteNames.push(verseNoteName(fmt, abbr, chapter, 1)); // 장 단위 → 1절 노트로 진입
        }
        const display = book + " " + chapter + (verse != null ? ":" + verse + (verseEnd != null ? "-" + verseEnd : "") : "장");
        // 보조 쿼리: 구절 노트명 형식으로도 검색 → 구절 노트 + 그 구절을 frontmatter 성경구절/본문에 인용한 설교·설교조각이 함께 잡힘
        // 장 단위는 prefix 후보(요3_)를 추가해 그 장의 다른 절 인용 노트도 잡는다 (Omnisearch=minisearch가 마지막 텀에 prefix 매칭).
        const auxQueries = verse != null
            ? noteNames.slice()
            : [abbr + chapter + "_", abbr + chapter + "_1", abbr + chapter];
        // refOnly: 쿼리가 구절 참조뿐인지 (검색어에 다른 키워드가 없는지) — 정렬 그룹 배치에 사용
        const rest = (" " + String(query || "")).replace(m[0], " ").replace(/\s+/g, " ").trim();
        return { abbr, book, chapter, verse, verseEnd, display, noteNames, auxQueries, refOnly: rest.length === 0 };
    }

    // ---------- Local REST API enrichment (real body + real tags) ----------
    // Strip the YAML frontmatter block from a note's raw markdown, then build a body-only
    // preview centered on the first query term (with <mark> highlight).
    function bodyPreview(content, query) {
        let body = String(content || "").replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, ""); // drop frontmatter
        body = body.replace(/```[\s\S]*?```/g, " ")           // code fences
                   .replace(/^#{1,6}\s+/gm, "")               // heading markers
                   .replace(/!?\[\[[^\]]*\]\]/g, " ")         // wikilinks/embeds
                   .replace(/[*_`>#-]/g, " ")                 // stray md symbols
                   .replace(/\s+/g, " ").trim();
        const terms = String(query || "").toLowerCase().split(/\s+/).filter((t) => t.length > 1);
        let idx = -1;
        for (const t of terms) { const p = body.toLowerCase().indexOf(t); if (p >= 0) { idx = p; break; } }
        let snip, lead = false, tail;
        if (idx >= 0) { const start = Math.max(0, idx - 60); lead = start > 0; snip = body.slice(start, start + 320); }
        else snip = body.slice(0, 320);
        tail = body.length > (idx >= 0 ? Math.max(0, idx - 60) : 0) + snip.length;
        let html = escapeHtml(snip);
        terms.forEach((t) => { html = html.replace(new RegExp("(" + escapeRegExp(t) + ")", "gi"), "<mark>$1</mark>"); });
        return (lead ? "… " : "") + html + (tail ? " …" : "");
    }

    // Accept a bare port ("27123"), host:port, or a full base URL ("http(s)://host:port[/]").
    function lrBase(port) {
        let p = String(port || "").trim().replace(/\/+$/, "");
        if (!p) return null;
        if (/^https?:\/\//i.test(p)) return p;          // full URL
        if (/^\d+$/.test(p)) return "http://127.0.0.1:" + p; // bare port → HTTP (Local REST는 127.0.0.1 바인딩 실측 — Omnisearch와 달리 IPv4)
        if (/^[\w.-]+:\d+$/.test(p)) return "http://" + p;   // host:port
        return null;
    }

    function fetchNote(cfg, path) {
        return new Promise((resolve) => {
            const base = lrBase(cfg.port);
            if (!base) { resolve(null); return; }
            const enc = String(path || "").split("/").map(encodeURIComponent).join("/");
            GM.xmlHttpRequest({
                method: "GET",
                url: `${base}/vault/${enc}`,
                headers: { "Authorization": "Bearer " + cfg.key, "Accept": "application/vnd.olrapi.note+json" },
                timeout: S.requestTimeout,
                onload: (r) => {
                    if (r.status < 200 || r.status >= 300) {
                        console.warn("[Omnisearch CMDS] Local REST", r.status, base, (r.responseText || "").slice(0, 120));
                        resolve(null); return;
                    }
                    try { resolve(JSON.parse(r.response)); } catch (e) { resolve(null); }
                },
                onerror: (e) => { console.warn("[Omnisearch CMDS] Local REST connection failed →", base, "(HTTPS self-signed? enable the plugin's HTTP server and use that port)"); resolve(null); },
                ontimeout: () => { console.warn("[Omnisearch CMDS] Local REST timeout →", base); resolve(null); },
            });
        });
    }

    // ---------- 구절 노트 직접 조회 (Omnisearch 상위 50건 캡 우회) ----------
    // Omnisearch HTTP는 응답을 상위 ~50건에서 자른다. 주석·설교처럼 구절 토큰을 수십 번 포함한
    // 큰 노트가 점수 상위를 독점하면 정작 구절 노트(요1_1.md — 제목 한 번, 본문 짧음)는 응답에
    // 못 들어온다. 그래서 검색 랭킹에 기대지 않고 Local REST의 폴더 목록으로 실제 경로를 찾아
    // 결과 맨 위에 핀(pin)한다. 책 폴더 경로는 볼트별로 GM에 캐시.
    function listDir(rest, dir) {
        return new Promise((resolve) => {
            const base = lrBase(rest.port);
            if (!base) { resolve([]); return; }
            const enc = String(dir || "").replace(/\/+$/, "").split("/").map(encodeURIComponent).join("/");
            GM.xmlHttpRequest({
                method: "GET",
                url: `${base}/vault/${enc}/`,
                headers: { "Authorization": "Bearer " + rest.key },
                timeout: S.requestTimeout,
                onload: (r) => { try { resolve(JSON.parse(r.response).files || []); } catch (e) { resolve([]); } },
                onerror: () => resolve([]),
                ontimeout: () => resolve([]),
            });
        });
    }

    function makePinnedItem(cfg, path, name, content) {
        return {
            vault: cfg.dvault || cfg.label || "", path, basename: name,
            score: 0, foundWords: [], matches: [],
            excerpt: bodyPreview(content, name), // 구절 본문 미리보기
            _pinned: true, _aux: true, _rel: 1,
            _label: cfg.label, _color: cfg.color, _dvault: cfg.dvault,
            _restPort: cfg.lrPort, _restKey: cfg.lrKey,
        };
    }

    async function verseNotesFromVault(cfg, roots) {
        const rest = { port: cfg.lrPort, key: cfg.lrKey };
        const book = state.bibleRef.book;
        const cacheKey = "om_bookDir__" + (cfg.dvault || cfg.label || cfg.port) + "__" + book;
        const cached = await getVal(cacheKey, "");
        const tryDirs = cached ? [cached] : [];
        if (!cached) {
            // 성경 카테고리 폴더들에서 책 폴더(이름에 책 이름 포함)를 찾는다. 예: 신약/ → "04.요한복음/"
            for (const root of roots) {
                const files = await listDir(rest, root);
                const hit = files.find((f) => f.endsWith("/") && f.includes(book));
                if (hit) tryDirs.push(root.replace(/\/+$/, "") + "/" + hit.replace(/\/+$/, ""));
                if (files.includes(state.bibleRef.noteNames[0] + ".md")) tryDirs.push(root); // 루트에 바로 있는 볼트 구조
            }
        }
        for (const dir of tryDirs) {
            const found = [];
            for (const name of state.bibleRef.noteNames.slice(0, 3)) {
                const note = await fetchNote(rest, dir + "/" + name + ".md");
                if (note && typeof note.content === "string") found.push(makePinnedItem(cfg, dir + "/" + name + ".md", name, note.content));
            }
            if (found.length) { setVal(cacheKey, dir); return found; }
        }
        if (cached) setVal(cacheKey, ""); // 캐시가 낡았으면 비워서 다음 검색 때 재탐색
        return [];
    }

    async function resolveVerseNotes() {
        try {
            if (!state.bibleRef || !S.useLocalRest) return [];
            const roots = S.catBibleRaw || [];
            if (!roots.length) return [];
            for (const cfg of (S.vaults || []).filter((v) => v.lrPort && v.lrKey)) {
                const notes = await verseNotesFromVault(cfg, roots);
                if (notes.length) return notes; // 첫 볼트에서 찾으면 충분
            }
        } catch (e) { /* 구절 핀은 보조 기능 — 실패해도 검색은 정상 진행 */ }
        return [];
    }

    // 늦게 도착한 구절 노트를 결과 맨 앞에 끼워 넣고 다시 그린다 (Omnisearch 중복은 제거)
    function mergePinned(pinned) {
        if (!pinned || !pinned.length) return;
        const keys = new Set(pinned.map((p) => (p.vault || "") + "|" + (p.path || "")));
        state.raw = pinned.concat(state.raw.filter((r) => !keys.has((r.vault || "") + "|" + (r.path || ""))));
        applyPipeline();
        renderResults();
    }

    // Pull tags from a Local REST note JSON. Order = curated first:
    //   1) frontmatter.tags/tag (the vault's real, curated tags)
    //   2) top-level `tags` (olrapi exposes INLINE #tags here, not frontmatter — noisier)
    //   3) inline #tags extracted from the body (last resort)
    function notesTags(note) {
        const out = [];
        const push = (v) => {
            if (Array.isArray(v)) v.forEach(push);
            else if (typeof v === "string") v.split(/[,\s]+/).forEach((s) => out.push(s));
        };
        const fm = note.frontmatter || note.properties || {};
        push(fm.tags); push(fm.tag);                                  // 1) frontmatter (preferred)
        if (!out.length && Array.isArray(note.tags)) push(note.tags); // 2) inline (olrapi top-level)
        if (!out.length && note.content) extractTags(note.content).forEach((t) => out.push(t)); // 3) body
        const seen = new Set(), res = [];
        for (let t of out) {
            t = String(t).replace(/^#+/, "").replace(/[…\s.,;:]+$/u, "").trim(); // drop trailing ellipsis/punct
            if (!t || /^\d+$/.test(t)) continue;
            const k = t.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k); res.push(t);
        }
        return res;
    }

    let _restShape = false; // log the note shape once, to help diagnose variants

    // 받아 온 노트로 카드 하나를 패치 — 본문 미리보기·태그·doctrine·성경구절 칩.
    function patchCard(card, note, query) {
        if (note.content) card.find(".om-excerpt").html(bodyPreview(note.content, query));
        if (S.showTags) {
            const tags = notesTags(note).slice(0, S.maxTags);
            let box = card.find(".om-tags");
            const html = tags.map((t) => `<span class="om-tag">${escapeHtml(t)}</span>`).join("");
            if (tags.length) {
                if (box.length) box.html(html);
                else card.find(".om-excerpt").after(`<div class="om-tags">${html}</div>`);
            } else box.remove();
        }
        // A4P: frontmatter의 WORD doctrine(🔖 신학 태그)과 성경구절 배열을 칩으로 표시.
        // doctrine 칩 클릭 = 그 주제로 재검색, 성경구절 칩 클릭 = 해당 구절 노트 열기.
        const fm = note.frontmatter || note.properties || {};
        const stripLink = (s) => String(s).replace(/\[\[|\]\]/g, "").replace(/🔖/g, "").trim();
        const asList = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map(stripLink).filter(Boolean);
        if (S.showDoctrine) {
            const doc = asList(fm.doctrine);
            card.find(".om-doctrine").remove();
            if (doc.length) {
                const html = doc.slice(0, 6).map((t) =>
                    `<button class="om-doc" data-q="${escapeHtml(t)}" title="이 주제로 다시 검색">✝️ ${escapeHtml(t)}</button>`).join("");
                card.find(".om-excerpt").after(`<div class="om-doctrine">${html}</div>`);
            }
        }
        if (S.showVerseChips) {
            const verses = asList(fm["성경구절"]);
            card.find(".om-verses").remove();
            if (verses.length) {
                const html = verses.slice(0, 8).map((v) =>
                    `<button class="om-verse" data-note="${escapeHtml(v)}" title="구절 노트 열기">${escapeHtml(v)}</button>`).join("");
                const anchor = card.find(".om-doctrine");
                (anchor.length ? anchor : card.find(".om-excerpt")).after(`<div class="om-verses">${html}</div>`);
            }
        }
    }

    // After cards render, pull the real note (body + tags) for each visible result and patch it in.
    function enrichResults() {
        if (!S.useLocalRest) return;
        const cards = $(`#${ID} .om-result`);
        const query = baseQuery();
        // "더 보기"로 30을 넘겨도 새로 노출된 카드가 enrich되도록 상한 확장 — 이미 받은 노트는
        // item._note 캐시로 재요청 없이 패치하므로 신규 fetch는 회당 nbResults건 이내.
        const cap = Math.min(state.view.length, Math.max(30, state.limit || 0));
        for (let i = 0; i < cap; i++) {
            const item = state.view[i];
            if (!item || !item._restPort || !item._restKey) continue;
            const card = cards.eq(i);
            if (item._note) { patchCard(card, item._note, query); continue; }
            fetchNote({ port: item._restPort, key: item._restKey }, item.path).then((note) => {
                if (!note) return;
                if (!_restShape) { _restShape = true; console.log("[Omnisearch CMDS] Local REST note keys:", Object.keys(note), "| tags:", note.tags, "| frontmatter.tags:", (note.frontmatter || {}).tags); }
                item._note = note; // 재렌더(칩 클릭·더 보기·정렬) 시 네트워크 없이 재패치
                patchCard(card, note, query);
            });
        }
    }

    const debounce = (fn, ms) => {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    };

    function copyText(text) {
        const done = () => toast("Copied: " + text);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else fallbackCopy(text, done);
    }
    function fallbackCopy(text, cb) {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); cb(); } catch (e) {}
        document.body.removeChild(ta);
    }

    let toastTimer;
    function toast(msg) {
        let el = $("#om-toast")[0];
        if (!el) {
            el = document.createElement("div");
            el.id = "om-toast";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
    }

    // ---------- A4P: 구절 노트 열기 / 인용 복사 / 설정 코드 / 진단 ----------

    // 노트 "이름"만으로 열기 (경로를 모르는 성경구절 노트용 — obsidian://open은 위키링크처럼 이름을 해석)
    function openNoteByName(name) {
        if (!name) return;
        const v = state.firstVault || (S.vaults[0] && S.vaults[0].dvault) || "";
        goObsidian(v
            ? `obsidian://open?vault=${encodeURIComponent(v)}&file=${encodeURIComponent(name)}`
            : `obsidian://open?file=${encodeURIComponent(name)}`);
    }

    // 설교문에 바로 붙일 수 있는 인용 형식: “발췌…” — [[노트명]]
    function copyCitation(item, card) {
        let txt = card ? card.find(".om-excerpt").text().replace(/\s+/g, " ").trim() : "";
        txt = txt.replace(/^…\s*/, "").replace(/\s*…$/, "");
        const cut = txt.length > 120;
        copyText(`“${txt.slice(0, 120)}${cut ? "…" : ""}” — [[${item.basename}]]`);
    }

    // ---------- 설정 코드(A4P1:) 멀티볼트 온보딩 ----------
    // 슬롯 i(1~6)의 현재 상태 요약
    function slotInfo(i) {
        return {
            i,
            port:  String(gmc.get("v" + i + "_port")  || "").trim(),
            name:  String(gmc.get("v" + i + "_name")  || "").trim(),
            vault: String(gmc.get("v" + i + "_vault") || "").trim(),
        };
    }

    // 설정 코드가 들어갈 슬롯 선택: 같은 vault → 갱신 / 빈 슬롯 → 신규 / 만석 → 사용자 선택. null = 취소.
    function chooseSlot(cfg) {
        const slots = []; for (let i = 1; i <= 6; i++) slots.push(slotInfo(i));
        const vault = String(cfg.vault || "").trim();
        // 1) 같은 볼트명 슬롯이 있으면 그 슬롯 갱신 (두 번 붙여넣어도 중복 등록 안 됨)
        if (vault) { const hit = slots.find((s) => s.vault === vault); if (hit) return hit.i; }
        // 2) 첫 빈 슬롯. 슬롯1은 미설정 기본값(port 51361/name Main)이 차 있어 보이므로 vault 공백이면 빈 것으로 본다
        const free = slots.find((s) => !s.port || (s.i === 1 && !s.vault));
        if (free) return free.i;
        // 3) 만석 → 교체할 슬롯을 사용자가 선택
        const listing = slots.map((s) => `${s.i}. ${s.name || "(이름 없음)"} — ${s.vault || "볼트명 미지정"} (포트 ${s.port})`).join("\n");
        const ans = window.prompt("볼트 슬롯 6개가 모두 사용 중입니다.\n교체할 슬롯 번호(1~6)를 입력하세요:\n\n" + listing, "");
        if (ans == null) return null;
        const n = parseInt(ans, 10);
        if (!(n >= 1 && n <= 6)) { alert("1~6 사이 번호를 입력해 주세요. 적용을 취소합니다."); return null; }
        return n;
    }

    // cfg를 슬롯 i에 기록. 교체 시 이전 볼트의 잔여값(REST 키·root)이 남지 않게 color 제외 전 키를 덮어쓴다.
    function writeSlot(i, cfg) {
        gmc.set("v" + i + "_port",  String(cfg.omniPort || "51361"));
        gmc.set("v" + i + "_name",  String(cfg.label || cfg.vault || "내 볼트"));
        gmc.set("v" + i + "_vault", String(cfg.vault || ""));
        gmc.set("v" + i + "_root",  String(cfg.root || ""));
        gmc.set("v" + i + "_lrPort", cfg.restPort ? String(cfg.restPort) : "");
        gmc.set("v" + i + "_lrKey",  String(cfg.restKey || ""));
        if (cfg.restPort && cfg.restKey) gmc.set("useLocalRest", true);
        // v{i}_color는 사용자 취향값이라 건드리지 않음 (비우면 이름 해시 자동색)
    }

    // 옵시디언 A4P Helper 플러그인이 만들어 준 설정 코드(A4P1:base64url JSON)를 붙여넣어 원클릭 설정.
    // 볼트마다 코드를 한 번씩 붙여넣으면 슬롯(최대 6개)에 차례로 등록돼 멀티볼트 동시 검색이 된다.
    function importSetupCode() {
        const raw = window.prompt("옵시디언 'A4P Omnisearch Helper' 플러그인에서 복사한 설정 코드를 붙여넣으세요.\n(A4P1: 로 시작하는 코드)\n\n💡 볼트가 여러 개라면 각 볼트의 코드를 한 번씩 붙여넣으세요 — 함께 검색됩니다.", "");
        if (!raw) return;
        const s = raw.trim();
        if (!/^A4P1:/.test(s)) { alert("설정 코드 형식이 아닙니다. 'A4P1:' 로 시작하는 코드를 붙여넣어 주세요."); return; }
        let cfg;
        try {
            const b64 = s.slice(5).replace(/-/g, "+").replace(/_/g, "/");
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            cfg = JSON.parse(new TextDecoder("utf-8").decode(bytes));
        } catch (e) { alert("설정 코드를 해석할 수 없습니다. 복사가 잘렸는지 확인해 주세요."); return; }
        if (!cfg || cfg.v !== 1) { alert("지원하지 않는 설정 코드 버전입니다. 플러그인을 업데이트해 주세요."); return; }

        const slot = chooseSlot(cfg);
        if (slot == null) return; // 취소 — 아무것도 저장하지 않음

        // 이 슬롯 외에 이미 등록된 볼트가 있는지 (전역 설정 덮어쓰기 정책용)
        let others = 0;
        for (let i = 1; i <= 6; i++) {
            if (i === slot) continue;
            const si = slotInfo(i);
            if (si.vault || (i !== 1 && si.port)) others++;
        }

        writeSlot(slot, cfg);

        // 전역 설정(구절 노트 형식·카테고리 키워드): 첫 볼트면 그냥 적용, 다른 볼트가 있으면 확인 후 적용
        if (cfg.bibleFormat || cfg.cats) {
            const applyGlobal = others === 0 ||
                window.confirm("이 설정 코드의 공통 설정(성경 노트 형식·카테고리 폴더 키워드)도 함께 적용할까요?\n(모든 볼트 검색에 공통으로 쓰이는 값입니다)");
            if (applyGlobal) {
                if (cfg.bibleFormat) gmc.set("bibleNoteFormat", String(cfg.bibleFormat));
                if (cfg.cats) {
                    const catMap = { sermon: "catSermon", frag: "catFrag", devo: "catDevo", bible: "catBible", ref: "catRef", comm: "catComm" };
                    for (const k in catMap) {
                        if (cfg.cats[k]) gmc.set(catMap[k], String(cfg.cats[k]));
                    }
                }
            }
        }

        // 적용 결과 요약 — save가 페이지를 새로고침하므로 blocking alert를 먼저 띄운다
        const lines = [];
        for (let i = 1; i <= 6; i++) {
            const si = slotInfo(i);
            if (si.port && (si.vault || (si.i !== 1 && si.name))) lines.push(`  ${i}. ${si.name || si.vault} (포트 ${si.port})`);
        }
        alert(`설정 코드 적용 완료 — 슬롯 ${slot}에 저장했습니다.\n\n현재 등록된 볼트:\n${lines.join("\n")}\n\n확인을 누르면 페이지를 새로고침합니다.`);
        gmc.save(); // save 이벤트에서 location.reload()
    }

    // Local REST API 연결 확인: "ok" | "auth"(키 오류) | "down"
    function restCheck(cfg) {
        return new Promise((resolve) => {
            const base = lrBase(cfg.lrPort);
            if (!base) { resolve("down"); return; }
            GM.xmlHttpRequest({
                method: "GET",
                url: base + "/",
                headers: { "Authorization": "Bearer " + cfg.lrKey },
                timeout: S.requestTimeout,
                onload: (r) => {
                    if (r.status === 401 || r.status === 403) { resolve("auth"); return; }
                    if (r.status < 200 || r.status >= 300) { resolve("down"); return; }
                    try { resolve(JSON.parse(r.response).authenticated === false ? "auth" : "ok"); }
                    catch (e) { resolve("ok"); }
                },
                onerror: () => resolve("down"),
                ontimeout: () => resolve("down"),
            });
        });
    }

    // 시맨틱 버전 비교: latest가 cur보다 새 버전인지
    function isNewer(latest, cur) {
        const a = String(latest).split(".").map(Number), b = String(cur).split(".").map(Number);
        for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d > 0; }
        return false;
    }

    // GitHub 배포본의 @version을 읽어온다 (진단 실행 시에만 호출 — 페이지 로드마다 아님). 실패 시 null.
    function checkLatestVersion() {
        return new Promise((resolve) => {
            GM.xmlHttpRequest({
                method: "GET",
                url: UPDATE_URL,
                timeout: S.requestTimeout,
                onload: (r) => {
                    const m = String(r.responseText || r.response || "").match(/@version\s+([\d.]+)/);
                    resolve(m ? m[1] : null);
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null),
            });
        });
    }

    // 🩺 연결 진단: 볼트별 Omnisearch / Local REST 상태를 한국어 체크리스트로 표시
    function runDiagnostics() {
        const ports = parsePorts();
        const list = $(`#${ID} .om-list`);
        if (!ports.length) {
            list.html(`<div class="om-error">설정된 볼트가 없습니다.<br />⚡ 버튼으로 설정 코드를 붙여넣거나 ⋯ 설정에서 포트를 입력하세요.</div>`);
            return;
        }
        list.html(`<span class="om-loading">연결 진단 중…</span>`);
        Promise.all(ports.map((cfg) => Promise.all([
            // 결과가 나올 법한 쿼리로 프로브 → 응답의 vault 필드로 "다른 볼트가 포트 점유" 판별
            fetchPort(cfg.port, baseQuery() || cfg.dvault || "성경"),
            (S.useLocalRest && cfg.lrPort && cfg.lrKey) ? restCheck(cfg) : Promise.resolve(null),
        ]))).then((results) => {
            const rows = results.map(([omni, rest], i) => {
                const cfg = ports[i];
                const name = escapeHtml(cfg.label || "볼트 " + (i + 1));
                const omniOk = omni !== null;
                // 응답에 결과가 있으면 그 vault와 슬롯의 볼트명(dvault)을 비교 — 결과 0건이면 판별 불가(현행 ✅ 유지)
                const actual = Array.isArray(omni) && omni[0] ? String(omni[0].vault || "") : "";
                const mismatch = omniOk && actual && cfg.dvault && actual !== cfg.dvault;
                let omniLine;
                if (!omniOk) {
                    omniLine = `❌ Omnisearch 연결 안 됨 (포트 ${escapeHtml(cfg.port)})<br /><span class="om-diag-fix">→ 옵시디언이 켜져 있는지 확인 후, A4P Helper 플러그인에서 [자동 설정]을 누르세요.</span>`;
                } else if (mismatch) {
                    omniLine = `⚠️ 포트 ${escapeHtml(cfg.port)}는 응답하지만 다른 볼트("${escapeHtml(actual)}")가 사용 중입니다<br /><span class="om-diag-fix">→ "${escapeHtml(cfg.dvault)}" 볼트에서 A4P Helper의 설정 코드를 다시 복사해 ⚡에 붙여넣으세요. (Omnisearch HTTP 포트는 볼트마다 달라야 합니다)</span>`;
                } else {
                    omniLine = `✅ Omnisearch 연결됨 (포트 ${escapeHtml(cfg.port)})`;
                }
                let restLine = "";
                if (rest === null) restLine = `➖ Local REST API 미사용 (본문 미리보기·신학 칩 없이 동작)`;
                else if (rest === "ok") restLine = `✅ Local REST API 연결됨 (본문 미리보기·신학 칩 사용 가능)`;
                else if (rest === "auth") restLine = `⚠️ Local REST API 키가 맞지 않습니다<br /><span class="om-diag-fix">→ A4P Helper에서 설정 코드를 다시 복사해 ⚡ 버튼에 붙여넣으세요. (다른 볼트가 이 포트를 쓰고 있을 수 있습니다)</span>`;
                else restLine = `❌ Local REST API 연결 안 됨 (포트 ${escapeHtml(cfg.lrPort)})<br /><span class="om-diag-fix">→ A4P Helper 플러그인에서 [자동 설정]을 누르세요.</span>`;
                return `<div class="om-diag-vault"><b>${name}</b><br />${omniLine}<br />${restLine}</div>`;
            }).join("");
            // 등록 볼트 요약 — "연결은 되는데 0건"일 때 원하는 볼트가 등록 안 된 것을 바로 알 수 있게
            const summary = `<div class="om-diag-vault"><b>등록된 볼트 ${ports.length}개</b><br />` +
                ports.map((cfg, i) => `${i + 1}. ${escapeHtml(cfg.label || cfg.dvault || "(이름 없음)")} — 포트 ${escapeHtml(cfg.port)}`).join("<br />") +
                `<br /><span class="om-diag-fix">찾는 노트가 다른 볼트에 있다면, 그 볼트의 A4P Helper에서 설정 코드를 복사해 ⚡에 붙여넣으세요 (기존 볼트에 추가 등록됩니다).</span></div>`;
            list.html(`<div class="om-diag">${summary}${rows}<div class="om-diag-foot">현재 버전 v${VERSION} <span class="om-diag-ver"></span><br />진단을 닫으려면 ⟳ 새로고침을 누르세요.</div></div>`);
            setCount(null);
            checkLatestVersion().then((latest) => {
                if (!latest) return; // 확인 실패 — 아무것도 표시 안 함
                const el = list.find(".om-diag-ver");
                if (!el.length) return;
                el.html(isNewer(latest, VERSION)
                    ? `· ⬆️ 새 버전 v${escapeHtml(latest)} — Tampermonkey 대시보드에서 [업데이트 확인]을 누르세요`
                    : `· ✅ 최신 버전입니다`);
            });
        });
    }

    // ---------- styles ----------
    // A2 "잉크 · 에디토리얼" 디자인: 그림자·색 상자를 걷어내고 헤어라인과 타이포그래피 위계로 구성.
    // 색은 전부 토큰(--변수)으로만 참조 → 라이트/다크는 토큰 블록 교체만으로 전환된다.
    // 다크 적용 경로 3가지: OS 자동(prefers-color-scheme) / 수동 강제(.om-dark) / 수동 라이트(.om-light).
    const LIGHT_TOKENS = `
        --accent:#134538; --accent-rgb:19,69,56; --on-accent:#FBFAF7;
        --text:#1C1B18; --muted:#6E6B61; --faint:#A5A196;
        --line:#E8E5DC; --chipline:#DDDAD0; --wash:#F2F1EC;
        --card:#FFFFFF; --card-hover:#FAF9F5; --panel:#FBFAF7;
        --sel:rgba(var(--accent-rgb),0.07);
    `;
    const DARK_TOKENS = `
        --accent:#6FB394; --accent-rgb:111,179,148; --on-accent:#111814;
        --text:#E6E4DE; --muted:#A9A69C; --faint:#7E7B72;
        --line:#3B3E42; --chipline:#45484D; --wash:rgba(255,255,255,0.055);
        --card:#2A2D31; --card-hover:#33373C; --panel:#222528;
        --sel:rgba(var(--accent-rgb),0.13);
    `;
    // 테마 프리셋: [라이트 accent, 라이트 rgb, 다크 accent, 다크 rgb]. A4P(브랜드 그린)가 기본.
    const THEMES = {
        a4p:      ["#134538", "19,69,56",   "#6FB394", "111,179,148"],
        obsidian: ["#1B0CAB", "27,12,171",  "#B79BFF", "183,155,255"],
        mono:     ["#3C4043", "60,64,67",   "#CFD3D7", "207,211,215"],
        ocean:    ["#0369A1", "3,105,161",  "#38BDF8", "56,189,248"],
        forest:   ["#15803D", "21,128,61",  "#4ADE80", "74,222,128"],
        sunset:   ["#C2410C", "194,65,12",  "#FB923C", "251,146,60"],
        rose:     ["#BE123C", "190,18,60",  "#FB7185", "251,113,133"],
        grape:    ["#7C3AED", "124,58,237", "#C084FC", "192,132,252"],
        slate:    ["#475569", "71,85,105",  "#94A3B8", "148,163,184"],
    };
    const themeCssLight = Object.entries(THEMES).map(([k, t]) =>
        `#${ID}.theme-${k} { --accent:${t[0]}; --accent-rgb:${t[1]}; }`).join("\n");
    const themeCssDark = (sel) => Object.entries(THEMES).map(([k, t]) =>
        `${sel}.theme-${k} { --accent:${t[2]}; --accent-rgb:${t[3]}; }`).join("\n");

    const injectStyles = () => {
        const style = document.createElement("style");
        style.textContent = `
            #${ID} {
                ${LIGHT_TOKENS}
                --fs: ${S.fontScale / 100}; /* 글자 크기 배율 — 모든 font-size가 calc(Xpx * var(--fs)) */
                margin:20px 0; width:100%; min-width:360px; box-sizing:border-box;
                font-family:"SUIT","SUIT Variable","Pretendard","Apple SD Gothic Neo","Malgun Gothic",Roboto,Arial,sans-serif;
                color:var(--text);
                /* 종이 패널 서피스 — 어느 페이지 배경 위에서도 위젯이 자기 지면을 갖는다 */
                background:var(--panel); border:1px solid var(--line); border-radius:14px;
                padding:14px 16px 10px;
            }
            ${themeCssLight}
            @media (prefers-color-scheme: dark) {
                #${ID}:not(.om-light) { ${DARK_TOKENS} }
                ${themeCssDark(`#${ID}:not(.om-light)`)}
            }
            #${ID}.om-dark { ${DARK_TOKENS} }
            ${themeCssDark(`#${ID}.om-dark`)}

            /* 헤더 — 상자 없이 헤어라인 아래 브랜드 행 (한 줄 고정) */
            #${ID} .om-header {
                display:flex; align-items:center; gap:7px;
                padding:4px 2px 11px; border-bottom:1px solid var(--line);
            }
            #${ID} .om-h-title {
                display:flex; align-items:center; gap:6px; font-size:calc(14px * var(--fs, 1)); font-weight:800;
                letter-spacing:-0.01em; color:var(--text);
                white-space:nowrap; flex-shrink:0; /* 제목은 절대 줄바꿈하지 않는다 */
            }
            #${ID} .om-header svg { width:17px; height:17px; }
            #${ID} .om-h-title svg .purple { fill:var(--accent); }
            #${ID} .om-count {
                font-size:calc(10.5px * var(--fs, 1)); font-weight:700; color:var(--accent); flex-shrink:0;
                background:rgba(var(--accent-rgb),0.10); padding:2px 8px; border-radius:999px;
                font-variant-numeric:tabular-nums; white-space:nowrap; cursor:default;
            }
            #${ID} .om-h-actions { margin-left:auto; display:flex; align-items:center; gap:1px; }
            #${ID} .om-icon-btn {
                background:transparent; border:none; cursor:pointer; color:var(--muted);
                opacity:0.85; padding:4px; border-radius:7px; line-height:0;
                display:inline-flex; align-items:center; justify-content:center;
                transition:opacity .15s, background .15s, color .15s;
            }
            #${ID} .om-icon-btn svg { width:15px; height:15px; display:block; }
            #${ID} .om-icon-btn:hover { opacity:1; color:var(--text); background:var(--wash); }
            #${ID} .om-icon-btn.active { opacity:1; color:var(--accent); background:rgba(var(--accent-rgb),0.10); }
            #${ID} .om-setup-code { color:var(--accent); }  /* 온보딩 핵심 버튼은 브랜드색으로 강조 */
            #${ID} .om-collapse svg { transition:transform .15s ease; }
            #${ID}.collapsed .om-collapse svg { transform:rotate(-90deg); }

            /* 즉시 뜨는 자체 툴팁 — 브라우저 기본 title보다 빠르고 잘 보인다 */
            #${ID} [data-tip] { position:relative; }
            #${ID} [data-tip]::after {
                content:attr(data-tip); position:absolute; top:calc(100% + 7px); right:0;
                background:var(--text); color:var(--panel);
                font-size:calc(11px * var(--fs, 1)); font-weight:600; line-height:1.4; padding:4px 9px; border-radius:6px;
                white-space:nowrap; pointer-events:none; opacity:0; transform:translateY(-2px);
                transition:opacity .12s ease .2s, transform .12s ease .2s; z-index:10;
            }
            #${ID} [data-tip]:hover::after { opacity:1; transform:translateY(0); }

            /* 본문 — 상자 없이 페이지에 그대로 조판 */
            #${ID} .om-body { padding:2px 0 0; }
            #${ID}.collapsed .om-body { display:none; }

            /* 컨트롤 */
            #${ID} .om-controls { display:none; flex-direction:column; gap:8px; padding:10px 2px 4px; }
            #${ID} .om-controls.open { display:flex; }
            #${ID} .om-refine {
                width:100%; box-sizing:border-box; border:1px solid var(--chipline);
                background:var(--card); color:var(--text); border-radius:8px;
                padding:7px 10px; font-size:calc(13px * var(--fs, 1)); outline:none;
            }
            #${ID} .om-refine::placeholder { color:var(--faint); }
            #${ID} .om-refine:focus { border-color:var(--accent); }
            #${ID} .om-ctl-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
            #${ID} .om-seg { display:inline-flex; border:1px solid var(--chipline); border-radius:8px; overflow:hidden; }
            #${ID} .om-seg button {
                background:var(--card); color:var(--muted); border:none; cursor:pointer;
                padding:5px 9px; font-size:calc(12px * var(--fs, 1)); line-height:1;
            }
            #${ID} .om-seg button.active { background:var(--accent); color:var(--on-accent); }
            #${ID} .om-slider { display:flex; align-items:center; gap:6px; font-size:calc(11px * var(--fs, 1)); color:var(--muted); }
            #${ID} .om-slider input[type=range] { width:96px; accent-color:var(--accent); }

            /* 결과 목록 — 헤어라인으로 나뉜 에디토리얼 행 (기본 스킨 = Editorial) */
            #${ID} .om-list { display:flex; flex-direction:column; gap:0; }
            #${ID} .om-result {
                position:relative; padding:13px 2px;
                border-bottom:1px solid var(--line);
                transition:background .15s ease;
            }
            #${ID} .om-result:last-child { border-bottom:none; }
            #${ID} .om-result:hover { background:color-mix(in srgb, var(--vc, var(--accent)) 5%, transparent); }
            #${ID} .om-result.selected { background:var(--sel); box-shadow:inset 2px 0 0 var(--cardc); }

            /* ---- 카드형 스킨 (Clean/Tinted/Solid — 상자형 대안. Flat은 Editorial과 동일) ---- */
            #${ID}.skin-clean .om-list, #${ID}.skin-tinted .om-list, #${ID}.skin-solid .om-list { gap:8px; padding-top:2px; }
            #${ID}.skin-clean .om-result, #${ID}.skin-tinted .om-result, #${ID}.skin-solid .om-result {
                border:1px solid var(--line); border-radius:10px; padding:12px 14px; background:var(--card);
            }
            #${ID}.skin-clean .om-result { border-left:3px solid var(--vc, var(--line)); }
            #${ID}.skin-tinted .om-result {
                background:color-mix(in srgb, var(--card) 88%, var(--vc, var(--card)) 12%);
                border-left:3px solid var(--vc, var(--line));
            }
            #${ID}.skin-clean .om-result:hover, #${ID}.skin-tinted .om-result:hover, #${ID}.skin-solid .om-result:hover { background:var(--card-hover); }
            #${ID}.skin-clean .om-result.selected, #${ID}.skin-tinted .om-result.selected, #${ID}.skin-solid .om-result.selected { border-color:var(--cardc); box-shadow:none; }

            #${ID} .om-link { text-decoration:none; color:inherit; display:block; }

            /* --cardc = 이 카드의 포인트색 (볼트색 > 제목색 > accent) */
            #${ID} .om-result { --cardc: var(--vc, var(--title, var(--accent))); }
            #${ID} .om-title {
                display:flex; align-items:center; gap:8px; min-width:0; color:var(--cardc);
                font-size:calc(14px * var(--fs, 1)); font-weight:700; line-height:1.45; margin:0 0 4px;
            }
            #${ID}.vscope-accent .om-title { color:var(--title, var(--text)); }
            #${ID} .om-title-text { min-width:0; flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            #${ID} .om-title::before {
                content:""; flex:0 0 auto; width:6px; height:6px; border-radius:50%;
                background:var(--cardc); opacity:0.9;
            }
            #${ID} .om-link:hover .om-title-text { text-decoration:underline; text-underline-offset:3px; }
            #${ID} .om-badge {
                flex:0 0 auto; font-size:calc(9.5px * var(--fs, 1)); font-weight:800; letter-spacing:.05em; text-transform:uppercase;
                color:var(--cardc); border:1px solid color-mix(in srgb, var(--cardc) 45%, transparent);
                padding:1px 6px; border-radius:4px; max-width:45%;
                overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
            }

            /* 관련도 — 가는 헤어라인 게이지 (제목 밑줄로 보이지 않게 간격 확보) */
            #${ID} .om-score { display:flex; align-items:center; gap:6px; margin:4px 0 8px; }
            #${ID} .om-bar { flex:1; height:2px; background:color-mix(in srgb, var(--cardc) 15%, transparent); overflow:hidden; }
            #${ID} .om-bar > i { display:block; height:100%; background:var(--cardc); }
            #${ID} .om-pct { font-size:calc(10px * var(--fs, 1)); color:var(--faint); min-width:30px; text-align:right; font-variant-numeric:tabular-nums; }

            /* 발췌 — 하이라이트는 형광펜 대신 포인트색 볼드 */
            #${ID} .om-excerpt {
                color:var(--muted); font-size:calc(12.5px * var(--fs, 1)); line-height:1.65; margin-bottom:7px;
                display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; cursor:text;
            }
            #${ID} .om-excerpt.expanded { -webkit-line-clamp:unset; display:block; }
            #${ID} .om-excerpt mark { background:none; color:var(--cardc); font-weight:700; padding:0; }
            #${ID}.vscope-accent .om-excerpt mark { color:var(--text); }

            #${ID} .om-path { color:var(--faint); font-size:calc(11px * var(--fs, 1)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            #${ID} .om-path .om-sep { opacity:0.5; padding:0 2px; }

            #${ID} .om-terms { display:flex; flex-wrap:wrap; gap:4px; margin:0 0 6px; }
            #${ID} .om-term {
                font-size:calc(10px * var(--fs, 1)); color:var(--cardc); border:1px solid color-mix(in srgb, var(--cardc) 40%, transparent);
                padding:0 6px; border-radius:4px; line-height:1.6;
            }
            #${ID} .om-tags { display:flex; flex-wrap:wrap; gap:4px; margin:0 0 6px; }
            #${ID} .om-tag {
                font-size:calc(10px * var(--fs, 1)); color:var(--cardc); background:color-mix(in srgb, var(--cardc) 11%, transparent);
                padding:1px 7px; border-radius:999px;
            }
            #${ID} .om-tag::before { content:"#"; opacity:0.5; }

            /* 상태 */
            #${ID} .om-loading { display:block; text-align:center; color:var(--muted); padding:22px 12px; font-size:calc(13px * var(--fs, 1)); }
            #${ID} .om-error { color:#C0392B; padding:16px 4px; font-size:calc(13px * var(--fs, 1)); line-height:1.6; }
            #${ID} .om-error a { color:var(--accent); text-decoration:none; border-bottom:1px solid rgba(var(--accent-rgb),0.4); }

            /* A4P: 목회 카테고리 칩 */
            #${ID} .om-cats { display:flex; flex-wrap:wrap; gap:5px; padding:12px 2px 10px; }
            #${ID} .om-cats button {
                background:transparent; color:var(--muted); cursor:pointer;
                border:1px solid var(--chipline); border-radius:999px;
                padding:4px 11px; font-size:calc(12px * var(--fs, 1)); line-height:1; transition:background .15s, color .15s, border-color .15s;
            }
            #${ID} .om-cats button:hover { border-color:var(--accent); color:var(--text); }
            #${ID} .om-cats button.active { background:var(--accent); border-color:var(--accent); color:var(--on-accent); font-weight:600; }
            #${ID} .om-cat-n { margin-left:4px; font-size:calc(10px * var(--fs, 1)); opacity:.6; font-variant-numeric:tabular-nums; }
            #${ID} .om-cat-n:empty { display:none; }
            #${ID} .om-cats button.om-cat-zero { opacity:.45; }

            /* A4P: 성경구절 고정 카드 — 좌측 잉크 룰 인용 블록 */
            #${ID} .om-bible { display:none; }
            #${ID} .om-bible-card {
                margin:12px 0 0; padding:11px 14px;
                border-left:3px solid var(--accent);
                background:var(--wash); border-radius:0 8px 8px 0;
            }
            #${ID} .om-bible-title { font-size:calc(14px * var(--fs, 1)); font-weight:800; color:var(--text); margin-bottom:8px; }
            #${ID} .om-bible-actions { display:flex; flex-wrap:wrap; gap:5px; }
            #${ID} .om-bible-actions button {
                background:var(--card); color:var(--accent); cursor:pointer;
                border:1px solid rgba(var(--accent-rgb),0.30); border-radius:6px;
                padding:4px 9px; font-size:calc(12px * var(--fs, 1)); font-weight:600; line-height:1.4;
            }
            #${ID} .om-bible-actions button:hover { background:var(--accent); border-color:var(--accent); color:var(--on-accent); }

            /* A4P: doctrine(신학 태그)·성경구절 칩 */
            #${ID} .om-doctrine, #${ID} .om-verses { display:flex; flex-wrap:wrap; gap:4px; margin:0 0 6px; }
            #${ID} .om-doc {
                font-size:calc(10px * var(--fs, 1)); color:var(--cardc); border:1px dashed color-mix(in srgb, var(--cardc) 45%, transparent);
                padding:1px 7px; border-radius:999px;
                background:transparent; cursor:pointer; line-height:1.5;
            }
            #${ID} .om-doc:hover { background:var(--cardc); border-style:solid; color:var(--on-accent); }
            #${ID} .om-verse {
                font-size:calc(10px * var(--fs, 1)); color:var(--cardc); cursor:pointer; background:transparent;
                border:1px dashed color-mix(in srgb, var(--cardc) 50%, transparent);
                padding:2px 8px; border-radius:999px; line-height:1.5;
            }
            #${ID} .om-verse::before { content:"📖 "; }
            #${ID} .om-verse:hover { background:var(--cardc); border-style:solid; color:var(--on-accent); }

            /* A4P: 진단 패널 */
            #${ID} .om-diag { padding:8px 0; font-size:calc(12.5px * var(--fs, 1)); color:var(--text); }
            #${ID} .om-diag-vault {
                background:var(--wash); border-radius:8px; padding:10px 12px; margin-bottom:8px; line-height:1.8;
            }
            #${ID} .om-diag-fix { color:var(--muted); font-size:calc(11.5px * var(--fs, 1)); }
            #${ID} .om-filter-hint { color:var(--muted); font-size:calc(11.5px * var(--fs, 1)); padding:6px 2px; border-bottom:1px solid var(--line); }
            #${ID} .om-filter-hint a { color:var(--accent); font-weight:600; text-decoration:none; }
            #${ID} .om-filter-hint a:hover { text-decoration:underline; }

            /* v1.6.0: 설교 파일명 날짜·부서 배지 + 더 보기 버튼 */
            #${ID} .om-sermon-badge {
                flex:0 0 auto; font-size:calc(9.5px * var(--fs, 1)); font-weight:700; color:var(--muted);
                background:var(--wash); border:1px solid var(--line);
                padding:1px 6px; border-radius:4px; white-space:nowrap;
                font-variant-numeric:tabular-nums;
            }
            #${ID} .om-more {
                display:block; width:100%; margin:10px 0 2px; padding:7px 0;
                background:transparent; border:1px dashed var(--chipline); border-radius:8px;
                color:var(--muted); font-size:calc(12px * var(--fs, 1)); cursor:pointer;
                transition:border-color .15s, color .15s;
            }
            #${ID} .om-more:hover { border-color:var(--accent); color:var(--accent); }
            #${ID} .om-diag-foot { text-align:center; color:var(--faint); font-size:calc(11px * var(--fs, 1)); padding-top:4px; }

            /* 플로팅 패널 (네이버 폴백 · 유튜브 · Bing 폴백) — 위젯이 종이 패널 위에 얹힘 */
            #a4p-float {
                position:fixed; top:70px; right:16px; width:392px; max-height:calc(100vh - 90px);
                overflow-y:auto; z-index:9999;
            }
            #a4p-float #${ID} {
                margin:0; min-width:0;
                box-shadow:0 12px 32px rgba(0,0,0,0.16);
            }

            /* Toast */
            #om-toast {
                position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(12px);
                background:#1C1B18; color:#FBFAF7; padding:8px 14px; border-radius:8px; font-size:calc(13px * var(--fs, 1));
                font-family:"SUIT","Pretendard","Apple SD Gothic Neo",Roboto,Arial,sans-serif; box-shadow:0 4px 16px rgba(0,0,0,0.3);
                opacity:0; pointer-events:none; transition:opacity .2s, transform .2s; z-index:99999;
                max-width:60vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
            }
            #om-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }

            @media (max-width:1200px) { #${ID} .om-header { padding-bottom:9px; } }
        `;
        document.head.appendChild(style);
    };

    // ---------- config ----------
    // @ts-ignore
    const CONFIG_CSS = `
        body { font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 0 0 64px; color:#1b1b1b; }
        #ObsidianOmnisearchGoogle_header { font-size: 17px; padding: 14px 14px 10px; position: sticky; top: 0; background:#fff; z-index: 2; border-bottom:1px solid #eee; }
        .section_header_holder { margin: 14px 10px 2px; }
        .section_header {
            background: #eef3f1; color: #134538; border: 1px solid #d4e2dc;
            font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
            text-align: left; padding: 4px 9px; border-radius: 6px;
        }
        .section_desc { font-size: 11px; color:#888; text-align:left; padding: 3px 4px 0; }
        .config_var { margin: 5px 10px; }
        .field_label { font-weight: 600; cursor: help; }
        input[type=text], input[type=number], select { padding: 3px 6px; border:1px solid #ccc; border-radius: 5px; }
        #ObsidianOmnisearchGoogle_buttons_holder {
            position: fixed; left: 0; right: 0; bottom: 0; background: #fff;
            border-top: 1px solid #ddd; box-shadow: 0 -2px 10px rgba(0,0,0,.12);
            padding: 9px 14px; text-align: right; z-index: 3;
        }
        #ObsidianOmnisearchGoogle_buttons_holder button { font-size: 13px; padding: 5px 16px; margin-left: 8px; cursor: pointer; }
        #ObsidianOmnisearchGoogle_resetLink { margin-right: auto; font-size: 12px; }
    `;

    const gmc = new GM_config({
        id: "ObsidianOmnisearchGoogle",
        title: "Omnisearch in Google — Configuration",
        css: CONFIG_CSS,
        fields: {
            // ----- Vault slots (leave Port blank to disable a slot). No paths hardcoded — fill your own. -----
            v1_port:  { section: ["내 볼트 (기본)", "옵시디언 A4P Helper 플러그인의 설정 코드를 위젯의 ⚡ 버튼에 붙여넣으면 이 칸들이 자동으로 채워집니다."], label: "Port", type: "text", default: "51361", title: "이 볼트의 Omnisearch HTTP 포트. 비우면 슬롯 비활성." },
            v1_name:  { label: "Display name (badge)", type: "text", default: "Main", title: "결과 카드 배지에 표시할 볼트 이름 (예: Main, Wiki)." },
            v1_vault: { label: "Obsidian vault name for deeplink (blank = auto-detect)", type: "text", default: "", title: "deeplink에 쓸 Obsidian 등록 볼트명. 비우면 Omnisearch가 준 값 사용." },
            v1_color: { label: "Color hex (blank = auto)", type: "text", default: "#E39AAB", title: "이 볼트의 배지/카드 색 (#RRGGBB). 비우면 이름 해시로 자동." },
            v1_root:  { label: "Filesystem root for 'copy abs path' (blank = off)", type: "text", default: "", title: "abs 경로 복사용 절대경로 루트. 보통은 아래 '공통 부모 폴더' 하나면 충분." },
            v1_lrPort: { label: "Local REST API port (blank = off)", type: "text", default: "", title: "이 볼트 Local REST API(HTTP) 포트. body+태그 정확 표시용. General의 'Use Local REST API' 켜야 동작." },
            v1_lrKey:  { label: "Local REST API key", type: "text", default: "", title: "이 볼트 Local REST API 키(Bearer). 플러그인 설정에서 복사." },

            v2_port:  { section: ["(고급) 추가 볼트 2", "볼트가 하나뿐이면 비워 두세요."], label: "Port", type: "text", default: "" },
            v2_name:  { label: "Display name (badge)", type: "text", default: "" },
            v2_vault: { label: "Obsidian vault name for deeplink (blank = auto-detect)", type: "text", default: "" },
            v2_color: { label: "Color hex (blank = auto)", type: "text", default: "#86C2A6" },
            v2_root:  { label: "Filesystem root for 'copy abs path' (blank = off)", type: "text", default: "" },
            v2_lrPort: { label: "Local REST API port (blank = off)", type: "text", default: "" },
            v2_lrKey:  { label: "Local REST API key", type: "text", default: "" },

            v3_port:  { section: ["(고급) 추가 볼트 3"], label: "Port", type: "text", default: "" },
            v3_name:  { label: "Display name (badge)", type: "text", default: "" },
            v3_vault: { label: "Obsidian vault name for deeplink (blank = auto-detect)", type: "text", default: "" },
            v3_color: { label: "Color hex (blank = auto)", type: "text", default: "" },
            v3_root:  { label: "Filesystem root for 'copy abs path' (blank = off)", type: "text", default: "" },
            v3_lrPort: { label: "Local REST API port (blank = off)", type: "text", default: "" },
            v3_lrKey:  { label: "Local REST API key", type: "text", default: "" },

            v4_port:  { section: ["(고급) 추가 볼트 4"], label: "Port", type: "text", default: "" },
            v4_name:  { label: "Display name (badge)", type: "text", default: "" },
            v4_vault: { label: "Obsidian vault name for deeplink (blank = auto-detect)", type: "text", default: "" },
            v4_color: { label: "Color hex (blank = auto)", type: "text", default: "" },
            v4_root:  { label: "Filesystem root for 'copy abs path' (blank = off)", type: "text", default: "" },
            v4_lrPort: { label: "Local REST API port (blank = off)", type: "text", default: "" },
            v4_lrKey:  { label: "Local REST API key", type: "text", default: "" },

            v5_port:  { section: ["(고급) 추가 볼트 5"], label: "Port", type: "text", default: "" },
            v5_name:  { label: "Display name (badge)", type: "text", default: "" },
            v5_vault: { label: "Obsidian vault name for deeplink (blank = auto-detect)", type: "text", default: "" },
            v5_color: { label: "Color hex (blank = auto)", type: "text", default: "" },
            v5_root:  { label: "Filesystem root for 'copy abs path' (blank = off)", type: "text", default: "" },
            v5_lrPort: { label: "Local REST API port (blank = off)", type: "text", default: "" },
            v5_lrKey:  { label: "Local REST API key", type: "text", default: "" },

            v6_port:  { section: ["(고급) 추가 볼트 6"], label: "Port", type: "text", default: "" },
            v6_name:  { label: "Display name (badge)", type: "text", default: "" },
            v6_vault: { label: "Obsidian vault name for deeplink (blank = auto-detect)", type: "text", default: "" },
            v6_color: { label: "Color hex (blank = auto)", type: "text", default: "" },
            v6_root:  { label: "Filesystem root for 'copy abs path' (blank = off)", type: "text", default: "" },
            v6_lrPort: { label: "Local REST API port (blank = off)", type: "text", default: "" },
            v6_lrKey:  { label: "Local REST API key", type: "text", default: "" },

            // ----- A4P 목회 기능 -----
            bibleEnabled:    { section: ["A4P 목회 기능", "성경구절 인식과 카테고리 필터. 카테고리 키워드는 내 볼트의 폴더 이름에 맞게 수정하세요 (콤마로 여러 개)."], label: "성경구절 인식 사용", type: "checkbox", default: true, title: "검색어에서 성경구절(요3:16, 요한복음 3장 16절, 시편 23편…)을 인식해 구절 카드 표시 + 구절 노트명으로 보조 검색." },
            bibleNoteFormat: { label: "구절 노트 이름 형식", type: "text", default: "{약어}{장}_{절}", title: "볼트의 성경구절 노트 파일명 형식. 기본 {약어}{장}_{절} → 요3_16." },
            showDoctrine:    { label: "신학 주제(doctrine) 칩 표시", type: "checkbox", default: true, title: "frontmatter의 doctrine(🔖 신학 태그)을 카드에 칩으로 표시. Local REST API 필요." },
            showVerseChips:  { label: "성경구절 칩 표시", type: "checkbox", default: true, title: "frontmatter의 성경구절 배열을 카드에 칩으로 표시 — 클릭하면 구절 노트가 열림. Local REST API 필요." },
            catSermon: { label: "카테고리 키워드 — 설교", type: "text", default: "300. Sermons,설교", title: "노트 경로에 이 키워드가 포함되면 '설교' 카테고리로 분류 (콤마로 여러 개)." },
            catFrag:   { label: "카테고리 키워드 — 조각", type: "text", default: "설교조각,강의조각,변증 조각,옵시디언 조각", title: "설교·강의에서 추출한 조각 메모 폴더 키워드." },
            catDevo:   { label: "카테고리 키워드 — 묵상", type: "text", default: "묵상,큐티,QT", title: "묵상·큐티 노트 폴더 키워드." },
            catBible:  { label: "카테고리 키워드 — 성경", type: "text", default: "성경", title: "성경구절 노트 폴더 키워드." },
            catRef:    { label: "카테고리 키워드 — 자료", type: "text", default: "700. Reference,800. Readwise,자료", title: "여러 통로로 모은 일반 자료·Readwise 하이라이트 폴더 키워드." },
            catComm:   { label: "제외 키워드 — 주석", type: "text", default: "주석,강해", title: "폴더 경로에 이 키워드가 포함된 노트는 검색 결과에서 제외 (아래 '주석 노트 숨기기'가 켜져 있을 때)." },
            hideComm:  { label: "주석 노트 숨기기", type: "checkbox", default: true, title: "장 단위 통합주석처럼 절 링크가 많은 주석 노트가 결과를 도배하지 않도록 기본 제외. 끄면 주석 노트도 결과에 표시." },
            diversify: { label: "성경구절 검색 시 카테고리 골고루 표시", type: "checkbox", default: true, title: "구절 검색 결과를 설교→조각→묵상→자료 순으로 교차 배치해 한 종류가 상위를 독점하지 않게 함." },

            nbResults: { section: ["General settings", "공통 설정. 라벨에 마우스를 올리면 한국어 설명이 나옵니다."], label: "Results to display", type: "int", default: 10, title: "필터·정렬 후 보여줄 결과 개수." },
            fontScale: { label: "Font size (%)", type: "int", default: 110, title: "위젯 글자 크기 배율(%). 100=원래 크기, 110=10% 크게(기본). 범위 80~150." },
            excerptLines: { label: "Excerpt lines (click to expand)", type: "int", default: 3, title: "본문 미리보기 줄 수. 카드의 미리보기를 클릭하면 펼쳐짐." },
            showScore: { label: "Show relevance bar", type: "checkbox", default: true, title: "관련도(BM25) 막대와 % 표시." },
            showPath: { label: "Show path breadcrumb", type: "checkbox", default: true, title: "노트 경로를 브레드크럼으로 표시." },
            showVaultBadge: { label: "Vault badge", type: "select", options: ["auto", "always", "never"], default: "auto", title: "볼트 배지 표시: auto=2개 이상일 때 / always / never." },
            showTags: { label: "Show tags in footer", type: "checkbox", default: true, title: "카드 하단에 노트 태그 칩 표시(미리보기에서 best-effort 추출)." },
            maxTags: { label: "Max tags per card", type: "int", default: 5, title: "카드당 표시할 태그 최대 개수." },
            showMatchedTerms: { label: "Show matched query terms (noisy — usually off)", type: "checkbox", default: false, title: "매칭된 검색어 조각 표시. 한국어 조사 변형(rag를/rag가)이 섞여 지저분 — 보통 끔. 태그를 원하면 위의 'Show tags'를 쓰세요." },
            cleanFrontmatter: { label: "Strip frontmatter from preview", type: "checkbox", default: true, title: "미리보기에서 YAML(태그·작성자·날짜·wikilink 등) 제거하고 본문 위주로." },
            exactMatch: { label: "Exact match (wrap query in quotes)", type: "checkbox", default: false, title: "검색어를 따옴표로 묶어 정확 매칭." },
            excludeFolders: { label: "Exclude paths containing (comma-separated)", type: "text", default: "", title: "경로에 이 문자열이 포함된 결과 제외(콤마로 여러 개)." },
            theme: { label: "Accent theme", type: "select", options: ["A4P", "Ocean", "Obsidian", "Mono", "Forest", "Sunset", "Rose", "Grape", "Slate"], default: "A4P", title: "포인트 색 테마. A4P=브랜드 딥그린(기본), Ocean=블루, Obsidian=퍼플, Mono=중립, Forest=그린, Sunset=오렌지, Rose=레드핑크, Grape=보라, Slate=청회색. 라이트/다크 자동 + 헤더 ◐ 버튼으로 수동 전환." },
            skin: { label: "Card style", type: "select", options: ["Editorial", "Clean", "Tinted", "Solid"], default: "Editorial", title: "카드 스타일. Editorial=헤어라인 구분 에디토리얼(기본·추천), Clean=카드+볼트색 좌측보더, Tinted=볼트색 은은한 틴트, Solid=카드만." },
            vaultColorScope: { label: "Vault color scope", type: "select", options: ["Accent", "Full"], default: "Accent", title: "볼트색 적용 범위. Accent=포인트(닷·배지·보더·바·태그)만 색, 제목은 읽기 좋은 중립색(추천). Full=제목·하이라이트까지 볼트색(진하고 모노톤)." },
            titleColor: { label: "Note title color (hex, blank = neutral)", type: "text", default: "", title: "노트 제목 글자색(#RRGGBB). 비우면 읽기 좋은 중립 잉크색(추천). Accent 스코프=모든 제목에 적용, Full 스코프=볼트색 우선." },
            accentColor: { label: "Accent override (hex, blank = theme)", type: "text", default: "", title: "포인트 색 전체 덮어쓰기(#RRGGBB). 비우면 테마 사용." },
            position: { label: "Sidebar position", type: "select", options: ["Bottom", "Top"], default: "Bottom", title: "결과 위젯을 구글 사이드바 위/아래 어디에 둘지." },
            vaultsParentDir: { label: "Common parent folder of your vaults", type: "text", default: "", title: "볼트들의 공통 상위 폴더. 설정하면 abs 경로 = 부모/볼트명/상대경로 로 자동 조립." },
            useLocalRest: { label: "Use Local REST API for body + tags", type: "checkbox", default: false, title: "각 볼트의 Local REST API(HTTP)로 노트를 직접 읽어 frontmatter 제거한 본문 + 실제 태그 표시. 슬롯에 포트/키 입력 + 플러그인 설치 필요." },
            useAdvancedUri: { label: "Use Advanced URI for opening", type: "checkbox", default: false, title: "Advanced URI 플러그인으로 열기. 백그라운드 볼트의 노트도 안정적으로 열림(권장)." },
            focusOnOpen: { label: "Bring Obsidian to front on open", type: "checkbox", default: true, title: "노트를 열 때 옵시디언 창을 화면 앞으로 가져옵니다. 브라우저가 'Obsidian을 열까요?'라고 물으면 '항상 허용'을 선택하세요." },
            keyboardNav: { label: "Keyboard navigation (j/k/Enter/y)", type: "checkbox", default: true, title: "결과 위에서 j/k·↑↓ 이동, Enter 열기, y 위키링크 복사." },
            showControlsDefault: { label: "Open live controls by default", type: "checkbox", default: false, title: "검색 시 라이브 필터 패널을 기본으로 펼침." },
            requestTimeout: { label: "Per-port timeout (ms)", type: "int", default: 5000, title: "각 포트(볼트) 요청 대기 시간(ms). 초과 시 그 볼트는 건너뜀." },
        },
        events: {
            save: () => location.reload(),
            init: () => {},
            // GM_config's per-field `title` isn't reliably rendered as a hover tooltip,
            // so inject the Korean tooltips onto each field row when the panel opens.
            open: (doc) => {
                const slot = {
                    port: "이 볼트의 Omnisearch HTTP 포트. 비우면 슬롯 비활성.",
                    name: "결과 카드 배지에 표시할 볼트 이름 (예: Main, Wiki).",
                    vault: "deeplink에 쓸 Obsidian 등록 볼트명. 비우면 Omnisearch가 준 값 사용.",
                    color: "이 볼트의 배지/카드 색 (#RRGGBB). 비우면 이름 해시로 자동.",
                    root: "abs 경로 복사용 절대경로 루트. 보통은 General의 '공통 부모 폴더' 하나면 충분.",
                    lrPort: "이 볼트 Local REST API(HTTP) 포트. 본문+태그 정확 표시용. General의 'Use Local REST API' 켜야 동작.",
                    lrKey: "이 볼트 Local REST API 키(Bearer). 플러그인 설정에서 복사.",
                };
                const gen = {
                    nbResults: "필터·정렬 후 보여줄 결과 개수.",
                    fontScale: "위젯 글자 크기 배율(%). 100=원래, 110=10% 크게(기본). 범위 80~150.",
                    excerptLines: "본문 미리보기 줄 수. 미리보기를 클릭하면 펼쳐짐.",
                    showScore: "관련도(BM25) 막대와 % 표시.",
                    showPath: "노트 경로를 브레드크럼으로 표시.",
                    showVaultBadge: "볼트 배지: auto(2개 이상일 때) / always / never.",
                    showTags: "카드 하단에 노트 태그 칩 표시(미리보기에서 best-effort 추출).",
                    maxTags: "카드당 표시할 태그 최대 개수.",
                    showMatchedTerms: "매칭 검색어 조각 표시. 조사 변형(rag를/rag**)이 섞여 지저분 — 보통 끔. 태그는 'Show tags'를 쓰세요.",
                    cleanFrontmatter: "미리보기에서 YAML(태그·작성자·날짜·wikilink 등) 제거하고 본문 위주로.",
                    exactMatch: "검색어를 따옴표로 묶어 정확 매칭.",
                    excludeFolders: "경로에 이 문자열이 포함된 결과 제외(콤마로 여러 개).",
                    theme: "포인트 색 테마. A4P=브랜드 딥그린(기본)/Ocean/Obsidian/Mono/Forest/Sunset/Rose/Grape/Slate. 라이트/다크 자동 + 헤더 ◐ 버튼으로 수동 전환.",
                    skin: "카드 스타일. Editorial=헤어라인 에디토리얼(기본·추천), Clean=카드+좌측보더, Tinted=볼트색 틴트, Solid=카드만.",
                    vaultColorScope: "볼트색 적용 범위. Accent=포인트만 색·제목은 중립(추천), Full=제목·하이라이트까지 볼트색(진함).",
                    titleColor: "노트 제목 글자색 (#RRGGBB).",
                    accentColor: "포인트 색 전체 덮어쓰기 (#RRGGBB). 비우면 테마 사용.",
                    position: "결과 위젯을 구글 사이드바 위/아래 어디에 둘지.",
                    vaultsParentDir: "볼트들의 공통 상위 폴더. 설정하면 abs 경로 = 부모/볼트명/상대경로 로 자동 조립.",
                    useLocalRest: "각 볼트 Local REST API(HTTP)로 노트를 직접 읽어 본문+실제 태그 표시. 슬롯에 포트/키 입력 + 플러그인 필요.",
                    useAdvancedUri: "Advanced URI 플러그인으로 열기. 백그라운드 볼트의 노트도 안정적으로 열림(권장).",
                    focusOnOpen: "노트를 열 때 옵시디언 창을 화면 앞으로 가져옵니다. 브라우저가 'Obsidian을 열까요?'라고 물으면 '항상 허용'을 선택하세요.",
                    keyboardNav: "결과 위에서 j/k·↑↓ 이동, Enter 열기, y 위키링크 복사.",
                    showControlsDefault: "검색 시 라이브 필터 패널을 기본으로 펼침.",
                    requestTimeout: "각 포트(볼트) 요청 대기 시간(ms). 초과 시 그 볼트는 건너뜀.",
                };
                const setTip = (key, text) => {
                    const el = doc.getElementById("ObsidianOmnisearchGoogle_" + key + "_var");
                    if (el) { el.title = text; el.style.cursor = "help"; }
                };
                for (let i = 1; i <= 6; i++) for (const f in slot) setTip("v" + i + "_" + f, slot[f]);
                for (const k in gen) setTip(k, gen[k]);
            },
        },
    });

    const onInit = (config) =>
        new Promise((resolve) => {
            const tick = () => setTimeout(() => (config.isInit ? resolve() : tick()), 0);
            tick();
        });

    function loadSettings() {
        // Build vault configs from the split slot fields (no hardcoded paths — all user-supplied).
        S.vaults = [];
        S.vaultRoots = {};
        for (let i = 1; i <= 6; i++) {
            const port = String(gmc.get("v" + i + "_port") || "").trim();
            if (!/^\d+$/.test(port)) continue;
            const label = String(gmc.get("v" + i + "_name") || "").trim();
            const dvault = String(gmc.get("v" + i + "_vault") || "").trim();
            const color = String(gmc.get("v" + i + "_color") || "").trim();
            const root = String(gmc.get("v" + i + "_root") || "").trim();
            const lrPort = String(gmc.get("v" + i + "_lrPort") || "").trim();
            const lrKey = String(gmc.get("v" + i + "_lrKey") || "").trim();
            S.vaults.push({ port, label, color, dvault, lrPort, lrKey });
            if (root) {
                if (label) S.vaultRoots[label] = root;
                if (dvault) S.vaultRoots[dvault] = root;
            }
        }
        S.nbResults = Math.max(1, parseInt(gmc.get("nbResults"), 10) || 10);
        S.fontScale = Math.max(80, Math.min(150, parseInt(gmc.get("fontScale"), 10) || 110));
        S.excerptLines = Math.max(1, parseInt(gmc.get("excerptLines"), 10) || 3);
        S.showScore = !!gmc.get("showScore");
        S.showPath = !!gmc.get("showPath");
        S.showVaultBadge = gmc.get("showVaultBadge");
        S.showTags = !!gmc.get("showTags");
        S.maxTags = Math.max(1, parseInt(gmc.get("maxTags"), 10) || 5);
        S.showMatchedTerms = !!gmc.get("showMatchedTerms");
        S.titleColor = gmc.get("titleColor");
        // 구버전(포크 원본) 기본 제목색이 저장돼 있으면 무시 — 새 디자인은 중립 잉크 제목이 기본
        if (["#94E2D5", "#F5C2E7", "#E985A2"].includes(String(S.titleColor || "").trim().toUpperCase())) S.titleColor = "";
        S.accentColor = gmc.get("accentColor");
        S.cleanFrontmatter = !!gmc.get("cleanFrontmatter");
        S.exactMatch = !!gmc.get("exactMatch");
        S.excludeFolders = String(gmc.get("excludeFolders") || "")
            .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        S.theme = gmc.get("theme");
        // 구버전 저장값 마이그레이션: 목록에 없는 테마(CMDS 등)는 브랜드 기본으로
        if (!THEMES[String(S.theme || "").toLowerCase()]) S.theme = "A4P";
        S.skin = gmc.get("skin");
        if (!["editorial", "clean", "tinted", "solid"].includes(String(S.skin || "").toLowerCase())) S.skin = "Editorial";
        S.vaultColorScope = gmc.get("vaultColorScope");
        S.position = gmc.get("position");
        S.vaultsParentDir = String(gmc.get("vaultsParentDir") || "").trim();
        S.useLocalRest = !!gmc.get("useLocalRest");
        S.useAdvancedUri = !!gmc.get("useAdvancedUri");
        S.focusOnOpen = gmc.get("focusOnOpen") !== false; // 기본 true (REST로 연 뒤 창 활성화 딥링크)
        S.keyboardNav = !!gmc.get("keyboardNav");
        S.showControlsDefault = !!gmc.get("showControlsDefault");
        S.requestTimeout = Math.max(500, parseInt(gmc.get("requestTimeout"), 10) || 5000);

        // A4P 목회 기능 설정
        S.bibleEnabled = !!gmc.get("bibleEnabled");
        S.bibleNoteFormat = String(gmc.get("bibleNoteFormat") || "{약어}{장}_{절}").trim();
        S.showDoctrine = !!gmc.get("showDoctrine");
        S.showVerseChips = !!gmc.get("showVerseChips");
        const kwList = (field) => String(gmc.get(field) || "")
            .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        S.catKeywords = {
            sermon: kwList("catSermon"),
            frag:   kwList("catFrag"),
            devo:   kwList("catDevo"),
            bible:  kwList("catBible"),
            ref:    kwList("catRef"),
            comm:   kwList("catComm"), // 칩이 아니라 '주석 제외' 필터용 (v1.5.0)
        };
        S.hideComm = !!gmc.get("hideComm");
        S.diversify = !!gmc.get("diversify");
        // 구절 노트 직접 조회용 — REST 경로에는 원본 대소문자·경로가 필요해서 lowercase 없이 따로 보관
        S.catBibleRaw = String(gmc.get("catBible") || "").split(",").map((s) => s.trim()).filter(Boolean);
    }

    const logo = `<svg height="1em" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 256 256">
<path class="purple" d="M94.82 149.44c6.53-1.94 17.13-4.9 29.26-5.71a102.97 102.97 0 0 1-7.64-48.84c1.63-16.51 7.54-30.38 13.25-42.1l3.47-7.14 4.48-9.18c2.35-5 4.08-9.38 4.9-13.56.81-4.07.81-7.64-.2-11.11-1.03-3.47-3.07-7.14-7.15-11.21a17.02 17.02 0 0 0-15.8 3.77l-52.81 47.5a17.12 17.12 0 0 0-5.5 10.2l-4.5 30.18a149.26 149.26 0 0 1 38.24 57.2ZM54.45 106l-1.02 3.06-27.94 62.2a17.33 17.33 0 0 0 3.27 18.96l43.94 45.16a88.7 88.7 0 0 0 8.97-88.5A139.47 139.47 0 0 0 54.45 106Z"/><path class="purple" d="m82.9 240.79 2.34.2c8.26.2 22.33 1.02 33.64 3.06 9.28 1.73 27.73 6.83 42.82 11.21 11.52 3.47 23.45-5.8 25.08-17.73 1.23-8.67 3.57-18.46 7.75-27.53a94.81 94.81 0 0 0-25.9-40.99 56.48 56.48 0 0 0-29.56-13.35 96.55 96.55 0 0 0-40.99 4.79 98.89 98.89 0 0 1-15.29 80.34h.1Z"/><path class="purple" d="M201.87 197.76a574.87 574.87 0 0 0 19.78-31.6 8.67 8.67 0 0 0-.61-9.48 185.58 185.58 0 0 1-21.82-35.9c-5.91-14.16-6.73-36.08-6.83-46.69 0-4.07-1.22-8.05-3.77-11.21l-34.16-43.33c0 1.94-.4 3.87-.81 5.81a76.42 76.42 0 0 1-5.71 15.9l-4.7 9.8-3.36 6.72a111.95 111.95 0 0 0-12.03 38.23 93.9 93.9 0 0 0 8.67 47.92 67.9 67.9 0 0 1 39.56 16.52 99.4 99.4 0 0 1 25.8 37.31Z"/></svg>`;

    // 헤더 아이콘 — 글자 문자(◐·⟳ 등)는 폰트에 따라 흐릿해서 전부 SVG로 통일
    const _ic = (inner) =>
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
    const ICONS = {
        bolt:    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
        pulse:   _ic(`<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`),
        sun:     _ic(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`),
        moon:    _ic(`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`),
        halfsun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></svg>`,
        filter:  _ic(`<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>`),
        refresh: _ic(`<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`),
        chevron: _ic(`<path d="M6 9l6 6 6-6"/>`),
        dots:    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
    };

    // ---------- networking ----------
    function baseQuery() {
        if (state.refine.trim()) return state.refine.trim();
        const q = new URLSearchParams(window.location.search).get(ENGINE.param) || "";
        return q;
    }
    function effectiveQuery() {
        let q = baseQuery();
        if (S.exactMatch && q && !/^".*"$/.test(q)) q = `"${q}"`;
        return q;
    }

    function fetchPort(port, query) {
        return new Promise((resolve) => {
            GM.xmlHttpRequest({
                method: "GET",
                // localhost 필수 (127.0.0.1 고정 금지): Omnisearch 서버는 OS에 따라 ::1(IPv6)에만
                // 바인딩되는데, 브라우저는 localhost에 대해 IPv6/IPv4를 모두 시도해 어느 쪽이든 닿는다.
                url: `http://localhost:${encodeURIComponent(port)}/search?q=${encodeURIComponent(query)}`,
                headers: { "Content-Type": "application/json" },
                timeout: S.requestTimeout,
                onload: (res) => {
                    try {
                        const d = JSON.parse(res.response);
                        resolve(Array.isArray(d) ? d : []);
                    } catch (e) { resolve([]); }
                },
                onerror: () => resolve(null),   // null = port unreachable (vault closed)
                ontimeout: () => resolve(null),
            });
        });
    }

    // 연결 실패 시 목회자 눈높이의 한국어 체크리스트를 보여준다.
    function showConnError(ports) {
        showError(
            `<b>옵시디언과 연결할 수 없습니다</b> (포트: ${escapeHtml(ports.map((p) => p.port).join(", "))})<br /><br />` +
            `<span style="display:block;text-align:left;line-height:1.9">` +
            `1️⃣ 옵시디언이 켜져 있나요? — <a href="obsidian://open">옵시디언 열기</a><br />` +
            `2️⃣ Omnisearch 플러그인의 <b>HTTP 서버</b>가 켜져 있나요?<br />` +
            `&nbsp;&nbsp;&nbsp;→ 옵시디언에서 <b>A4P Omnisearch Helper</b> 플러그인의 [자동 설정] 버튼을 누르면 한 번에 해결됩니다.<br />` +
            `3️⃣ 아직 설정 전이라면 위젯 상단의 <b>⚡ 버튼</b>에 설정 코드를 붙여넣으세요.</span>`
        );
    }

    // ---------- 검색 결과 캐시 (v1.6.0) ----------
    // 뒤로가기로 같은 검색어에 돌아오면 저장해 둔 결과를 즉시 렌더하고(빈 화면 제거),
    // 네트워크 재검색은 그대로 진행해 완료되면 덮어쓴다 (stale-while-revalidate).
    // sessionStorage = 탭·도메인 단위, 탭을 닫으면 자동 소멸 — TTL·용량 부담 최소.
    const CACHE_PREFIX = "om_sr__1__"; // 스키마 버전 포함 — 항목 구조가 바뀌면 번호를 올린다
    const CACHE_TTL = 5 * 60 * 1000;
    const CACHE_MAX = 12;
    const cacheKey = (q) => CACHE_PREFIX + ENGINE.key + "__" + parsePorts().map((p) => p.port).join(",") + "__" + q;
    function readCache(q) {
        try {
            const raw = sessionStorage.getItem(cacheKey(q));
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (!d || !Array.isArray(d.raw) || Date.now() - d.t > CACHE_TTL) { sessionStorage.removeItem(cacheKey(q)); return null; }
            return d;
        } catch (e) { return null; }
    }
    function pruneCache() {
        const entries = [];
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (!k || !k.startsWith("om_sr__")) continue;
            try {
                const d = JSON.parse(sessionStorage.getItem(k));
                if (!k.startsWith(CACHE_PREFIX) || !d || Date.now() - d.t > CACHE_TTL) { sessionStorage.removeItem(k); continue; }
                entries.push([k, d.t]);
            } catch (e) { sessionStorage.removeItem(k); }
        }
        entries.sort((a, b) => a[1] - b[1]); // 오래된 순
        while (entries.length >= CACHE_MAX) sessionStorage.removeItem(entries.shift()[0]);
    }
    function writeCache(q) {
        try {
            const raw = state.raw.map((r) => { const { _note, ...rest } = r; return rest; }); // 노트 전문은 용량 폭탄 — 제외
            pruneCache();
            sessionStorage.setItem(cacheKey(q), JSON.stringify({ t: Date.now(), raw, firstVault: state.firstVault, vaultsSeen: state.vaultsSeen }));
        } catch (e) {
            // quota 초과 등 — 캐시는 편의 기능이라 전부 비우고 조용히 넘어간다
            try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k && k.startsWith("om_sr__")) sessionStorage.removeItem(k); } } catch (e2) { /* ignore */ }
        }
    }

    function runSearch() {
        const query = effectiveQuery();
        if (!query) return;
        resetLimit();
        // 성경구절 인식: 쿼리에 구절 참조가 있으면 구절 노트명 형식(요3_16)의 보조 쿼리를 함께 던진다.
        // → 구절 노트 자체 + frontmatter 성경구절/본문에 그 구절을 인용한 설교·설교조각이 같이 잡힘.
        state.bibleRef = S.bibleEnabled ? parseBibleRef(baseQuery(), S.bibleNoteFormat) : null;
        // 캐시 히트면 즉시 렌더 (검색 중… 화면 생략), 네트워크 재검색은 그대로 진행
        const cached = readCache(query);
        let fromCache = false;
        if (cached) {
            state.raw = cached.raw;
            state.firstVault = cached.firstVault || "";
            state.vaultsSeen = cached.vaultsSeen || 0;
            applyPipeline(); renderResults();
            fromCache = true;
        } else {
            showLoading();
        }
        const auxQueries = state.bibleRef ? state.bibleRef.auxQueries.slice(0, 5) : [];
        // 콜론형 보조 쿼리 (v1.6.0): 주석·설교 본문의 "요1:1" 표기 인용까지 회수.
        // 인용 찾기 버튼(refine="요1_1")처럼 원 쿼리가 노트명 형식일 때 특히 유효. 범위 구절은
        // 첫 절만 ("요1:1-3" 표기도 "요1:1"을 접두로 포함 — recall 충분, fanout 억제).
        // 파서(테스트가 auxQueries를 정확 단언)는 불변 — 여기서만 확장한다.
        if (state.bibleRef && state.bibleRef.verse != null) {
            const colon = state.bibleRef.abbr + state.bibleRef.chapter + ":" + state.bibleRef.verse;
            if (!auxQueries.includes(colon) && baseQuery().replace(/\s+/g, "") !== colon) auxQueries.push(colon);
        }
        const ports = parsePorts();
        const mains = ports.map((p) => fetchPort(p.port, query));
        const auxJobs = [];
        ports.forEach((p, i) => auxQueries.forEach((q) =>
            auxJobs.push(fetchPort(p.port, q).then((r) => ({ i, r })))));
        // 구절 노트 직접 조회는 병렬로 시작하되 검색 렌더를 막지 않는다 (도착하면 맨 위에 합류)
        const pinnedJob = resolveVerseNotes();
        Promise.all([Promise.all(mains), Promise.all(auxJobs)]).then(([responses, auxResults]) => {
            if (responses.every((r) => r === null)) {
                // 캐시로 이미 그려 놨으면 에러 화면으로 덮지 않는다 (SWR — 낡은 결과가 빈 화면보다 낫다)
                if (fromCache) { console.warn("[A4P Omnisearch] 재검색 실패 — 캐시 결과 유지"); return; }
                showConnError(ports);
                return;
            }
            // merge + dedupe by vault|path, tagging each item with its port's display label
            const seen = new Set();
            const merged = [];
            const addItems = (arr, cfg, isAux) => {
                if (!Array.isArray(arr)) return;
                // 응답별 정규화: 서로 다른 쿼리·볼트의 BM25 score는 스케일이 달라 직접 비교 불가 →
                // 각 응답 안에서의 상대값(_rel 0..1)만 만들어 정렬·%바·minRel에 쓴다.
                const respMax = Math.max(0, ...arr.map((it) => Number(it.score) || 0));
                for (const it of arr) {
                    const key = (it.vault || "") + "|" + (it.path || "");
                    if (seen.has(key)) continue;
                    seen.add(key);
                    it._label = cfg.label;     // display name (may be "")
                    it._color = cfg.color;     // per-vault color (may be "")
                    it._dvault = cfg.dvault;   // deeplink vault override (may be "")
                    it._restPort = cfg.lrPort; // Local REST API port (may be "")
                    it._restKey = cfg.lrKey;   // Local REST API key (may be "")
                    it._aux = !!isAux;         // 성경구절 보조 쿼리로 들어온 결과
                    it._rel = respMax > 0 ? (Number(it.score) || 0) / respMax : 0;
                    merged.push(it);
                }
            };
            responses.forEach((arr, i) => {
                if (arr === null) return;
                if (arr[0]) console.log(`[A4P Omnisearch] port ${ports[i].port} → vault "${arr[0].vault}" (deeplink uses "${ports[i].dvault || arr[0].vault}")`);
                addItems(arr, ports[i], false);
            });
            auxResults.forEach(({ i, r }) => addItems(r, ports[i], true));
            state.raw = merged;
            state.firstVault = merged[0] ? (merged[0]._dvault || merged[0].vault || "") : (ports[0] ? ports[0].dvault || "" : "");
            state.vaultsSeen = new Set(merged.map((r) => r._label || r.vault)).size;
            applyPipeline();
            renderResults();
            writeCache(query);
            pinnedJob.then((p) => { // 구절 노트가 찾아지면 결과 맨 위에 핀 + 핀 포함 스냅샷 재저장
                mergePinned(p);
                if (p && p.length) writeCache(query);
            });
        });
    }

    // ---------- pipeline ----------
    function applyPipeline() {
        let v = state.raw.slice();
        if (S.excludeFolders.length) {
            v = v.filter((r) => !S.excludeFolders.some((f) => String(r.path || "").toLowerCase().includes(f)));
        }
        // 주석 제외 (v1.5.0): 장 단위 통합주석이 구절 검색을 도배하지 않도록 기본 숨김.
        // 디렉토리 경로만 매칭해 "주석에 대한 생각.md" 같은 파일명 오탐 방지. 핀(구절 노트)은 항상 통과.
        if (S.hideComm && S.catKeywords.comm.length) {
            v = v.filter((r) => r._pinned || !dirMatches(r.path, S.catKeywords.comm));
        }
        // 접힌 패널 속 필터(타입·최소 관련도)는 눈에 안 보인 채 결과를 숨길 수 있어 집계해서 안내한다.
        let hiddenInvisible = 0;
        if (state.type !== "all") {
            const before = v.length;
            v = v.filter((r) => matchType(r.path, state.type));
            hiddenInvisible += before - v.length;
        }

        // 칩 건수 배지 (v1.6.0): "그 칩을 눌렀을 때 보게 될 건수" = cat 필터만 빼고 나머지(제외·타입·minRel) 적용.
        // minRel은 파이프라인상 뒤에 오지만 항목별 독립 술어라 교집합 카운트는 순서 무관.
        const minRelOk = (r) => state.minRel <= 0 || (r._rel || 0) * 100 >= state.minRel;
        state.catCounts = { all: v.filter(minRelOk).length };
        for (const [k] of CATS) {
            if (k === "all") continue;
            const kws = S.catKeywords[k] || [];
            state.catCounts[k] = kws.length ? v.filter((r) => minRelOk(r) && dirMatches(r.path, kws)).length : state.catCounts.all;
        }

        // 목회 카테고리 필터: 노트의 "폴더 경로"에 카테고리 키워드가 포함되면 통과 (키워드는 설정에서 변경 가능)
        // 파일명은 제외 — "300. Sermons/성경적 세계관.md"가 '성경' 칩에 걸리는 오분류 방지.
        if (state.cat !== "all") {
            const kws = S.catKeywords[state.cat] || [];
            if (kws.length) v = v.filter((r) => dirMatches(r.path, kws));
        }

        state.topScore = Math.max(1, ...state.raw.map((r) => Number(r.score) || 0)); // 렌더 폴백용
        if (state.minRel > 0) {
            const before = v.length;
            v = v.filter((r) => (r._rel || 0) * 100 >= state.minRel); // 응답별 상대값 기준
            hiddenInvisible += before - v.length;
        }
        state.hiddenByFilters = hiddenInvisible;

        // 성경구절 검색용 비교자: 메인/보조(aux)는 score 스케일이 달라 그룹으로 나눠 배치.
        // 순수 구절 쿼리("요 3:16")는 구절노트·인용노트(aux)가 본론이라 먼저, 혼합 쿼리는 메인 먼저.
        const bibleCompare = () => {
            const auxFirst = state.bibleRef.refOnly ? 1 : 0;
            return (a, b) =>
                (b._pinned ? 1 : 0) - (a._pinned ? 1 : 0) // 직접 조회한 구절 노트가 항상 최상단
                || (auxFirst ? (b._aux ? 1 : 0) - (a._aux ? 1 : 0) : (a._aux ? 1 : 0) - (b._aux ? 1 : 0))
                || (b._rel || 0) - (a._rel || 0)
                || (Number(b.score) || 0) - (Number(a.score) || 0);
        };
        if (state.sort === "name") {
            v.sort((a, b) => String(a.basename).localeCompare(String(b.basename)));
        } else if (state.sort === "vault") {
            v.sort((a, b) => String(a.vault).localeCompare(String(b.vault)) || (b.score - a.score));
        } else if (state.bibleRef && S.diversify && state.cat === "all") {
            // 다양성 정렬 (v1.5.0): 한 카테고리(예: 성경 구절 노트)가 상위를 독점하지 않도록
            // 설교→조각→묵상→자료→기타 순 라운드로빈 교차 배치. 버킷 내부는 기존 정렬 유지.
            v.sort(bibleCompare());
            // first-match 분류 — frag를 sermon보다 먼저: '설교' 키워드가 '설교조각' 폴더에도 걸리는 오분류 방지.
            const CLASSIFY_ORDER = ["frag", "bible", "devo", "ref", "sermon"];
            const pinned = [], buckets = { sermon: [], frag: [], devo: [], bible: [], ref: [], etc: [] };
            for (const r of v) {
                if (r._pinned) { pinned.push(r); continue; }
                const c = CLASSIFY_ORDER.find((k) => dirMatches(r.path, S.catKeywords[k] || [])) || "etc";
                buckets[c].push(r);
            }
            const roundRobin = (lists) => {
                const out = [];
                for (let i = 0; lists.some((l) => i < l.length); i++)
                    for (const l of lists) if (i < l.length) out.push(l[i]);
                return out;
            };
            const rr = roundRobin([buckets.sermon, buckets.frag, buckets.devo, buckets.ref, buckets.etc]);
            // 성경(구절·인용) 버킷은 로테이션에서 제외 — 순수 구절 쿼리면 본론이라 앞, 혼합 쿼리면 보조라 뒤.
            v = state.bibleRef.refOnly
                ? pinned.concat(buckets.bible, rr)
                : pinned.concat(rr, buckets.bible);
        } else if (state.bibleRef) {
            v.sort(bibleCompare());
        } else {
            v.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        }
        state.filteredCount = v.length;
        state.view = v.slice(0, state.limit || S.nbResults);
        state.selected = -1;
    }

    // "더 보기" 상한 리셋 — 결과 집합이 바뀌는 제스처(새 검색·칩·타입·관련도 변경)에서 호출.
    // 정렬 변경은 같은 집합의 재배열이라 리셋하지 않는다.
    const resetLimit = () => { state.limit = S.nbResults; };

    // ---------- rendering ----------
    function $body() { return $(`#${ID} .om-body`); }

    function buildShell() {
        const showBadgePref = S.showVaultBadge;
        const container = $(`
            <div id="${ID}" class="theme-${S.theme.toLowerCase()} skin-${(S.skin || "Editorial").toLowerCase()} vscope-${(S.vaultColorScope || "Accent").toLowerCase()}">
                <div class="om-header">
                    <span class="om-h-title">${logo}<span>A4P 통합검색</span></span>
                    <span class="om-count" data-tip="옵시디언 볼트에서 찾은 결과 개수" style="display:none">0</span>
                    <span class="om-h-actions">
                        <button class="om-icon-btn om-setup-code" data-tip="⚡ 설정 코드 붙여넣기 (옵시디언 A4P Helper에서 복사)">${ICONS.bolt}</button>
                        <button class="om-icon-btn om-diagnose" data-tip="연결 진단">${ICONS.pulse}</button>
                        <button class="om-icon-btn om-mode" data-tip="화면 모드: 자동">${ICONS.halfsun}</button>
                        <button class="om-icon-btn om-toggle-controls" data-tip="정렬·필터 열기">${ICONS.filter}</button>
                        <button class="om-icon-btn om-refresh" data-tip="다시 검색">${ICONS.refresh}</button>
                        <button class="om-icon-btn om-collapse" data-tip="접기/펼치기">${ICONS.chevron}</button>
                        <button class="om-icon-btn om-settings" data-tip="전체 설정 열기">${ICONS.dots}</button>
                    </span>
                </div>
                <div class="om-body">
                    <div class="om-controls">
                        <input class="om-refine" type="text" placeholder="옵시디언 안에서 다시 검색…" />
                        <div class="om-ctl-row">
                            <span class="om-seg om-sort">
                                <button data-v="score" class="active">관련도</button>
                                <button data-v="name">가나다</button>
                                <button data-v="vault">볼트</button>
                            </span>
                        </div>
                        <div class="om-ctl-row">
                            <span class="om-seg om-type">
                                <button data-v="all" class="active">전체</button>
                                <button data-v="md">md</button>
                                <button data-v="pdf">pdf</button>
                                <button data-v="img">img</button>
                            </span>
                            <label class="om-slider">최소 관련도
                                <input type="range" min="0" max="100" step="1" value="0" class="om-minrel" />
                                <span class="om-minrel-val">0%</span>
                            </label>
                        </div>
                    </div>
                    <div class="om-bible"></div>
                    <div class="om-cats">${CATS.map(([k, label]) =>
                        `<button class="om-cat${k === "all" ? " active" : ""}" data-v="${k}">${label}<span class="om-cat-n"></span></button>`).join("")}</div>
                    <div class="om-list"></div>
                </div>
            </div>
        `);

        if (S.position === "Top") $(sidebarSelector).prepend(container);
        else $(sidebarSelector).append(container);

        // restore state
        applyMode();
        if (state.collapsed) $(`#${ID}`).addClass("collapsed");
        if (state.controlsOpen || S.showControlsDefault) {
            $(`#${ID} .om-controls`).addClass("open");
            $(`#${ID} .om-toggle-controls`).addClass("active");
            state.controlsOpen = true;
        }
        $(`#${ID} .om-sort button[data-v="${state.sort}"]`).addClass("active").siblings().removeClass("active");
        $(`#${ID} .om-type button[data-v="${state.type}"]`).addClass("active").siblings().removeClass("active");
        $(`#${ID} .om-cats button[data-v="${state.cat}"]`).addClass("active").siblings().removeClass("active");
        $(`#${ID} .om-minrel`).val(state.minRel);
        $(`#${ID} .om-minrel-val`).text(state.minRel + "%");
        $(`#${ID} .om-refine`).val(state.refine);

        bindShellEvents();
    }

    // 페이지의 실제 배경 밝기로 다크 여부 판단.
    // OS 설정(prefers-color-scheme)이 아니라 위젯이 올라간 페이지를 따라가야
    // "구글은 다크인데 맥은 라이트" 같은 조합에서도 색이 틀어지지 않는다.
    function pageIsDark() {
        for (const el of [document.body, document.documentElement]) {
            if (!el) continue;
            const bg = getComputedStyle(el).backgroundColor || "";
            const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (!m) continue;
            if (m[4] !== undefined && parseFloat(m[4]) === 0) continue; // 투명이면 다음 후보
            return 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3] < 128;
        }
        return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    // 화면 모드(자동/라이트/다크) — 버튼 클릭으로 순환, GM 저장소에 기억.
    // 자동 = 페이지 배경 감지 결과를 명시 클래스로 박아 넣는다 (OS와 무관).
    const MODES = {
        auto:  { icon: "halfsun", label: "자동 (페이지에 맞춤)" },
        light: { icon: "sun",     label: "라이트 고정" },
        dark:  { icon: "moon",    label: "다크 고정" },
    };
    function applyMode() {
        const m = MODES[state.mode] || MODES.auto;
        const dark = state.mode === "dark" || (state.mode === "auto" && pageIsDark());
        $(`#${ID}`).removeClass("om-light om-dark").addClass(dark ? "om-dark" : "om-light");
        $(`#${ID} .om-mode`).html(ICONS[m.icon])
            .attr("data-tip", `화면 모드: ${m.label} — 클릭해서 순환`);
    }

    function bindShellEvents() {
        $(document).on("click", `#${ID} .om-settings`, (e) => { e.preventDefault(); gmc.open(); });

        $(document).on("click", `#${ID} .om-mode`, function () {
            const order = ["auto", "light", "dark"];
            state.mode = order[(order.indexOf(state.mode) + 1) % order.length];
            setVal("om_mode", state.mode);
            applyMode();
        });

        $(document).on("click", `#${ID} .om-toggle-controls`, function () {
            state.controlsOpen = !state.controlsOpen;
            $(`#${ID} .om-controls`).toggleClass("open", state.controlsOpen);
            $(this).toggleClass("active", state.controlsOpen);
        });

        $(document).on("click", `#${ID} .om-refresh`, () => runSearch());

        $(document).on("click", `#${ID} .om-collapse`, function () {
            state.collapsed = !state.collapsed;
            $(`#${ID}`).toggleClass("collapsed", state.collapsed); // 화살표 회전은 CSS가 처리
            setVal("om_collapsed", state.collapsed);
        });

        $(document).on("click", `#${ID} .om-sort button`, function () {
            state.sort = $(this).data("v");
            $(this).addClass("active").siblings().removeClass("active");
            setVal("om_sort", state.sort);
            applyPipeline(); renderResults();
        });

        $(document).on("click", `#${ID} .om-type button`, function () {
            state.type = $(this).data("v");
            $(this).addClass("active").siblings().removeClass("active");
            setVal("om_type", state.type);
            resetLimit();
            applyPipeline(); renderResults();
        });

        // 목회 카테고리 칩 (설교/조각/묵상/성경/자료)
        $(document).on("click", `#${ID} .om-cats button`, function () {
            state.cat = $(this).data("v");
            $(this).addClass("active").siblings().removeClass("active");
            setVal("om_cat", state.cat);
            resetLimit();
            applyPipeline(); renderResults();
        });

        // 더 보기: state.raw에 전체 결과가 있으므로 재요청 없이 표시 상한만 늘린다
        $(document).on("click", `#${ID} .om-more`, (e) => {
            e.preventDefault();
            state.limit = (state.limit || S.nbResults) + S.nbResults;
            applyPipeline(); renderResults();
        });

        // ⚡ 설정 코드 붙여넣기 / 🩺 연결 진단
        $(document).on("click", `#${ID} .om-setup-code`, (e) => { e.preventDefault(); importSetupCode(); });
        $(document).on("click", `#${ID} .om-diagnose`, (e) => { e.preventDefault(); runDiagnostics(); });
        // 빈 카테고리에서 전체 보기로 복귀
        $(document).on("click", `#${ID} .om-cat-reset`, (e) => {
            e.preventDefault();
            state.cat = "all"; setVal("om_cat", "all");
            $(`#${ID} .om-cats .om-cat`).removeClass("active").filter(`[data-v="all"]`).addClass("active");
            resetLimit();
            applyPipeline();
            renderResults();
        });
        // 숨김 필터 원클릭 해제: 최소 관련도 0 + 타입 전체로 되돌리고 저장·재렌더
        $(document).on("click", `#${ID} .om-filter-reset`, (e) => {
            e.preventDefault();
            state.minRel = 0; setVal("om_minRel", 0);
            state.type = "all"; setVal("om_type", "all");
            $(`#${ID} .om-minrel`).val(0);
            $(`#${ID} .om-minrel-val`).text("0%");
            $(`#${ID} .om-type button`).removeClass("active").filter(`[data-v="all"]`).addClass("active");
            resetLimit();
            applyPipeline();
            renderResults();
        });

        // 성경구절 카드 버튼: 구절 노트 열기 / 인용 노트 찾기 / 구절 칩
        $(document).on("click", `#${ID} .om-bible-open`, function (e) {
            e.preventDefault(); openNoteByName($(this).data("note"));
        });
        $(document).on("click", `#${ID} .om-bible-cite`, function (e) {
            e.preventDefault();
            state.refine = String($(this).data("q") || "");
            $(`#${ID} .om-refine`).val(state.refine);
            runSearch();
        });
        $(document).on("click", `#${ID} .om-verse`, function (e) {
            e.preventDefault(); e.stopPropagation(); openNoteByName($(this).data("note"));
        });
        // doctrine 칩 클릭 → 그 신학 주제로 재검색 (칩이 <a class="om-link"> 내부라 전파 차단 필수)
        $(document).on("click", `#${ID} .om-doc`, function (e) {
            e.preventDefault(); e.stopPropagation();
            const q = String($(this).data("q") || "");
            if (!q) return;
            state.refine = q;
            $(`#${ID} .om-refine`).val(q);
            runSearch();
        });

        $(document).on("input", `#${ID} .om-minrel`, function () {
            state.minRel = parseInt(this.value, 10) || 0;
            $(`#${ID} .om-minrel-val`).text(state.minRel + "%");
            setVal("om_minRel", state.minRel);
            resetLimit();
            applyPipeline(); renderResults();
        });

        const onRefine = debounce(() => {
            state.refine = $(`#${ID} .om-refine`).val();
            runSearch();
        }, 280);
        $(document).on("input", `#${ID} .om-refine`, onRefine);

        // open the note: Local REST (reliable) → else obsidian:// deeplink. Allow modified/middle clicks.
        // 인덱스는 .om-result 집합 기준 — 형제 기준 .index()는 .om-filter-hint/.om-more가 끼면 어긋난다.
        $(document).on("click", `#${ID} .om-link`, function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            openItem(state.view[$(`#${ID} .om-result`).index($(this).closest(".om-result"))]);
        });

        // expand excerpt on click (don't trigger the open handler)
        $(document).on("click", `#${ID} .om-excerpt`, function (e) {
            e.preventDefault(); e.stopPropagation();
            $(this).toggleClass("expanded");
        });

        // 카드 호버 복사 버튼(인용/name/rel/abs)은 v1.6.1에서 제거 — 배지·태그를 가리고
        // 실사용이 없었음 (사용자 결정). 복사는 키보드 y(위키링크)/c(인용)로 계속 가능.
    }

    function showLoading() {
        const list = $(`#${ID} .om-list`);
        if (!list.find(".om-loading")[0]) {
            list.html(`<span class="om-loading">옵시디언 검색 중…</span>`);
        }
    }

    // 성경구절 인식 시 결과 위에 고정되는 구절 카드
    function renderBibleCard() {
        const box = $(`#${ID} .om-bible`);
        const ref = state.bibleRef;
        if (!ref) { box.empty().hide(); return; }
        const noteBtns = ref.noteNames.slice(0, 5).map((n) =>
            `<button class="om-bible-open" data-note="${escapeHtml(n)}" title="구절 노트 열기">📖 ${escapeHtml(n)}</button>`).join("");
        box.html(`
            <div class="om-bible-card">
                <div class="om-bible-title">✝️ ${escapeHtml(ref.display)}</div>
                <div class="om-bible-actions">
                    ${noteBtns}
                    <button class="om-bible-cite" data-q="${escapeHtml(ref.noteNames[0])}" title="이 구절을 인용한 설교·설교조각 찾기">🔎 인용한 노트 찾기</button>
                </div>
            </div>`).show();
    }
    function showError(html) {
        $(`#${ID} .om-list`).html(`<div class="om-error">${html}</div>`);
        setCount(null);
    }
    function setCount(n) {
        const el = $(`#${ID} .om-count`);
        if (n === null || n === undefined) el.hide();
        else el.text(`${n}건`).show();
    }

    // 카테고리 칩 건수 배지 갱신 (v1.6.0) — 칩 DOM은 buildShell 1회 렌더라 배지만 따로 업데이트.
    function renderCatCounts() {
        const counts = state.catCounts;
        if (!counts) return;
        $(`#${ID} .om-cats .om-cat`).each(function () {
            const k = $(this).data("v");
            const n = counts[k];
            $(this).find(".om-cat-n").text(n != null ? n : "");
            $(this).toggleClass("om-cat-zero", n === 0);
        });
    }

    function renderResults() {
        const list = $(`#${ID} .om-list`);
        list.empty();
        setCount(state.view.length);
        renderCatCounts();
        renderBibleCard();

        // 접힌 패널의 필터가 결과를 숨기고 있으면 알리고 원클릭 해제 제공
        // (슬라이더를 만졌다가 잊으면 "0~1건"만 보이는 함정 방지)
        const hint = state.hiddenByFilters > 0
            ? `<div class="om-filter-hint">필터로 ${state.hiddenByFilters}건 숨김 (최소 관련도 ${state.minRel}%${state.type !== "all" ? " · 타입 " + escapeHtml(state.type) : ""}) — <a href="#" class="om-filter-reset">필터 해제</a></div>`
            : "";

        if (state.view.length === 0) {
            // 카테고리 칩이 모든 결과를 걸렀으면 원클릭 복귀 제공 (성경 칩인데 구절 노트가 랭킹 밖인 경우 등)
            const catHint = state.cat !== "all" && state.raw.length > 0
                ? `<div class="om-filter-hint">이 카테고리에 해당하는 결과가 없습니다 (전체 ${state.raw.length}건) — <a href="#" class="om-cat-reset">전체 보기</a></div>`
                : "";
            list.html((hint + catHint) || `<span class="om-loading">옵시디언에서 결과 없음</span>`);
            return;
        }
        if (hint) list.append(hint);

        const multiVault = state.vaultsSeen > 1;
        const showBadge = S.showVaultBadge === "always" || (S.showVaultBadge === "auto" && multiVault);

        state.view.forEach((item, i) => {
            const url = openUrl(item);
            const pct = Math.round((item._rel != null ? item._rel : (Number(item.score) || 0) / state.topScore) * 100);
            const vaultName = item._label || item.vault;
            // 볼트 자동색(이름 해시)은 볼트가 2개 이상일 때만 구분 용도로 쓴다.
            // 단일 볼트에서는 슬롯에 Color hex를 직접 지정한 경우에만 색을 입힘 — 아니면 브랜드 테마색.
            const vc = vaultColor(item);
            const colorize = validHex(item._color) || (showBadge && multiVault);
            const badge = showBadge ? `<span class="om-badge">${escapeHtml(vaultName)}</span>` : "";
            const scoreHtml = S.showScore
                ? `<div class="om-score"><span class="om-bar"><i style="width:${pct}%"></i></span><span class="om-pct">${pct}%</span></div>`
                : "";

            let termsHtml = "";
            if (S.showMatchedTerms && Array.isArray(item.foundWords) && item.foundWords.length) {
                termsHtml = `<div class="om-terms">` +
                    item.foundWords.slice(0, 8).map((w) => `<span class="om-term">${escapeHtml(w)}</span>`).join("") +
                    `</div>`;
            }
            let tagsHtml = "";
            if (S.showTags) {
                const tags = extractTags(item.excerpt);
                if (tags.length) {
                    tagsHtml = `<div class="om-tags">` +
                        tags.map((t) => `<span class="om-tag">${escapeHtml(t)}</span>`).join("") +
                        `</div>`;
                }
            }
            const pathHtml = S.showPath ? `<div class="om-path">${breadcrumb(item.path)}</div>` : "";
            const vcStyle = colorize ? ` style="--vc:${escapeHtml(vc)}"` : "";
            // 설교 파일명(260412_대_…)이면 날짜·부서 배지 + prefix 없는 제목으로 표시 (원본 basename은 불변)
            const sm = sermonMeta(item.basename);
            const dispTitle = sm ? sm.title : item.basename;
            const sermonBadge = sm ? `<span class="om-sermon-badge">${sm.date} · ${sm.dept}</span>` : "";
            const card = $(`
                <div class="om-result"${vcStyle}>
                    <a class="om-link" href="${escapeHtml(url)}">
                        <h3 class="om-title"><span class="om-title-text">${escapeHtml(dispTitle)}</span>${sermonBadge}${badge}</h3>
                        ${scoreHtml}
                        <div class="om-excerpt" style="-webkit-line-clamp:${S.excerptLines}">${cleanExcerpt(item.excerpt)}</div>
                        ${termsHtml}
                        ${tagsHtml}
                        ${pathHtml}
                    </a>
                </div>
            `);
            list.append(card);
        });

        // 더 보기 (v1.6.0): state.raw에 전체 결과가 있으므로 표시 상한만 늘리면 된다
        const remain = state.filteredCount - state.view.length;
        if (remain > 0) list.append(`<button class="om-more">더 보기 (+${Math.min(remain, S.nbResults)}건 · 남은 ${remain}건)</button>`);

        enrichResults(); // Local REST API: swap in real body + tags (no-op unless enabled)
    }

    // ---------- keyboard ----------
    function isTyping(e) {
        const t = e.target;
        return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    }
    function setSelected(i) {
        const cards = $(`#${ID} .om-result`);
        if (!cards.length) return;
        state.selected = Math.max(0, Math.min(cards.length - 1, i));
        cards.removeClass("selected");
        const el = cards.eq(state.selected).addClass("selected")[0];
        if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    function bindKeyboard() {
        if (!S.keyboardNav) return;
        document.addEventListener("keydown", (e) => {
            if (isTyping(e) || state.collapsed) return;
            if (!state.view.length) return;
            // 위젯이 숨겨진 상태(유튜브 비검색 페이지 등)에서는 사이트 단축키(j/k)를 가로채지 않는다
            const w = $(`#${ID}`);
            if (!w.length || !w.is(":visible")) return;
            if (e.key === "j" || e.key === "ArrowDown") {
                e.preventDefault(); setSelected(state.selected < 0 ? 0 : state.selected + 1);
            } else if (e.key === "k" || e.key === "ArrowUp") {
                e.preventDefault(); setSelected(state.selected < 0 ? 0 : state.selected - 1);
            } else if (e.key === "Enter" && state.selected >= 0) {
                openItem(state.view[state.selected]);
            } else if (e.key === "y" && state.selected >= 0) {
                const item = state.view[state.selected];
                if (item) copyText(`[[${item.basename}]]`);
            } else if (e.key === "c" && state.selected >= 0) {
                const item = state.view[state.selected];
                if (item) copyCitation(item, $(`#${ID} .om-result`).eq(state.selected));
            } else if (e.key === "Escape" && state.selected >= 0) {
                state.selected = -1; $(`#${ID} .om-result`).removeClass("selected");
            }
        });
    }

    // ---------- boot ----------
    console.log(`Loading A4P Omnisearch v${VERSION} (engine: ${ENGINE.key})`);

    // 검색결과 페이지에서만 위젯을 띄운다.
    // @match가 도메인 전체에 걸리므로 경로로 한 번 거른다 — 구글 지도·이미지·홈 등에서 빈 패널이 뜨는 것 방지.
    const SEARCH_PATHS = { google: "/search", bing: "/search", youtube: "/results" };
    const onSearchPage = () => {
        const p = SEARCH_PATHS[ENGINE.key];
        if (p && location.pathname !== p) return false;
        // 구글은 표준 웹검색 레이아웃(#rhs/#rcnt)이 있을 때만 — 지도·이미지 등 특수 레이아웃 제외
        if (ENGINE.key === "google" && !$("#rhs")[0] && !$("#rcnt")[0]) return false;
        return true;
    };

    function mountWidget() {
        if (!sidebarSelector || !$(sidebarSelector)[0]) {
            if (ENGINE.key === "google" && $(ENGINE.fallbackParent)[0]) {
                $(ENGINE.fallbackParent).append('<div id="rhs" style="min-width: 400px; flex-shrink: 0;"></div>');
            } else {
                // 사이드바 컨테이너가 없는 사이트(유튜브)나 못 찾은 경우(네이버·Bing) → 우측 고정 플로팅 패널
                $("body").append('<div id="a4p-float"></div>');
                sidebarSelector = "#a4p-float";
            }
        }
        buildShell();
        applyCustomColors();
        bindKeyboard();

        // keep widget pinned to chosen edge if the engine injects more cards
        waitForKeyElements(sidebarSelector, () => {
            const w = $(`#${ID}`);
            if (S.position === "Top") { if (w.prev().length > 0) w.prependTo(sidebarSelector); }
            else { if (w.next().length > 0) w.appendTo(sidebarSelector); }
        });
    }

    onInit(gmc).then(async () => {
        loadSettings();
        state.collapsed = await getVal("om_collapsed", false);
        state.sort = await getVal("om_sort", "score");
        state.minRel = await getVal("om_minRel", 0);
        state.type = await getVal("om_type", "all");
        state.cat = await getVal("om_cat", "all");
        // 사라진 칩(구버전 comm 등)이 저장돼 있으면 전체로 복귀 — 안 그러면 칩 없는 필터로 0건 화면
        if (!CATS.some(([k]) => k === state.cat)) { state.cat = "all"; setVal("om_cat", "all"); }
        state.mode = await getVal("om_mode", "auto");

        injectStyles();
        if (onSearchPage()) {
            mountWidget();
            runSearch();
        }

        // 유튜브는 SPA: 페이지 이동 시 새로고침이 없으므로 자체 내비게이션 이벤트에 반응한다.
        if (ENGINE.key === "youtube") {
            document.addEventListener("yt-navigate-finish", () => {
                if (!onSearchPage()) { $("#a4p-float").hide(); return; }
                if (!$(`#${ID}`).length) mountWidget();
                else $("#a4p-float").show();
                state.refine = "";
                $(`#${ID} .om-refine`).val("");
                runSearch();
            });
        }

        console.log(`Loaded A4P Omnisearch v${VERSION}`);
    });
})();
