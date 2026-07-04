import { Notice, Plugin } from "obsidian";
import { buildSetupCode } from "./setup-code";
import { checkStatus } from "./status";
import { A4PSettingTab } from "./settings-tab";

/** 카테고리별 자료 위치 (콤마로 여러 폴더). 위젯의 카테고리 칩 필터에 사용된다. */
export interface CategoryPaths {
	sermon: string;
	frag: string;
	devo: string;
	bible: string;
	comm: string;
}

interface A4PSettings {
	bibleFormat: string;
	cats: CategoryPaths;
	onboarded: boolean;
}

const DEFAULT_SETTINGS: A4PSettings = {
	bibleFormat: "{약어}{장}_{절}",
	cats: {
		sermon: "설교",
		frag: "설교조각,강의조각",
		devo: "묵상,큐티,QT",
		bible: "성경",
		comm: "주석,강해",
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

		// 첫 활성화 시 온보딩 안내
		if (!this.settings.onboarded) {
			this.settings.onboarded = true;
			await this.saveSettings();
			new Notice("A4P Omnisearch Helper가 켜졌습니다.\n설정 탭에서 체크리스트를 확인하고 [설정 코드 복사]를 눌러 주세요.", 8000);
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
		const st = await checkStatus(this.app);
		const mark = (b: boolean) => (b ? "✅" : "❌");
		new Notice(
			[
				`${mark(st.omniInstalled)} Omnisearch 설치`,
				`${mark(st.omniHttp && st.omniEnabled)} Omnisearch HTTP 서버 (포트 ${st.omniPort})`,
				`${mark(st.restInstalled)} Local REST API 설치 (선택)`,
				`${mark(st.restHttp && st.restEnabled)} Local REST HTTP 서버 (포트 ${st.restPort})`,
				"자세한 해결은 설정 탭 → A4P Omnisearch Helper",
			].join("\n"),
			10000
		);
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<A4PSettings>;
		this.settings = {
			...DEFAULT_SETTINGS,
			...data,
			cats: { ...DEFAULT_SETTINGS.cats, ...(data.cats ?? {}) },
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
