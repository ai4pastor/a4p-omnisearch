import { AbstractInputSuggest, App, TFolder } from "obsidian";

/**
 * 폴더 경로 자동완성 — 콤마로 여러 폴더를 넣는 필드용.
 * 마지막 콤마 뒤의 조각만 검색어로 쓰고, 선택하면 그 조각을 실제 폴더 경로로 교체한다.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private textInputEl: HTMLInputElement,
		private onPick: (value: string) => void
	) {
		super(app, textInputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const seg = (query.split(",").pop() ?? "").trim().toLowerCase();
		const out: TFolder[] = [];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			if (f instanceof TFolder && f.path !== "/" && f.path.toLowerCase().includes(seg)) {
				out.push(f);
				if (out.length >= 50) break;
			}
		}
		return out.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		const parts = this.textInputEl.value.split(",");
		parts[parts.length - 1] = folder.path;
		const value = parts.map((s) => s.trim()).filter(Boolean).join(",");
		this.textInputEl.value = value;
		this.onPick(value);
		this.close();
	}
}
