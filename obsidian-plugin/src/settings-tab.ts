import { App, Notice, PluginSettingTab, Setting, TFolder } from "obsidian";
import type A4POmnisearchPlugin from "./main";
import type { CategoryFolders, CategoryKey } from "./main";
import { FolderSuggest } from "./folder-suggest";
import { OMNI_ID, REST_ID, openPluginInstallPage, setOmnisearchHttp, setRestHttp } from "./status";
import {
	LiveStatus,
	ProbeResult,
	checkLiveStatus,
	resolveOmniPortConflict,
	resolveRestPortConflict,
} from "./probe";

export class A4PSettingTab extends PluginSettingTab {
	plugin: A4POmnisearchPlugin;
	private dashEl: HTMLElement | null = null;
	private lastStatus: LiveStatus | null = null;

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
		this.dashEl = containerEl.createDiv({ cls: "a4p-dashboard" });
		void this.renderDashboard();

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
			.setDesc("⚠️ 코드에 Local REST API 키와 볼트 경로가 들어 있습니다. 다른 사람과 공유하지 마세요. 포트가 바뀌면 코드를 다시 복사해 붙여넣어야 합니다.")
			.addButton((b) =>
				b.setButtonText("📋 설정 코드 복사")
					.setCta()
					.onClick(() => this.plugin.copySetupCode())
			);
	}

	// ---------- 카테고리 폴더 (행 단위 UI) ----------

	/** 카테고리별 자료 위치 — 위젯의 설교/조각/묵상/성경/주석 칩이 이 경로 키워드로 분류된다. */
	private renderCategorySection(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "자료 위치 (카테고리 필터)" });
		containerEl.createEl("p", {
			text: "검색 위젯의 [설교][조각][묵상][성경][주석] 칩이 노트를 분류할 때 쓰는 폴더 위치입니다. 노트 경로에 아래 폴더 이름이 포함되면 해당 카테고리로 잡힙니다. 폴더는 카테고리마다 여러 개 추가할 수 있고, 설정 코드에 함께 담겨 위젯에 자동 적용됩니다.",
			cls: "a4p-desc",
		});

		new Setting(containerEl)
			.setName("🔍 내 볼트에서 자동 감지")
			.setDesc("볼트의 폴더 이름을 훑어서 설교·조각·묵상·성경·주석 폴더를 자동으로 찾아 채웁니다.")
			.addButton((b) =>
				b.setButtonText("자동 감지").onClick(async () => {
					this.plugin.settings.cats = this.detectCategoryFolders();
					await this.plugin.saveSettings();
					new Notice("폴더 자동 감지 완료 — 결과를 확인하고 필요하면 수정하세요.");
					for (const key of Object.keys(this.catSections) as CategoryKey[]) {
						this.renderCategoryRows(key);
					}
				})
			);

		const defs: Array<[CategoryKey, string, string]> = [
			["sermon", "설교", "설교 원고가 있는 폴더"],
			["frag", "조각", "설교조각·강의조각 등 조각 메모 폴더"],
			["devo", "묵상", "묵상·큐티 노트 폴더"],
			["bible", "성경", "성경구절 노트 폴더"],
			["comm", "주석", "주석·강해 자료 폴더"],
		];
		for (const [key, name, desc] of defs) {
			this.catSections[key] = { el: containerEl.createDiv({ cls: "a4p-cat-section" }), name, desc };
			this.renderCategoryRows(key);
		}
	}

	private catSections: Partial<Record<CategoryKey, { el: HTMLElement; name: string; desc: string }>> = {};

	/** 한 카테고리의 폴더 행 목록만 다시 그린다 (전체 display() 재호출 금지 — 프로브 재실행·스크롤 튐 방지). */
	private renderCategoryRows(key: CategoryKey): void {
		const section = this.catSections[key];
		if (!section) return;
		const { el, name, desc } = section;
		el.empty();
		const folders = this.plugin.settings.cats[key];

		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.setHeading()
			.addButton((b) =>
				b.setButtonText("＋ 폴더 추가").onClick(async () => {
					folders.push("");
					await this.plugin.saveSettings();
					this.renderCategoryRows(key);
				})
			);

		if (!folders.length) {
			el.createEl("p", { text: "폴더가 없습니다 — [＋ 폴더 추가]를 눌러 등록하세요.", cls: "a4p-desc a4p-cat-empty" });
			return;
		}

		folders.forEach((path, i) => {
			const row = new Setting(el);
			row.settingEl.addClass("a4p-folder-row");
			row.addText((t) => {
				t.setPlaceholder("폴더 경로 (입력하면 자동완성)")
					.setValue(path)
					.onChange(async (v) => {
						this.plugin.settings.cats[key][i] = v.trim();
						await this.plugin.saveSettings();
					});
				t.inputEl.addClass("a4p-folder-input");
				// 폴더 자동완성: 입력하면 볼트의 실제 폴더가 드롭다운으로 뜬다 (오타 방지)
				new FolderSuggest(this.app, t.inputEl);
			});
			row.addExtraButton((b) =>
				b.setIcon("trash-2")
					.setTooltip("이 폴더 제거")
					.onClick(async () => {
						this.plugin.settings.cats[key].splice(i, 1);
						await this.plugin.saveSettings();
						this.renderCategoryRows(key);
					})
			);
		});
	}

	/** 볼트 폴더명을 스캔해 카테고리별 후보 폴더를 찾는다. 조각을 먼저 잡아 '설교조각'이 설교로 새지 않게 한다. */
	private detectCategoryFolders(): CategoryFolders {
		const buckets: Record<CategoryKey, string[]> = { sermon: [], frag: [], devo: [], bible: [], comm: [] };
		const rules: Array<[CategoryKey, RegExp]> = [
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
		const pick = (key: CategoryKey) => (buckets[key].length ? buckets[key].slice(0, 6) : [...d[key]]);
		return { sermon: pick("sermon"), frag: pick("frag"), devo: pick("devo"), bible: pick("bible"), comm: pick("comm") };
	}

	// ---------- 상태 대시보드 (실검증 프로브) ----------

	private async renderDashboard(): Promise<void> {
		const el = this.dashEl;
		if (!el) return;
		el.empty();
		el.createEl("p", { text: "상태 확인 중… (실제 서버 응답을 검사합니다)", cls: "a4p-loading" });
		const st = await checkLiveStatus(this.app);
		this.lastStatus = st;
		if (el !== this.dashEl) return; // 탭이 다시 그려졌으면 버림
		el.empty();
		this.renderRows(el, st);
	}

	private renderRows(el: HTMLElement, st: LiveStatus): void {
		new Setting(el)
			.setName("연결 상태")
			.setDesc("설정 파일이 아니라 실제 서버 응답으로 검사한 결과입니다.")
			.setHeading()
			.addButton((b) =>
				b.setButtonText("🔄 재검사")
					.setTooltip("서버에 실제로 접속해 상태를 다시 확인합니다")
					.onClick(() => void this.renderDashboard())
			);

		const row = (
			mark: string,
			name: string,
			desc: string,
			fixLabel: string | null,
			onFix: (() => Promise<void> | void) | null
		) => {
			const s = new Setting(el).setName(`${mark} ${name}`).setDesc(desc);
			if (fixLabel && onFix) {
				s.addButton((b) =>
					b.setButtonText(fixLabel)
						.setCta()
						.onClick(async () => {
							await onFix();
							void this.renderDashboard(); // 재진단 후 다시 그림
						})
				);
			}
		};

		// 프로브 결과 → 표시 3단계: ✅ 정상 / ⚠️ 충돌·불명 / ❌ 응답 없음
		const probeRow = (
			name: string,
			probe: ProbeResult,
			flagOn: boolean,
			port: string | number,
			okDesc: string,
			resolve: () => Promise<{ ok: boolean; port: number }>
		) => {
			if (!flagOn && probe !== "conflict") {
				// 아직 온보딩 전 (서버 설정 꺼짐) — 단, 꺼져 있는데 응답이 있으면 충돌로 취급
				row("❌", `${name} (포트 ${port})`, "HTTP 서버가 꺼져 있습니다. 자동 설정으로 켜세요.", "⚡ 자동 설정", async () => {
					const r = await resolve();
					new Notice(r.ok ? `${name}를 켰습니다 ✅ (포트 ${r.port})` : "자동 설정 실패 — 해당 플러그인 설정에서 직접 켜 주세요.");
					if (r.ok && String(r.port) !== String(port)) this.notifyPortChanged();
				});
				return;
			}
			switch (probe) {
				case "ok":
					row("✅", `${name} (포트 ${port})`, okDesc, null, null);
					break;
				case "conflict":
					row("⚠️", `${name} (포트 ${port})`, "이 포트에 다른 볼트의 서버가 떠 있습니다 (포트 충돌). 빈 포트로 옮기면 두 볼트를 함께 쓸 수 있습니다.", "🔀 빈 포트로 이동", async () => {
						const r = await resolve();
						new Notice(r.ok ? `포트를 ${r.port}(으)로 옮겼습니다 ✅` : "빈 포트 이동 실패 — 포트를 직접 바꿔 주세요 (아래 고급 설정).");
						if (r.ok) this.notifyPortChanged();
					});
					break;
				case "unknown":
					row("⚠️", `${name} (포트 ${port})`, "서버는 응답하지만 이 볼트의 서버인지 확인하지 못했습니다. 검색이 안 되면 [빈 포트로 이동]을 눌러 보세요.", "🔀 빈 포트로 이동", async () => {
						const r = await resolve();
						new Notice(r.ok ? `포트 ${r.port}에서 정상 응답을 확인했습니다 ✅` : "이동 실패 — 포트를 직접 바꿔 주세요 (아래 고급 설정).");
						if (r.ok && String(r.port) !== String(port)) this.notifyPortChanged();
					});
					break;
				default: // down — 설정은 켜져 있는데 응답 없음 (바인딩 실패 등)
					row("❌", `${name} (포트 ${port})`, "설정은 켜져 있지만 서버가 응답하지 않습니다 (포트 점유·바인딩 실패 가능). 자동 설정이 빈 포트를 찾아 복구합니다.", "⚡ 자동 설정", async () => {
						const r = await resolve();
						new Notice(r.ok ? `서버를 복구했습니다 ✅ (포트 ${r.port})` : "복구 실패 — 옵시디언 재시작 후 다시 시도해 주세요.");
						if (r.ok && String(r.port) !== String(port)) this.notifyPortChanged();
					});
			}
		};

		if (!st.omniInstalled) {
			row("❌", "Omnisearch 플러그인", "검색 엔진 역할을 하는 필수 플러그인이 없습니다.", "설치 화면 열기", () => openPluginInstallPage(OMNI_ID));
		} else {
			row("✅", "Omnisearch 플러그인", "설치되어 있습니다.", null, null);
			probeRow(
				"Omnisearch HTTP 서버",
				st.omniProbe,
				st.omniHttp && st.omniEnabled,
				st.omniPort,
				"서버 응답 확인 — 브라우저에서 이 볼트를 검색할 수 있습니다.",
				() => resolveOmniPortConflict(this.app)
			);
		}

		if (!st.restInstalled) {
			row("❌", "Local REST API 플러그인 (선택)", "없어도 검색은 되지만, 본문 미리보기·신학(doctrine) 칩·성경구절 칩을 쓰려면 필요합니다.", "설치 화면 열기", () => openPluginInstallPage(REST_ID));
		} else {
			row("✅", "Local REST API 플러그인 (선택)", "설치되어 있습니다.", null, null);
			probeRow(
				"Local REST API HTTP 서버",
				st.restProbe,
				st.restHttp && st.restEnabled,
				st.restPort,
				"서버 응답·API 키 인증 확인 — 본문 미리보기와 칩 표시가 가능합니다.",
				() => resolveRestPortConflict(this.app)
			);
		}

		this.renderAdvanced(el, st);
	}

	private notifyPortChanged(): void {
		new Notice("📋 포트가 바뀌었습니다 — [설정 코드 복사]를 다시 눌러 브라우저 위젯 ⚡에 붙여넣어 주세요.", 12000);
	}

	/** 고급: 포트 수동 편집 (접이식) */
	private renderAdvanced(el: HTMLElement, st: LiveStatus): void {
		const details = el.createEl("details", { cls: "a4p-advanced" });
		details.createEl("summary", { text: "고급 — 포트 직접 지정" });
		const body = details.createDiv();

		const portField = (
			name: string,
			current: string,
			apply: (port: number) => Promise<boolean>
		) => {
			let value = current;
			new Setting(body)
				.setName(name)
				.setDesc(`현재 ${current}. 1024~65535 사이 값으로 바꾼 뒤 [적용]을 누르세요.`)
				.addText((t) => t.setValue(current).onChange((v) => (value = v.trim())))
				.addButton((b) =>
					b.setButtonText("적용").onClick(async () => {
						const port = Number(value);
						if (!Number.isInteger(port) || port < 1024 || port > 65535) {
							new Notice("1024~65535 사이의 포트 번호를 입력해 주세요.");
							return;
						}
						const ok = await apply(port);
						new Notice(ok ? `포트를 ${port}(으)로 변경했습니다 ✅` : "포트 변경 실패 — 플러그인 설치 상태를 확인해 주세요.");
						if (ok) this.notifyPortChanged();
						void this.renderDashboard();
					})
				);
		};

		portField("Omnisearch HTTP 포트", st.omniPort, (p) => setOmnisearchHttp(this.app, p));
		if (st.restInstalled) {
			portField("Local REST API HTTP 포트", String(st.restPort), (p) => setRestHttp(this.app, p));
		}
	}
}
