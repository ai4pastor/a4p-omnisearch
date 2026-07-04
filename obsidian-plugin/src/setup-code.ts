import { App, FileSystemAdapter } from "obsidian";
import { checkStatus, DepStatus } from "./status";
import type { CategoryPaths } from "./main";

/**
 * 브라우저 유저스크립트(⚡ 버튼)에 붙여넣는 설정 코드 페이로드.
 * ⚠️ restKey(API 키)와 root(절대경로)가 포함되므로 다른 사람과 공유하면 안 된다.
 */
export interface SetupPayload {
	v: 1;
	vault: string; // obsidian:// 딥링크용 볼트 이름
	label?: string; // 위젯 배지 표시명
	omniPort: string;
	restPort?: number;
	restKey?: string;
	root?: string; // 절대경로 복사 기능용 볼트 루트
	bibleFormat?: string; // 성경구절 노트 이름 형식
	cats?: CategoryPaths; // 카테고리별 자료 위치 (위젯 칩 필터 자동 설정)
}

/** UTF-8 안전 base64url (한글 볼트 이름 대응) */
export function encodeSetupCode(payload: SetupPayload): string {
	const bytes = new TextEncoder().encode(JSON.stringify(payload));
	let bin = "";
	bytes.forEach((b) => (bin += String.fromCharCode(b)));
	const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return "A4P1:" + b64;
}

export async function buildSetupCode(
	app: App,
	bibleFormat: string,
	cats?: CategoryPaths
): Promise<{ code: string; status: DepStatus }> {
	const status = await checkStatus(app);
	const adapter = app.vault.adapter;
	const payload: SetupPayload = {
		v: 1,
		vault: app.vault.getName(),
		label: app.vault.getName(),
		omniPort: status.omniPort,
		bibleFormat: bibleFormat || "{약어}{장}_{절}",
	};
	if (cats) payload.cats = cats;
	if (status.restHttp && status.restKey) {
		payload.restPort = status.restPort;
		payload.restKey = status.restKey;
	}
	if (adapter instanceof FileSystemAdapter) payload.root = adapter.getBasePath();
	return { code: encodeSetupCode(payload), status };
}
