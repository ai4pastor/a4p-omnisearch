import { App, requestUrl } from "obsidian";
import { DepStatus, checkStatus, setOmnisearchHttp, setRestHttp } from "./status";

/**
 * 실검증 프로브 — 설정 플래그가 아니라 실제 HTTP 응답으로 판정한다.
 *   ok       서버가 살아 있고 "이 볼트"의 서버가 맞음
 *   conflict 서버는 응답하지만 다른 볼트의 서버 (포트 충돌)
 *   unknown  서버는 응답하지만 이 볼트인지 확인 불가
 *   down     응답 없음 (서버 안 뜸 / 포트 바인딩 실패)
 */
export type ProbeResult = "ok" | "conflict" | "unknown" | "down";

export interface LiveStatus extends DepStatus {
	omniProbe: ProbeResult;
	restProbe: ProbeResult;
}

// requestUrl에는 타임아웃 옵션이 없어 race로 자른다. 진 요청은 백그라운드에 남지만 무해.
const withTimeout = <T>(p: Promise<T>, ms = 3000): Promise<T | "timeout"> =>
	Promise.race([p, new Promise<"timeout">((r) => window.setTimeout(() => r("timeout"), ms))]);

async function omniSearchOnce(port: string, query: string): Promise<Array<{ vault?: string }> | "down" | "unknown"> {
	try {
		const res = await withTimeout(
			requestUrl({ url: `http://localhost:${port}/search?q=${encodeURIComponent(query)}`, throw: false })
		);
		if (res === "timeout") return "down";
		if (res.status < 200 || res.status >= 300) return "unknown";
		const items = res.json;
		return Array.isArray(items) ? items : "unknown";
	} catch {
		return "down"; // 연결 거부는 reject로 온다
	}
}

/** Omnisearch 서버 생존 + 볼트 정체성 판정: 이 볼트에 실존하는 파일명으로 검색해 응답의 vault 필드를 비교한다. */
export async function probeOmnisearch(app: App, port: string): Promise<ProbeResult> {
	const myVault = app.vault.getName();
	const files = app.vault.getMarkdownFiles();
	const queries = [files[0]?.basename, files[1]?.basename, myVault].filter(Boolean) as string[];
	let sawEmpty = false;
	for (const q of queries.slice(0, 3)) {
		const r = await omniSearchOnce(port, q);
		if (r === "down") return "down";
		if (r === "unknown") return "unknown";
		if (r.length === 0) {
			sawEmpty = true;
			continue; // 다른 쿼리로 재시도
		}
		return r.some((it) => it.vault === myVault) ? "ok" : "conflict";
	}
	return sawEmpty ? "unknown" : "down";
}

/** Local REST 서버 생존 + 정체성 판정: 볼트별 랜덤 API 키가 인증되면 이 볼트의 서버가 확실하다. */
export async function probeLocalRest(port: number, key: string): Promise<ProbeResult> {
	if (!key) return "down"; // 키 미생성(설치 전) — 프로브 불가
	try {
		const res = await withTimeout(
			requestUrl({
				url: `http://127.0.0.1:${port}/`,
				headers: { Authorization: `Bearer ${key}` },
				throw: false,
			})
		);
		if (res === "timeout") return "down";
		if (res.status === 401 || res.status === 403) return "conflict"; // 서버는 있는데 우리 키 거부 = 다른 볼트
		if (res.status < 200 || res.status >= 300) return "unknown";
		const auth = (res.json as { authenticated?: boolean } | null)?.authenticated;
		return auth === true ? "ok" : auth === false ? "conflict" : "unknown";
	} catch {
		return "down";
	}
}

/** 플래그 검사(checkStatus) + 실검증 프로브 2건 병렬. */
export async function checkLiveStatus(app: App): Promise<LiveStatus> {
	const st = await checkStatus(app);
	const [omniProbe, restProbe] = await Promise.all([
		probeOmnisearch(app, st.omniPort),
		st.restInstalled ? probeLocalRest(st.restPort, st.restKey) : Promise.resolve<ProbeResult>("down"),
	]);
	return { ...st, omniProbe, restProbe };
}

/** 포트 빈자리 검사 — 실제 bind 테스트 (isDesktopOnly라 Node net 사용 가능). */
export function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const net = require("net");
			const srv = net.createServer();
			srv.once("error", () => resolve(false)); // EADDRINUSE 등
			srv.once("listening", () => srv.close(() => resolve(true)));
			srv.listen(port, "127.0.0.1");
		} catch {
			resolve(false);
		}
	});
}

/** start부터 +1씩 최대 20개 스캔해 빈 포트를 찾는다. skip 목록(상대 서비스 포트 등)은 건너뜀. */
export async function findFreePort(start: number, skip: number[]): Promise<number | null> {
	for (let p = start; p < start + 20; p++) {
		if (p < 1024 || p > 65535 || skip.includes(p)) continue;
		if (await isPortFree(p)) return p;
	}
	return null;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

interface ResolveSpec {
	getPort: (st: DepStatus) => number;
	probe: (app: App, st: DepStatus) => Promise<ProbeResult>;
	apply: (app: App, port?: number) => Promise<boolean>;
	skipPorts: (st: DepStatus) => number[];
}

/**
 * 포트 충돌 해결 공통 시퀀스.
 * 순서가 중요: bind 테스트만으로는 "자기 서버"와 "남의 서버"를 구분할 수 없으므로 반드시 프로브 먼저.
 */
async function resolveConflict(app: App, spec: ResolveSpec): Promise<{ ok: boolean; port: number }> {
	const st = await checkStatus(app);
	const cur = spec.getPort(st);
	const first = await spec.probe(app, st);
	if (first === "ok") return { ok: true, port: cur }; // 자기 서버가 정상 — 손대지 않음

	if (first === "down" && (await isPortFree(cur))) {
		// 포트는 비어 있는데 서버가 안 뜸 → 같은 포트로 재시작만
		if (await spec.apply(app)) {
			for (let i = 0; i < 3; i++) {
				await sleep(1000);
				if ((await spec.probe(app, await checkStatus(app))) === "ok") return { ok: true, port: cur };
			}
		}
	}

	// 충돌/정체불명/재시작 실패 → 빈 포트로 이동 (동시 스캔 race 대비 후보 2개까지 시도)
	let searchFrom = cur + 1;
	for (let attempt = 0; attempt < 2; attempt++) {
		const next = await findFreePort(searchFrom, spec.skipPorts(st));
		if (next === null) break;
		if (await spec.apply(app, next)) {
			for (let i = 0; i < 3; i++) {
				await sleep(1000); // enablePlugin 직후 서버 기동 지연 흡수 — 없으면 재충돌로 오판하는 루프 위험
				if ((await spec.probe(app, await checkStatus(app))) === "ok") return { ok: true, port: next };
			}
		}
		searchFrom = next + 1;
	}
	return { ok: false, port: cur };
}

/** Omnisearch HTTP 포트 충돌 해결. 성공 시 새 포트 반환 — 설정 코드를 다시 복사해야 한다. */
export function resolveOmniPortConflict(app: App): Promise<{ ok: boolean; port: number }> {
	return resolveConflict(app, {
		getPort: (st) => Number(st.omniPort),
		probe: (app2, st) => probeOmnisearch(app2, st.omniPort),
		apply: (app2, port) => setOmnisearchHttp(app2, port),
		skipPorts: (st) => [st.restPort, 27124],
	});
}

/** Local REST HTTP 포트 충돌 해결. */
export function resolveRestPortConflict(app: App): Promise<{ ok: boolean; port: number }> {
	return resolveConflict(app, {
		getPort: (st) => st.restPort,
		probe: (app2, st) => probeLocalRest(st.restPort, st.restKey),
		apply: (app2, port) => setRestHttp(app2, port),
		skipPorts: (st) => [Number(st.omniPort), 27124],
	});
}
