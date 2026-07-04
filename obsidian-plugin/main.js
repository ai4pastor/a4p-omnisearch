var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => A4POmnisearchPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/setup-code.ts
var import_obsidian = require("obsidian");

// src/status.ts
var OMNI_ID = "omnisearch";
var REST_ID = "obsidian-local-rest-api";
async function readPluginData(app, id) {
  const path = `${app.vault.configDir}/plugins/${id}/data.json`;
  try {
    if (!await app.vault.adapter.exists(path))
      return null;
    return JSON.parse(await app.vault.adapter.read(path));
  } catch (e) {
    return null;
  }
}
async function patchPluginData(app, id, patch) {
  var _a;
  const path = `${app.vault.configDir}/plugins/${id}/data.json`;
  const data = (_a = await readPluginData(app, id)) != null ? _a : {};
  Object.assign(data, patch);
  await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
}
function pluginRegistry(app) {
  return app.plugins;
}
async function checkStatus(app) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const reg = pluginRegistry(app);
  const omni = (_a = reg == null ? void 0 : reg.plugins) == null ? void 0 : _a[OMNI_ID];
  const rest = (_b = reg == null ? void 0 : reg.plugins) == null ? void 0 : _b[REST_ID];
  const omniData = await readPluginData(app, OMNI_ID);
  const restData = await readPluginData(app, REST_ID);
  const omniSettings = (_d = (_c = omni == null ? void 0 : omni.settings) != null ? _c : omniData) != null ? _d : {};
  const restSettings = (_f = (_e = rest == null ? void 0 : rest.settings) != null ? _e : restData) != null ? _f : {};
  return {
    omniInstalled: !!(omni || omniData !== null || ((_g = reg == null ? void 0 : reg.manifests) == null ? void 0 : _g[OMNI_ID])),
    omniEnabled: !!omni,
    omniHttp: !!omniSettings.httpApiEnabled,
    omniPort: String((_h = omniSettings.httpApiPort) != null ? _h : "51361"),
    restInstalled: !!(rest || restData !== null || ((_i = reg == null ? void 0 : reg.manifests) == null ? void 0 : _i[REST_ID])),
    restEnabled: !!rest,
    restHttp: !!restSettings.enableInsecureServer,
    restPort: Number((_j = restSettings.insecurePort) != null ? _j : 27123),
    restKey: String((_k = restSettings.apiKey) != null ? _k : "")
  };
}
async function patchAndRestart(app, id, patch) {
  var _a, _b;
  const reg = pluginRegistry(app);
  if (!((_a = reg == null ? void 0 : reg.manifests) == null ? void 0 : _a[id]) && await readPluginData(app, id) === null)
    return false;
  try {
    const wasEnabled = !!((_b = reg.plugins) == null ? void 0 : _b[id]);
    if (wasEnabled)
      await reg.disablePlugin(id);
    await patchPluginData(app, id, patch);
    await reg.enablePlugin(id);
    return true;
  } catch (e) {
    return false;
  }
}
async function enableOmnisearchHttp(app) {
  return patchAndRestart(app, OMNI_ID, { httpApiEnabled: true });
}
async function enableRestHttp(app) {
  return patchAndRestart(app, REST_ID, { enableInsecureServer: true });
}
function openPluginInstallPage(id) {
  window.open(`obsidian://show-plugin?id=${encodeURIComponent(id)}`);
}

// src/setup-code.ts
function encodeSetupCode(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  bytes.forEach((b) => bin += String.fromCharCode(b));
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "A4P1:" + b64;
}
async function buildSetupCode(app, bibleFormat, cats) {
  const status = await checkStatus(app);
  const adapter = app.vault.adapter;
  const payload = {
    v: 1,
    vault: app.vault.getName(),
    label: app.vault.getName(),
    omniPort: status.omniPort,
    bibleFormat: bibleFormat || "{\uC57D\uC5B4}{\uC7A5}_{\uC808}"
  };
  if (cats)
    payload.cats = cats;
  if (status.restHttp && status.restKey) {
    payload.restPort = status.restPort;
    payload.restKey = status.restKey;
  }
  if (adapter instanceof import_obsidian.FileSystemAdapter)
    payload.root = adapter.getBasePath();
  return { code: encodeSetupCode(payload), status };
}

// src/settings-tab.ts
var import_obsidian3 = require("obsidian");

// src/folder-suggest.ts
var import_obsidian2 = require("obsidian");
var FolderSuggest = class extends import_obsidian2.AbstractInputSuggest {
  constructor(app, textInputEl, onPick) {
    super(app, textInputEl);
    this.textInputEl = textInputEl;
    this.onPick = onPick;
  }
  getSuggestions(query) {
    var _a;
    const seg = ((_a = query.split(",").pop()) != null ? _a : "").trim().toLowerCase();
    const out = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof import_obsidian2.TFolder && f.path !== "/" && f.path.toLowerCase().includes(seg)) {
        out.push(f);
        if (out.length >= 50)
          break;
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  renderSuggestion(folder, el) {
    el.setText(folder.path);
  }
  selectSuggestion(folder) {
    const parts = this.textInputEl.value.split(",");
    parts[parts.length - 1] = folder.path;
    const value = parts.map((s) => s.trim()).filter(Boolean).join(",");
    this.textInputEl.value = value;
    this.onPick(value);
    this.close();
  }
};

// src/settings-tab.ts
var A4PSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "A4P Omnisearch Helper" });
    containerEl.createEl("p", {
      text: "\uAD6C\uAE00\xB7\uB124\uC774\uBC84 \uAC80\uC0C9 \uC606\uC5D0 \uB0B4 \uBCFC\uD2B8\uB97C \uB744\uC6B0\uB294 A4P \uD1B5\uD569\uAC80\uC0C9\uC758 \uC124\uC815 \uB3C4\uC6B0\uBBF8\uC785\uB2C8\uB2E4. \uC544\uB798 \uCCB4\uD06C\uB9AC\uC2A4\uD2B8\uAC00 \uBAA8\uB450 \u2705\uAC00 \uB418\uBA74 [\uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC]\uB97C \uB20C\uB7EC \uBE0C\uB77C\uC6B0\uC800 \uC704\uC82F\uC758 \u26A1 \uBC84\uD2BC\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694.",
      cls: "a4p-desc"
    });
    this.renderDashboard(containerEl.createDiv({ cls: "a4p-dashboard" }));
    this.renderCategorySection(containerEl);
    new import_obsidian3.Setting(containerEl).setName("\uC131\uACBD\uAD6C\uC808 \uB178\uD2B8 \uC774\uB984 \uD615\uC2DD").setDesc("\uBCFC\uD2B8\uC758 \uC131\uACBD\uAD6C\uC808 \uB178\uD2B8 \uD30C\uC77C\uBA85 \uD615\uC2DD. \uAE30\uBCF8 {\uC57D\uC5B4}{\uC7A5}_{\uC808} \u2192 \uC6943_16. \uC124\uC815 \uCF54\uB4DC\uC5D0 \uD568\uAED8 \uB2F4\uAE41\uB2C8\uB2E4.").addText(
      (t) => t.setValue(this.plugin.settings.bibleFormat).onChange(async (v) => {
        this.plugin.settings.bibleFormat = v.trim() || "{\uC57D\uC5B4}{\uC7A5}_{\uC808}";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("\uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC").setDesc("\u26A0\uFE0F \uCF54\uB4DC\uC5D0 Local REST API \uD0A4\uC640 \uBCFC\uD2B8 \uACBD\uB85C\uAC00 \uB4E4\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uC0AC\uB78C\uACFC \uACF5\uC720\uD558\uC9C0 \uB9C8\uC138\uC694.").addButton(
      (b) => b.setButtonText("\u{1F4CB} \uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC").setCta().onClick(() => this.plugin.copySetupCode())
    );
  }
  /** 카테고리별 자료 위치 — 위젯의 설교/조각/묵상/성경/주석 칩이 이 경로 키워드로 분류된다. */
  renderCategorySection(containerEl) {
    containerEl.createEl("h3", { text: "\uC790\uB8CC \uC704\uCE58 (\uCE74\uD14C\uACE0\uB9AC \uD544\uD130)" });
    containerEl.createEl("p", {
      text: "\uAC80\uC0C9 \uC704\uC82F\uC758 [\uC124\uAD50][\uC870\uAC01][\uBB35\uC0C1][\uC131\uACBD][\uC8FC\uC11D] \uCE69\uC774 \uB178\uD2B8\uB97C \uBD84\uB958\uD560 \uB54C \uC4F0\uB294 \uD3F4\uB354 \uC704\uCE58\uC785\uB2C8\uB2E4. \uB178\uD2B8 \uACBD\uB85C\uC5D0 \uC544\uB798 \uD14D\uC2A4\uD2B8\uAC00 \uD3EC\uD568\uB418\uBA74 \uD574\uB2F9 \uCE74\uD14C\uACE0\uB9AC\uB85C \uC7A1\uD799\uB2C8\uB2E4 (\uCF64\uB9C8\uB85C \uC5EC\uB7EC \uAC1C). \uC124\uC815 \uCF54\uB4DC\uC5D0 \uD568\uAED8 \uB2F4\uACA8 \uC704\uC82F\uC5D0 \uC790\uB3D9 \uC801\uC6A9\uB429\uB2C8\uB2E4.",
      cls: "a4p-desc"
    });
    new import_obsidian3.Setting(containerEl).setName("\u{1F50D} \uB0B4 \uBCFC\uD2B8\uC5D0\uC11C \uC790\uB3D9 \uAC10\uC9C0").setDesc("\uBCFC\uD2B8\uC758 \uD3F4\uB354 \uC774\uB984\uC744 \uD6D1\uC5B4\uC11C \uC124\uAD50\xB7\uC870\uAC01\xB7\uBB35\uC0C1\xB7\uC131\uACBD\xB7\uC8FC\uC11D \uD3F4\uB354\uB97C \uC790\uB3D9\uC73C\uB85C \uCC3E\uC544 \uCC44\uC6C1\uB2C8\uB2E4.").addButton(
      (b) => b.setButtonText("\uC790\uB3D9 \uAC10\uC9C0").onClick(async () => {
        const found = this.detectCategoryFolders();
        this.plugin.settings.cats = found;
        await this.plugin.saveSettings();
        new import_obsidian3.Notice("\uD3F4\uB354 \uC790\uB3D9 \uAC10\uC9C0 \uC644\uB8CC \u2014 \uACB0\uACFC\uB97C \uD655\uC778\uD558\uACE0 \uD544\uC694\uD558\uBA74 \uC218\uC815\uD558\uC138\uC694.");
        this.display();
      })
    );
    const catField = (key, name, desc) => {
      new import_obsidian3.Setting(containerEl).setName(name).setDesc(desc).addText((t) => {
        t.setPlaceholder("\uD3F4\uB354 \uACBD\uB85C \uB610\uB294 \uD0A4\uC6CC\uB4DC, \uCF64\uB9C8\uB85C \uC5EC\uB7EC \uAC1C").setValue(this.plugin.settings.cats[key]).onChange(async (v) => {
          this.plugin.settings.cats[key] = v.trim();
          await this.plugin.saveSettings();
        });
        new FolderSuggest(this.app, t.inputEl, async (v) => {
          this.plugin.settings.cats[key] = v;
          await this.plugin.saveSettings();
        });
      });
    };
    catField("sermon", "\uC124\uAD50", "\uC124\uAD50 \uC6D0\uACE0\uAC00 \uC788\uB294 \uD3F4\uB354");
    catField("frag", "\uC870\uAC01", "\uC124\uAD50\uC870\uAC01\xB7\uAC15\uC758\uC870\uAC01 \uB4F1 \uC870\uAC01 \uBA54\uBAA8 \uD3F4\uB354");
    catField("devo", "\uBB35\uC0C1", "\uBB35\uC0C1\xB7\uD050\uD2F0 \uB178\uD2B8 \uD3F4\uB354");
    catField("bible", "\uC131\uACBD", "\uC131\uACBD\uAD6C\uC808 \uB178\uD2B8 \uD3F4\uB354");
    catField("comm", "\uC8FC\uC11D", "\uC8FC\uC11D\xB7\uAC15\uD574 \uC790\uB8CC \uD3F4\uB354");
  }
  /** 볼트 폴더명을 스캔해 카테고리별 후보 폴더를 찾는다. 조각을 먼저 잡아 '설교조각'이 설교로 새지 않게 한다. */
  detectCategoryFolders() {
    const buckets = { sermon: [], frag: [], devo: [], bible: [], comm: [] };
    const rules = [
      ["frag", /조각/],
      ["bible", /성경/],
      ["devo", /묵상|큐티|qt/i],
      ["comm", /주석|강해/],
      ["sermon", /설교|sermon/i]
    ];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (!(f instanceof import_obsidian3.TFolder) || !f.name)
        continue;
      for (const [key, re] of rules) {
        if (re.test(f.name)) {
          buckets[key].push(f.path);
          break;
        }
      }
    }
    const d = this.plugin.settings.cats;
    const join = (key, fallback) => buckets[key].length ? buckets[key].slice(0, 6).join(",") : fallback;
    return {
      sermon: join("sermon", d.sermon),
      frag: join("frag", d.frag),
      devo: join("devo", d.devo),
      bible: join("bible", d.bible),
      comm: join("comm", d.comm)
    };
  }
  renderDashboard(el) {
    el.createEl("p", { text: "\uC0C1\uD0DC \uD655\uC778 \uC911\u2026", cls: "a4p-loading" });
    void checkStatus(this.app).then((st) => {
      el.empty();
      this.renderRows(el, st);
    });
  }
  renderRows(el, st) {
    const row = (ok, name, okText, fixText, fixLabel, onFix) => {
      const s = new import_obsidian3.Setting(el).setName(`${ok ? "\u2705" : "\u274C"} ${name}`).setDesc(ok ? okText : fixText);
      if (!ok && fixLabel && onFix) {
        s.addButton(
          (b) => b.setButtonText(fixLabel).setCta().onClick(async () => {
            await onFix();
            this.display();
          })
        );
      }
    };
    row(
      st.omniInstalled,
      "Omnisearch \uD50C\uB7EC\uADF8\uC778",
      "\uC124\uCE58\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
      "\uAC80\uC0C9 \uC5D4\uC9C4 \uC5ED\uD560\uC744 \uD558\uB294 \uD544\uC218 \uD50C\uB7EC\uADF8\uC778\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
      "\uC124\uCE58 \uD654\uBA74 \uC5F4\uAE30",
      () => openPluginInstallPage(OMNI_ID)
    );
    if (st.omniInstalled) {
      row(
        st.omniHttp && st.omniEnabled,
        `Omnisearch HTTP \uC11C\uBC84 (\uD3EC\uD2B8 ${st.omniPort})`,
        "\uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC774 \uBCFC\uD2B8\uB97C \uAC80\uC0C9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        "\uBE0C\uB77C\uC6B0\uC800\uAC00 \uBCFC\uD2B8\uB97C \uAC80\uC0C9\uD558\uB824\uBA74 HTTP \uC11C\uBC84\uB97C \uCF1C\uC57C \uD569\uB2C8\uB2E4.",
        "\u26A1 \uC790\uB3D9 \uC124\uC815",
        async () => {
          const ok = await enableOmnisearchHttp(this.app);
          new import_obsidian3.Notice(ok ? "Omnisearch HTTP \uC11C\uBC84\uB97C \uCF30\uC2B5\uB2C8\uB2E4 \u2705" : "\uC790\uB3D9 \uC124\uC815 \uC2E4\uD328 \u2014 Omnisearch \uC124\uC815\uC5D0\uC11C 'HTTP server'\uB97C \uC9C1\uC811 \uCF1C \uC8FC\uC138\uC694.");
        }
      );
    }
    row(
      st.restInstalled,
      "Local REST API \uD50C\uB7EC\uADF8\uC778 (\uC120\uD0DD)",
      "\uC124\uCE58\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
      "\uC5C6\uC5B4\uB3C4 \uAC80\uC0C9\uC740 \uB418\uC9C0\uB9CC, \uBCF8\uBB38 \uBBF8\uB9AC\uBCF4\uAE30\xB7\uC2E0\uD559(doctrine) \uCE69\xB7\uC131\uACBD\uAD6C\uC808 \uCE69\uC744 \uC4F0\uB824\uBA74 \uD544\uC694\uD569\uB2C8\uB2E4.",
      "\uC124\uCE58 \uD654\uBA74 \uC5F4\uAE30",
      () => openPluginInstallPage(REST_ID)
    );
    if (st.restInstalled) {
      row(
        st.restHttp && st.restEnabled,
        `Local REST API HTTP \uC11C\uBC84 (\uD3EC\uD2B8 ${st.restPort})`,
        "\uBCF8\uBB38 \uBBF8\uB9AC\uBCF4\uAE30\uC640 \uCE69 \uD45C\uC2DC\uAC00 \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
        "\uBCF8\uBB38 \uBBF8\uB9AC\uBCF4\uAE30\uC6A9 HTTP \uC11C\uBC84(\uBE44\uC554\uD638\uD654, \uB85C\uCEEC \uC804\uC6A9)\uAC00 \uAEBC\uC838 \uC788\uC2B5\uB2C8\uB2E4.",
        "\u26A1 \uC790\uB3D9 \uC124\uC815",
        async () => {
          const ok = await enableRestHttp(this.app);
          new import_obsidian3.Notice(ok ? "Local REST API HTTP \uC11C\uBC84\uB97C \uCF30\uC2B5\uB2C8\uB2E4 \u2705" : "\uC790\uB3D9 \uC124\uC815 \uC2E4\uD328 \u2014 Local REST API \uC124\uC815\uC5D0\uC11C 'Enable Non-encrypted (HTTP) Server'\uB97C \uC9C1\uC811 \uCF1C \uC8FC\uC138\uC694.");
        }
      );
    }
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  bibleFormat: "{\uC57D\uC5B4}{\uC7A5}_{\uC808}",
  cats: {
    sermon: "\uC124\uAD50",
    frag: "\uC124\uAD50\uC870\uAC01,\uAC15\uC758\uC870\uAC01",
    devo: "\uBB35\uC0C1,\uD050\uD2F0,QT",
    bible: "\uC131\uACBD",
    comm: "\uC8FC\uC11D,\uAC15\uD574"
  },
  onboarded: false
};
var A4POmnisearchPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new A4PSettingTab(this.app, this));
    this.addRibbonIcon("search", "A4P \uD1B5\uD569\uAC80\uC0C9: \uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC", () => {
      void this.copySetupCode();
    });
    this.addCommand({
      id: "copy-setup-code",
      name: "\uAC80\uC0C9 \uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC (\uBE0C\uB77C\uC6B0\uC800 \uC704\uC82F \u26A1\uC5D0 \uBD99\uC5EC\uB123\uAE30)",
      callback: () => void this.copySetupCode()
    });
    this.addCommand({
      id: "check-status",
      name: "\uC5F0\uACB0 \uC0C1\uD0DC \uC9C4\uB2E8",
      callback: () => void this.showStatus()
    });
    if (!this.settings.onboarded) {
      this.settings.onboarded = true;
      await this.saveSettings();
      new import_obsidian4.Notice("A4P Omnisearch Helper\uAC00 \uCF1C\uC84C\uC2B5\uB2C8\uB2E4.\n\uC124\uC815 \uD0ED\uC5D0\uC11C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8\uB97C \uD655\uC778\uD558\uACE0 [\uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC]\uB97C \uB20C\uB7EC \uC8FC\uC138\uC694.", 8e3);
    }
  }
  async copySetupCode() {
    const { code, status } = await buildSetupCode(this.app, this.settings.bibleFormat, this.settings.cats);
    if (!status.omniHttp || !status.omniEnabled) {
      new import_obsidian4.Notice("\u26A0\uFE0F Omnisearch HTTP \uC11C\uBC84\uAC00 \uAEBC\uC838 \uC788\uC2B5\uB2C8\uB2E4.\n\uC124\uC815 \uD0ED\uC758 [\u26A1 \uC790\uB3D9 \uC124\uC815]\uC744 \uBA3C\uC800 \uB20C\uB7EC \uC8FC\uC138\uC694.", 8e3);
      return;
    }
    await navigator.clipboard.writeText(code);
    const restNote = status.restHttp && status.restKey ? "" : "\n(Local REST API \uBBF8\uC124\uC815 \u2014 \uBCF8\uBB38 \uBBF8\uB9AC\uBCF4\uAE30 \uC5C6\uC774 \uB3D9\uC791)";
    new import_obsidian4.Notice("\uC124\uC815 \uCF54\uB4DC\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4 \u{1F4CB}\n\uBE0C\uB77C\uC6B0\uC800 \uAC80\uC0C9 \uC704\uC82F\uC758 \u26A1 \uBC84\uD2BC\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694." + restNote + "\n\u26A0\uFE0F \uC774 \uCF54\uB4DC\uB294 \uB2E4\uB978 \uC0AC\uB78C\uACFC \uACF5\uC720\uD558\uC9C0 \uB9C8\uC138\uC694.", 1e4);
  }
  async showStatus() {
    const st = await checkStatus(this.app);
    const mark = (b) => b ? "\u2705" : "\u274C";
    new import_obsidian4.Notice(
      [
        `${mark(st.omniInstalled)} Omnisearch \uC124\uCE58`,
        `${mark(st.omniHttp && st.omniEnabled)} Omnisearch HTTP \uC11C\uBC84 (\uD3EC\uD2B8 ${st.omniPort})`,
        `${mark(st.restInstalled)} Local REST API \uC124\uCE58 (\uC120\uD0DD)`,
        `${mark(st.restHttp && st.restEnabled)} Local REST HTTP \uC11C\uBC84 (\uD3EC\uD2B8 ${st.restPort})`,
        "\uC790\uC138\uD55C \uD574\uACB0\uC740 \uC124\uC815 \uD0ED \u2192 A4P Omnisearch Helper"
      ].join("\n"),
      1e4
    );
  }
  async loadSettings() {
    var _a, _b;
    const data = (_a = await this.loadData()) != null ? _a : {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      cats: { ...DEFAULT_SETTINGS.cats, ...(_b = data.cats) != null ? _b : {} }
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
