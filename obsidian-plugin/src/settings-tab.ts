import { App, Notice, PluginSettingTab, Setting, TFolder } from "obsidian";
import type A4POmnisearchPlugin from "./main";
import type { CategoryPaths } from "./main";
import { FolderSuggest } from "./folder-suggest";
import {
	DepStatus,
	OMNI_ID,
	REST_ID,
	checkStatus,
	enableOmnisearchHttp,
	enableRestHttp,
	openPluginInstallPage,
} from "./status";

export class A4PSettingTab extends PluginSettingTab {
	plugin: A4POmnisearchPlugin;

	constructor(app: App, plugin: A4POmnisearchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "A4P Omnisearch Helper" });
		containerEl.createEl("p", {
			text: "구글·네이버·Bing·유튜브 검색 옆에 내 볼트를 띄우는 A4P 통합검색의 설정 도우미입니다. 아래 체크리스트가 모두 ✅가 되면 [설정 코드 복사]를 눌러 브라우저 위젯의 ⚡ 버튼에 붙여넣으세요.",
			cls: "a4p-desc",
		});
		this.renderDashboard(containerEl.createDiv({ cls: "a4p-dashboard" }));

		this.renderCategorySection(containerEl);

		new Setting(containerEl)
			.setName("성경구절 노트 이름 형식")
			.setDesc("볼트의 성경구절 노트 파일명 형식. 기본 {약어}{장}_{절} → 요3_16. 설정 코드에 함께 담깁니다.")
			.addText((t) =>
				t.setValue(this.plugin.settings.bibleFormat).onChange(async (v) => {
					this.plugin.settings.bibleFormat = v.trim() || "{약어}{장}_{절}";
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("설정 코드 복사")
			.setDesc("⚠️ 코드에 Local REST API 키와 볼트 경로가 들어 있습니다. 다른 사람과 공유하지 마세요.")
			.addButton((b) =>
				b.setButtonText("📋 설정 코드 복사")
					.setCta()
					.onClick(() => this.plugin.copySetupCode())
			);
	}

	/** 카테고리별 자료 위치 — 위젯의 설교/조각/묵상/성경/주석 칩이 이 경로 키워드로 분류된다. */
	private renderCategorySection(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "자료 위치 (카테고리 필터)" });
		containerEl.createEl("p", {
			text: "검색 위젯의 [설교][조각][묵상][성경][주석] 칩이 노트를 분류할 때 쓰는 폴더 위치입니다. 노트 경로에 아래 텍스트가 포함되면 해당 카테고리로 잡힙니다 (콤마로 여러 개). 설정 코드에 함께 담겨 위젯에 자동 적용됩니다.",
			cls: "a4p-desc",
		});

		new Setting(containerEl)
			.setName("🔍 내 볼트에서 자동 감지")
			.setDesc("볼트의 폴더 이름을 훑어서 설교·조각·묵상·성경·주석 폴더를 자동으로 찾아 채웁니다.")
			.addButton((b) =>
				b.setButtonText("자동 감지").onClick(async () => {
					const found = this.detectCategoryFolders();
					this.plugin.settings.cats = found;
					await this.plugin.saveSettings();
					new Notice("폴더 자동 감지 완료 — 결과를 확인하고 필요하면 수정하세요.");
					this.display();
				})
			);

		const catField = (key: keyof CategoryPaths, name: string, desc: string) => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((t) => {
					t.setPlaceholder("폴더 경로 또는 키워드, 콤마로 여러 개")
						.setValue(this.plugin.settings.cats[key])
						.onChange(async (v) => {
							this.plugin.settings.cats[key] = v.trim();
							await this.plugin.saveSettings();
						});
					// 폴더 자동완성: 입력하면 볼트의 실제 폴더가 드롭다운으로 뜬다 (오타 방지)
					new FolderSuggest(this.app, t.inputEl, async (v) => {
						this.plugin.settings.cats[key] = v;
						await this.plugin.saveSettings();
					});
				});
		};
		catField("sermon", "설교", "설교 원고가 있는 폴더");
		catField("frag", "조각", "설교조각·강의조각 등 조각 메모 폴더");
		catField("devo", "묵상", "묵상·큐티 노트 폴더");
		catField("bible", "성경", "성경구절 노트 폴더");
		catField("comm", "주석", "주석·강해 자료 폴더");
	}

	/** 볼트 폴더명을 스캔해 카테고리별 후보 폴더를 찾는다. 조각을 먼저 잡아 '설교조각'이 설교로 새지 않게 한다. */
	private detectCategoryFolders(): CategoryPaths {
		const buckets: Record<keyof CategoryPaths, string[]> = { sermon: [], frag: [], devo: [], bible: [], comm: [] };
		const rules: Array<[keyof CategoryPaths, RegExp]> = [
			["frag", /조각/],
			["bible", /성경/],
			["devo", /묵상|큐티|qt/i],
			["comm", /주석|강해/],
			["sermon", /설교|sermon/i],
		];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			if (!(f instanceof TFolder) || !f.name) continue;
			for (const [key, re] of rules) {
				if (re.test(f.name)) {
					buckets[key].push(f.path);
					break; // 첫 매칭 카테고리에만 배정
				}
			}
		}
		const d = this.plugin.settings.cats;
		const join = (key: keyof CategoryPaths, fallback: string) =>
			buckets[key].length ? buckets[key].slice(0, 6).join(",") : fallback;
		return {
			sermon: join("sermon", d.sermon),
			frag: join("frag", d.frag),
			devo: join("devo", d.devo),
			bible: join("bible", d.bible),
			comm: join("comm", d.comm),
		};
	}

	private renderDashboard(el: HTMLElement): void {
		el.createEl("p", { text: "상태 확인 중…", cls: "a4p-loading" });
		void checkStatus(this.app).then((st) => {
			el.empty();
			this.renderRows(el, st);
		});
	}

	private renderRows(el: HTMLElement, st: DepStatus): void {
		const row = (
			ok: boolean,
			name: string,
			okText: string,
			fixText: string,
			fixLabel: string | null,
			onFix: (() => Promise<void> | void) | null
		) => {
			const s = new Setting(el).setName(`${ok ? "✅" : "❌"} ${name}`).setDesc(ok ? okText : fixText);
			if (!ok && fixLabel && onFix) {
				s.addButton((b) =>
					b.setButtonText(fixLabel)
						.setCta()
						.onClick(async () => {
							await onFix();
							this.display(); // 재진단 후 다시 그림
						})
				);
			}
		};

		row(
			st.omniInstalled,
			"Omnisearch 플러그인",
			"설치되어 있습니다.",
			"검색 엔진 역할을 하는 필수 플러그인이 없습니다.",
			"설치 화면 열기",
			() => openPluginInstallPage(OMNI_ID)
		);
		if (st.omniInstalled) {
			row(
				st.omniHttp && st.omniEnabled,
				`Omnisearch HTTP 서버 (포트 ${st.omniPort})`,
				"브라우저에서 이 볼트를 검색할 수 있습니다.",
				"브라우저가 볼트를 검색하려면 HTTP 서버를 켜야 합니다.",
				"⚡ 자동 설정",
				async () => {
					const ok = await enableOmnisearchHttp(this.app);
					new Notice(ok ? "Omnisearch HTTP 서버를 켰습니다 ✅" : "자동 설정 실패 — Omnisearch 설정에서 'HTTP server'를 직접 켜 주세요.");
				}
			);
		}
		row(
			st.restInstalled,
			"Local REST API 플러그인 (선택)",
			"설치되어 있습니다.",
			"없어도 검색은 되지만, 본문 미리보기·신학(doctrine) 칩·성경구절 칩을 쓰려면 필요합니다.",
			"설치 화면 열기",
			() => openPluginInstallPage(REST_ID)
		);
		if (st.restInstalled) {
			row(
				st.restHttp && st.restEnabled,
				`Local REST API HTTP 서버 (포트 ${st.restPort})`,
				"본문 미리보기와 칩 표시가 가능합니다.",
				"본문 미리보기용 HTTP 서버(비암호화, 로컬 전용)가 꺼져 있습니다.",
				"⚡ 자동 설정",
				async () => {
					const ok = await enableRestHttp(this.app);
					new Notice(ok ? "Local REST API HTTP 서버를 켰습니다 ✅" : "자동 설정 실패 — Local REST API 설정에서 'Enable Non-encrypted (HTTP) Server'를 직접 켜 주세요.");
				}
			);
		}
	}
}
