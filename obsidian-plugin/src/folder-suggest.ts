import { AbstractInputSuggest, App, TFolder } from "obsidian";

/**
 * 폴더 경로 자동완성 — 폴더 하나를 담는 입력창용 (행 단위 UI).
 * 선택하면 입력값 전체를 폴더 경로로 교체하고 input 이벤트를 쏴서
 * TextComponent.onChange 한 경로로만 저장되게 한다 (저장 로직 이중화 방지).
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private textInputEl: HTMLInputElement
	) {
		super(app, textInputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.trim().toLowerCase();
		const out: TFolder[] = [];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			if (f instanceof TFolder && f.path !== "/" && f.path.toLowerCase().includes(q)) {
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
		this.textInputEl.value = folder.path;
		this.textInputEl.dispatchEvent(new Event("input"));
		this.close();
	}
}
