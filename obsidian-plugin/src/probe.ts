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

// 루프백 호스트는 하나로 통일하면 안 된다 — 실측: Omnisearch는 localhost로 listen해 OS에 따라
// ::1(IPv6)에만 바인딩되고, Local REST API는 127.0.0.1(IPv4)에 바인딩된다. requestUrl(Node 스택)의
// localhost 해석도 환경 의존이라, localhost 실패 시 127.0.0.1로 폴백해 둘 다 시도한다.
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1"];

async function omniSearchOnce(port: string, query: string, timeoutMs: number): Promise<Array<{ vault?: string }> | "down" | "unknown"> {
	for (const host of LOOPBACK_HOSTS) {
		try {
			const res = await withTimeout(
				requestUrl({ url: `http://${host}:${port}/search?q=${encodeURIComponent(query)}`, throw: false }),
				timeoutMs
			);
			if (res === "timeout") continue; // 다음 호스트로
			if (res.status < 200 || res.status >= 300) return "unknown";
			const items = res.json;
			return Array.isArray(items) ? items : "unknown";
		} catch {
			// 연결 거부는 reject로 온다 → 다음 호스트 시도
		}
	}
	return "down";
}

/** Omnisearch 서버 생존 + 볼트 정체성 판정: 이 볼트에 실존하는 파일명으로 검색해 응답의 vault 필드를 비교한다. */
export async function probeOmnisearch(app: App, port: string, timeoutMs = 3000): Promise<ProbeResult> {
	const myVault = app.vault.getName();
	const files = app.vault.getMarkdownFiles();
	const queries = [files[0]?.basename, files[1]?.basename, myVault].filter(Boolean) as string[];
	let sawEmpty = false;
	for (const q of queries.slice(0, 3)) {
		const r = await omniSearchOnce(port, q, timeoutMs);
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
	for (const host of LOOPBACK_HOSTS) {
		try {
			const res = await withTimeout(
				requestUrl({
					url: `http://${host}:${port}/`,
					headers: { Authorization: `Bearer ${key}` },
					throw: false,
				})
			);
			if (res === "timeout") continue;
			if (res.status === 401 || res.status === 403) return "conflict"; // 서버는 있는데 우리 키 거부 = 다른 볼트
			if (res.status < 200 || res.status >= 300) return "unknown";
			const auth = (res.json as { authenticated?: boolean } | null)?.authenticated;
			return auth === true ? "ok" : auth === false ? "conflict" : "unknown";
		} catch {
			// 연결 거부 → 다음 호스트
		}
	}
	return "down";
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

/** 특정 루프백 주소에 bind해 보는 테스트. IPv6 미지원(EADDRNOTAVAIL/EAFNOSUPPORT)은 free로 간주. */
function bindTest(port: number, host: string): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const net = require("net");
			const srv = net.createServer();
			srv.once("error", (e: NodeJS.ErrnoException) =>
				resolve(e?.code === "EADDRNOTAVAIL" || e?.code === "EAFNOSUPPORT")); // 스택 자체가 없으면 점유 아님
			srv.once("listening", () => srv.close(() => resolve(true)));
			srv.listen(port, host);
		} catch {
			resolve(false);
		}
	});
}

/**
 * 포트 빈자리 검사 — 실제 bind 테스트 (isDesktopOnly라 Node net 사용 가능).
 * 듀얼스택 필수: Omnisearch는 ::1에, Local REST는 127.0.0.1에 바인딩되므로
 * 둘 다 비어 있어야 진짜 빈 포트다 (127.0.0.1만 검사하면 ::1 점유 포트를 빈 것으로 오판).
 */
export async function isPortFree(port: number): Promise<boolean> {
	const [v4, v6] = await Promise.all([bindTest(port, "127.0.0.1"), bindTest(port, "::1")]);
	return v4 && v6;
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
	probe: (app: App, st: DepStatus, timeoutMs?: number) => Promise<ProbeResult>;
	apply: (app: App, port?: number) => Promise<boolean>;
	skipPorts: (st: DepStatus) => number[];
}

export interface ResolveOutcome {
	ok: boolean;
	port: number;
	moved: boolean; // 포트가 실제로 바뀌었는지 (설정 코드 재복사 필요)
	reason?: "unknown" | "restart" | "nofree" | "failed";
	// unknown: 서버가 응답 중이라 개입 안 함(인덱싱 중일 수 있음) / restart: 옵시디언 재시작 필요
	// nofree: 빈 포트 못 찾음 / failed: 플러그인 재시작 실패
}

/**
 * 포트 충돌 해결 공통 시퀀스 — 보수적으로:
 * - 포트 이동은 "다른 볼트의 응답 확인" 또는 "응답 없음 + 포트 점유"일 때만, 세션당 1회.
 * - unknown(응답은 있는데 정체 불명 — 인덱싱 중 등)이면 절대 건드리지 않는다.
 *   Omnisearch는 짧은 시간에 여러 번 재시작되면 캐시를 비우고 옵시디언 재시작을 요구하므로
 *   (Cache cleared 알림) 재시작 횟수를 최소화하는 것이 핵심이다.
 * - 순서가 중요: bind 테스트만으로는 "자기 서버"와 "남의 서버"를 구분할 수 없으므로 반드시 프로브 먼저.
 */
async function resolveConflict(app: App, spec: ResolveSpec): Promise<ResolveOutcome> {
	const st = await checkStatus(app);
	const cur = spec.getPort(st);
	const first = await spec.probe(app, st);
	if (first === "ok") return { ok: true, port: cur, moved: false }; // 자기 서버 정상 — 손대지 않음
	if (first === "unknown") return { ok: false, port: cur, moved: false, reason: "unknown" };

	// 방금 켠 서버는 인덱싱 때문에 응답이 늦을 수 있다 → 응답이 오기만 하면(자기 포트에 자기가 켠 서버) 성공으로 본다
	const waitAlive = async (): Promise<ProbeResult> => {
		let last: ProbeResult = "down";
		for (let i = 0; i < 5; i++) {
			await sleep(1500);
			last = await spec.probe(app, await checkStatus(app), 8000);
			if (last !== "down") break;
		}
		return last;
	};

	if (first === "down") {
		if (await isPortFree(cur)) {
			// 포트는 비어 있고 서버만 안 뜸 → 같은 포트로 재시작 1회. 포트는 옮기지 않는다.
			if (await spec.apply(app)) {
				const r = await waitAlive();
				if (r === "ok" || r === "unknown") return { ok: true, port: cur, moved: false };
			}
			return { ok: false, port: cur, moved: false, reason: "restart" };
		}
		// down인데 포트 점유 — 느린 서버일 수 있으니 여유를 두고 한 번 더 확인
		await sleep(3000);
		const again = await spec.probe(app, st, 8000);
		if (again === "ok") return { ok: true, port: cur, moved: false };
		if (again === "unknown") return { ok: false, port: cur, moved: false, reason: "unknown" };
		// 여전히 무응답 + 점유 = HTTP가 아닌 다른 프로세스가 잡고 있음 → 이동 대상
	}

	// 확정 충돌(다른 볼트 응답) 또는 무응답+점유 → 빈 포트로 딱 1회만 이동
	const next = await findFreePort(cur + 1, spec.skipPorts(st));
	if (next === null) return { ok: false, port: cur, moved: false, reason: "nofree" };
	if (!(await spec.apply(app, next))) return { ok: false, port: cur, moved: false, reason: "failed" };
	const r = await waitAlive();
	if (r === "ok" || r === "unknown") return { ok: true, port: next, moved: true };
	// 포트 설정은 옮겨졌지만 서버가 아직 안 뜸 (Omnisearch 캐시 재구축 등) → 옵시디언 재시작 후 정상화
	return { ok: false, port: next, moved: true, reason: "restart" };
}

/** Omnisearch HTTP 포트 충돌 해결. moved=true면 설정 코드를 다시 복사해야 한다. */
export function resolveOmniPortConflict(app: App): Promise<ResolveOutcome> {
	return resolveConflict(app, {
		getPort: (st) => Number(st.omniPort),
		probe: (app2, st, t) => probeOmnisearch(app2, st.omniPort, t),
		apply: (app2, port) => setOmnisearchHttp(app2, port),
		skipPorts: (st) => [st.restPort, 27124],
	});
}

/** Local REST HTTP 포트 충돌 해결. */
export function resolveRestPortConflict(app: App): Promise<ResolveOutcome> {
	return resolveConflict(app, {
		getPort: (st) => st.restPort,
		probe: (app2, st) => probeLocalRest(st.restPort, st.restKey),
		apply: (app2, port) => setRestHttp(app2, port),
		skipPorts: (st) => [Number(st.omniPort), 27124],
	});
}
