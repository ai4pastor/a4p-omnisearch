// 성경구절 파서 단위 테스트
// 유저스크립트에서 성경구절 인식 모듈만 추출해 node로 실행한다.
//   실행: node test/bible-parser.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, "userscript", "a4p-omnisearch.user.js"), "utf8");

const START = "// ---------- 성경구절 인식";
const END = "// ---------- Local REST API enrichment";
const s = src.indexOf(START);
const e = src.indexOf(END);
if (s < 0 || e < 0 || e <= s) throw new Error("성경구절 모듈 마커를 찾지 못했습니다");
const module = src.slice(s, e);

// 모듈이 의존하는 헬퍼 스텁과 함께 평가해 parseBibleRef를 얻는다
const parseBibleRef = new Function(`
    const escapeRegExp = (str) => String(str).replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
    ${module}
    return parseBibleRef;
`)();

let pass = 0, fail = 0;
function check(query, expected, label) {
    const r = parseBibleRef(query, "{약어}{장}_{절}");
    const got = r === null ? null : {
        abbr: r.abbr, chapter: r.chapter, verse: r.verse, verseEnd: r.verseEnd,
        first: r.noteNames[0], count: r.noteNames.length,
    };
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (ok) { pass++; console.log(`  ✅ ${label}: "${query}"`); }
    else {
        fail++;
        console.log(`  ❌ ${label}: "${query}"\n     기대: ${JSON.stringify(expected)}\n     실제: ${JSON.stringify(got)}`);
    }
}

console.log("— 약어 + 장:절 —");
check("요 3:16", { abbr: "요", chapter: 3, verse: 16, verseEnd: null, first: "요3_16", count: 1 }, "공백 있는 약어");
check("요3:16", { abbr: "요", chapter: 3, verse: 16, verseEnd: null, first: "요3_16", count: 1 }, "붙여 쓴 약어");
check("요3_16", { abbr: "요", chapter: 3, verse: 16, verseEnd: null, first: "요3_16", count: 1 }, "노트명 형식");
check("롬 8:28", { abbr: "롬", chapter: 8, verse: 28, verseEnd: null, first: "롬8_28", count: 1 }, "로마서 약어");

console.log("— 정식 이름 —");
check("요한복음 3:16", { abbr: "요", chapter: 3, verse: 16, verseEnd: null, first: "요3_16", count: 1 }, "정식명 + 콜론");
check("요한복음 3장 16절", { abbr: "요", chapter: 3, verse: 16, verseEnd: null, first: "요3_16", count: 1 }, "장·절 표기");
check("고린도전서 13장 4절", { abbr: "고전", chapter: 13, verse: 4, verseEnd: null, first: "고전13_4", count: 1 }, "두 글자 약어 책");
check("시편 23편", { abbr: "시", chapter: 23, verse: null, verseEnd: null, first: "시23_1", count: 1 }, "시편 N편 (장 단위)");
check("로마서 8", { abbr: "롬", chapter: 8, verse: null, verseEnd: null, first: "롬8_1", count: 1 }, "정식명 장 단위 (마커 없음 허용)");

console.log("— 범위 구절 (개별 분리, 상한 5절) —");
check("롬 3:10-12", { abbr: "롬", chapter: 3, verse: 10, verseEnd: 12, first: "롬3_10", count: 3 }, "범위 → 3개 분리");
check("창1:1-3", { abbr: "창", chapter: 1, verse: 1, verseEnd: 3, first: "창1_1", count: 3 }, "창세기 범위");
check("시 119:1-40", { abbr: "시", chapter: 119, verse: 1, verseEnd: 40, first: "시119_1", count: 5 }, "긴 범위 → 5개 상한");

console.log("— 요한 서신 구분 (긴 약어 우선) —");
check("요일 3:16", { abbr: "요일", chapter: 3, verse: 16, verseEnd: null, first: "요일3_16", count: 1 }, "요한1서 (요보다 우선)");
check("요한계시록 21:4", { abbr: "계", chapter: 21, verse: 4, verseEnd: null, first: "계21_4", count: 1 }, "계시록 정식명");

console.log("— 문장 속 참조 —");
check("설교 준비 요 3:16 은혜", { abbr: "요", chapter: 3, verse: 16, verseEnd: null, first: "요3_16", count: 1 }, "문장 중간의 참조");

console.log("— 오탐 방지 —");
check("전 3개월 계획", null, "'전 3' 일반 문장 거부");
check("말 10마리", null, "'말 10' 일반 문장 거부");
check("옵시디언 강의", null, "숫자 없는 문장 거부");
check("사랑과 은혜", null, "성경 참조 없는 검색어");
check("롬 8장", { abbr: "롬", chapter: 8, verse: null, verseEnd: null, first: "롬8_1", count: 1 }, "'장' 마커가 있으면 장 단위 허용");

// v1.3.0: refOnly(쿼리가 구절 참조뿐인지) + 장 단위 prefix 보조 쿼리
function checkField(query, field, expected, label) {
    const r = parseBibleRef(query, "{약어}{장}_{절}");
    const got = r === null ? null : r[field];
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (ok) { pass++; console.log(`  ✅ ${label}: "${query}"`); }
    else {
        fail++;
        console.log(`  ❌ ${label}: "${query}"\n     기대: ${JSON.stringify(expected)}\n     실제: ${JSON.stringify(got)}`);
    }
}

console.log("— refOnly (순수 구절 검색 판별) —");
checkField("요 3:16", "refOnly", true, "구절만 → refOnly=true");
checkField("요 3:16 은혜", "refOnly", false, "구절+키워드 → refOnly=false");

console.log("— 보조 쿼리 (장 단위 prefix 확장) —");
checkField("시편 23편", "auxQueries", ["시23_", "시23_1", "시23"], "장 단위 → prefix 후보 포함 3개");
checkField("요3_16", "auxQueries", ["요3_16"], "절 단위 → 노트명 그대로 (회귀 가드)");
checkField("롬 3:10-12", "auxQueries", ["롬3_10", "롬3_11", "롬3_12"], "범위 → 절별 분리 (회귀 가드)");

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
