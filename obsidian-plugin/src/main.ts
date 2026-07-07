import { Notice, Plugin } from "obsidian";
import { buildSetupCode } from "./setup-code";
import { A4PSettingTab } from "./settings-tab";
import {
	ProbeResult,
	checkLiveStatus,
	resolveOmniPortConflict,
	resolveRestPortConflict,
} from "./probe";

export type CategoryKey = "sermon" | "frag" | "devo" | "bible" | "comm";

/** 내부 저장용: 카테고리별 폴더 목록 (행 단위 UI). */
export type CategoryFolders = Record<CategoryKey, string[]>;

/** 설정 코드 wire format: 콤마 join 문자열 (유저스크립트 하위호환). */
export type CategoryPaths = Record<CategoryKey, string>;

export const CATEGORY_KEYS: CategoryKey[] = ["sermon", "frag", "devo", "bible", "comm"];

interface A4PSettings {
	bibleFormat: string;
	cats: CategoryFolders;
	onboarded: boolean;
}

const DEFAULT_SETTINGS: A4PSettings = {
	bibleFormat: "{약어}{장}_{절}",
	cats: {
		sermon: ["설교"],
		frag: ["설교조각", "강의조각"],
		devo: ["묵상", "큐티", "QT"],
		bible: ["성경"],
		comm: ["주석", "강해"],
	},
	onboarded: false,
};

export default class A4POmnisearchPlugin extends Plugin {
	settings: A4PSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new A4PSettingTab(this.app, this));

		this.addRibbonIcon("search", "A4P 통합검색: 설정 코드 복사", () => {
			void this.copySetupCode();
		});

		this.addCommand({
			id: "copy-setup-code",
			name: "검색 설정 코드 복사 (브라우저 위젯 ⚡에 붙여넣기)",
			callback: () => void this.copySetupCode(),
		});

		this.addCommand({
			id: "check-status",
			name: "연결 상태 진단",
			callback: () => void this.showStatus(),
		});

		// 멀티볼트 포트 충돌 자동 해결: 워크스페이스 준비 + 의존 플러그인 기동 대기 후 프로브.
		// HTTP를 아직 안 켠 볼트(온보딩 전)에는 개입하지 않는다 — ⚡ 자동 설정을 누를 때만.
		this.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => void this.autoResolveConflicts(), 4000);
		});

		// 첫 활성화 시 온보딩 안내
		if (!this.settings.onboarded) {
			this.settings.onboarded = true;
			await this.saveSettings();
			new Notice("A4P Omnisearch Helper가 켜졌습니다.\n설정 탭에서 체크리스트를 확인하고 [설정 코드 복사]를 눌러 주세요.", 8000);
		}
	}

	/**
	 * 볼트 시작 시 포트 충돌(다른 볼트의 서버가 확정 응답)만 자동으로 빈 포트로 이동시킨다.
	 * down/unknown(서버 기동·인덱싱 지연)에는 개입하지 않는다 — Omnisearch를 반복 재시작시키면
	 * 캐시가 비워져 "Restart Obsidian" 상태에 빠진다.
	 */
	private async autoResolveConflicts(): Promise<void> {
		try {
			const st = await checkLiveStatus(this.app);
			let moved = false;
			let needRestart = false;
			if (st.omniHttp && st.omniEnabled && st.omniProbe === "conflict") {
				const r = await resolveOmniPortConflict(this.app);
				if (r.moved) {
					moved = true;
					new Notice(`⚠️ 다른 볼트와 포트가 겹쳐 Omnisearch 포트를 ${r.port}(으)로 옮겼습니다.`, 12000);
					if (!r.ok && r.reason === "restart") needRestart = true;
				}
			}
			if (st.restHttp && st.restEnabled && st.restProbe === "conflict") {
				const r = await resolveRestPortConflict(this.app);
				if (r.moved) {
					moved = true;
					new Notice(`⚠️ 다른 볼트와 포트가 겹쳐 Local REST 포트를 ${r.port}(으)로 옮겼습니다.`, 12000);
					if (!r.ok && r.reason === "restart") needRestart = true;
				}
			}
			if (needRestart) {
				new Notice("🔁 서버가 아직 준비되지 않았습니다 — 옵시디언을 재시작하면 새 포트로 정상 동작합니다.", 15000);
			}
			if (moved) {
				new Notice("📋 포트가 바뀌었습니다 — 설정 코드를 다시 복사해 브라우저 위젯 ⚡에 붙여넣어 주세요.", 15000);
			}
		} catch {
			// 자동 점검 실패는 조용히 넘어감 — 설정 탭 재검사로 언제든 확인 가능
		}
	}

	async copySetupCode(): Promise<void> {
		const { code, status } = await buildSetupCode(this.app, this.settings.bibleFormat, this.settings.cats);
		if (!status.omniHttp || !status.omniEnabled) {
			new Notice("⚠️ Omnisearch HTTP 서버가 꺼져 있습니다.\n설정 탭의 [⚡ 자동 설정]을 먼저 눌러 주세요.", 8000);
			return;
		}
		await navigator.clipboard.writeText(code);
		const restNote = status.restHttp && status.restKey ? "" : "\n(Local REST API 미설정 — 본문 미리보기 없이 동작)";
		new Notice("설정 코드를 복사했습니다 📋\n브라우저 검색 위젯의 ⚡ 버튼에 붙여넣으세요." + restNote + "\n⚠️ 이 코드는 다른 사람과 공유하지 마세요.", 10000);
	}

	async showStatus(): Promise<void> {
		const st = await checkLiveStatus(this.app);
		const mark = (b: boolean) => (b ? "✅" : "❌");
		const probeMark = (p: ProbeResult) => (p === "ok" ? "✅" : p === "down" ? "❌" : "⚠️");
		const probeText = (p: ProbeResult) =>
			p === "ok" ? "응답 확인" : p === "conflict" ? "다른 볼트가 포트 사용 중" : p === "unknown" ? "응답 확인 불가" : "응답 없음";
		new Notice(
			[
				`${mark(st.omniInstalled)} Omnisearch 설치`,
				`${probeMark(st.omniProbe)} Omnisearch HTTP 서버 (포트 ${st.omniPort}) — ${probeText(st.omniProbe)}`,
				`${mark(st.restInstalled)} Local REST API 설치 (선택)`,
				`${probeMark(st.restProbe)} Local REST HTTP 서버 (포트 ${st.restPort}) — ${probeText(st.restProbe)}`,
				"자세한 해결은 설정 탭 → A4P Omnisearch Helper",
			].join("\n"),
			10000
		);
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<A4PSettings> & { cats?: unknown };
		// cats 마이그레이션: 구버전 콤마 문자열·신버전 배열 어느 쪽이 와도 배열로 흡수
		const toArr = (v: unknown): string[] | null =>
			Array.isArray(v)
				? v.map(String).map((s) => s.trim()).filter(Boolean)
				: typeof v === "string"
					? v.split(",").map((s) => s.trim()).filter(Boolean)
					: null;
		const rawCats = (data.cats ?? {}) as Record<string, unknown>;
		const cats = {} as CategoryFolders;
		for (const k of CATEGORY_KEYS) cats[k] = toArr(rawCats[k]) ?? [...DEFAULT_SETTINGS.cats[k]];
		this.settings = {
			...DEFAULT_SETTINGS,
			...data,
			cats,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
