import { App } from "obsidian";

export const OMNI_ID = "omnisearch";
export const REST_ID = "obsidian-local-rest-api";

/** 의존 플러그인 4항목 진단 결과 */
export interface DepStatus {
	omniInstalled: boolean;
	omniEnabled: boolean;
	omniHttp: boolean; // Omnisearch HTTP 서버(httpApiEnabled)
	omniPort: string;
	restInstalled: boolean;
	restEnabled: boolean;
	restHttp: boolean; // Local REST API 비암호화 HTTP 서버(enableInsecureServer)
	restPort: number;
	restKey: string;
}

async function readPluginData(app: App, id: string): Promise<Record<string, unknown> | null> {
	const path = `${app.vault.configDir}/plugins/${id}/data.json`;
	try {
		if (!(await app.vault.adapter.exists(path))) return null;
		return JSON.parse(await app.vault.adapter.read(path));
	} catch {
		return null;
	}
}

async function patchPluginData(app: App, id: string, patch: Record<string, unknown>): Promise<void> {
	const path = `${app.vault.configDir}/plugins/${id}/data.json`;
	const data = (await readPluginData(app, id)) ?? {};
	Object.assign(data, patch);
	await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
}

// 커뮤니티 플러그인 레지스트리 (obsidian 타입 정의에 없는 내부 API라 any 캐스팅)
function pluginRegistry(app: App): any {
	return (app as any).plugins;
}

export async function checkStatus(app: App): Promise<DepStatus> {
	const reg = pluginRegistry(app);
	const omni = reg?.plugins?.[OMNI_ID];
	const rest = reg?.plugins?.[REST_ID];
	const omniData = await readPluginData(app, OMNI_ID);
	const restData = await readPluginData(app, REST_ID);
	// 로드된 인스턴스의 settings가 최신, 없으면 data.json으로 폴백
	const omniSettings: any = omni?.settings ?? omniData ?? {};
	const restSettings: any = rest?.settings ?? restData ?? {};
	return {
		omniInstalled: !!(omni || omniData !== null || reg?.manifests?.[OMNI_ID]),
		omniEnabled: !!omni,
		omniHttp: !!omniSettings.httpApiEnabled,
		omniPort: String(omniSettings.httpApiPort ?? "51361"),
		restInstalled: !!(rest || restData !== null || reg?.manifests?.[REST_ID]),
		restEnabled: !!rest,
		restHttp: !!restSettings.enableInsecureServer,
		restPort: Number(restSettings.insecurePort ?? 27123),
		restKey: String(restSettings.apiKey ?? ""),
	};
}

/**
 * 플러그인 설정을 data.json에 패치하고 재시작해서 반영한다.
 * 순서가 중요: 먼저 끄고(플러그인이 종료 시 메모리 설정을 다시 쓰는 경우 대비) → 패치 → 켠다.
 */
async function patchAndRestart(app: App, id: string, patch: Record<string, unknown>): Promise<boolean> {
	const reg = pluginRegistry(app);
	if (!reg?.manifests?.[id] && (await readPluginData(app, id)) === null) return false;
	try {
		const wasEnabled = !!reg.plugins?.[id];
		if (wasEnabled) await reg.disablePlugin(id);
		await patchPluginData(app, id, patch);
		await reg.enablePlugin(id);
		return true;
	} catch {
		return false;
	}
}

/** Omnisearch HTTP 서버 켜기 (수강생 원클릭용) */
export async function enableOmnisearchHttp(app: App): Promise<boolean> {
	return patchAndRestart(app, OMNI_ID, { httpApiEnabled: true });
}

/** Local REST API 비암호화 HTTP 서버 켜기 (수강생 원클릭용) */
export async function enableRestHttp(app: App): Promise<boolean> {
	return patchAndRestart(app, REST_ID, { enableInsecureServer: true });
}

/** 커뮤니티 플러그인 설치 화면 열기 (미설치 플러그인 안내) */
export function openPluginInstallPage(id: string): void {
	window.open(`obsidian://show-plugin?id=${encodeURIComponent(id)}`);
}
