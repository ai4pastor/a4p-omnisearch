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
  CATEGORY_KEYS: () => CATEGORY_KEYS,
  default: () => A4POmnisearchPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

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
async function setOmnisearchHttp(app, port) {
  const patch = { httpApiEnabled: true };
  if (port !== void 0)
    patch.httpApiPort = String(port);
  return patchAndRestart(app, OMNI_ID, patch);
}
async function setRestHttp(app, port) {
  const patch = { enableInsecureServer: true };
  if (port !== void 0)
    patch.insecurePort = port;
  return patchAndRestart(app, REST_ID, patch);
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
function catsToWire(cats) {
  var _a;
  const out = {};
  for (const k of CATEGORY_KEYS)
    out[k] = ((_a = cats[k]) != null ? _a : []).map((s) => s.trim()).filter(Boolean).join(",");
  return out;
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
    payload.cats = catsToWire(cats);
  if (status.restHttp && status.restKey) {
    payload.restPort = status.restPort;
    payload.restKey = status.restKey;
  }
  if (adapter instanceof import_obsidian.FileSystemAdapter)
    payload.root = adapter.getBasePath();
  return { code: encodeSetupCode(payload), status };
}

// src/settings-tab.ts
var import_obsidian4 = require("obsidian");

// src/folder-suggest.ts
var import_obsidian2 = require("obsidian");
var FolderSuggest = class extends import_obsidian2.AbstractInputSuggest {
  constructor(app, textInputEl) {
    super(app, textInputEl);
    this.textInputEl = textInputEl;
  }
  getSuggestions(query) {
    const q = query.trim().toLowerCase();
    const out = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof import_obsidian2.TFolder && f.path !== "/" && f.path.toLowerCase().includes(q)) {
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
    this.textInputEl.value = folder.path;
    this.textInputEl.dispatchEvent(new Event("input"));
    this.close();
  }
};

// src/probe.ts
var import_obsidian3 = require("obsidian");
var withTimeout = (p, ms = 3e3) => Promise.race([p, new Promise((r) => window.setTimeout(() => r("timeout"), ms))]);
async function omniSearchOnce(port, query) {
  try {
    const res = await withTimeout(
      (0, import_obsidian3.requestUrl)({ url: `http://localhost:${port}/search?q=${encodeURIComponent(query)}`, throw: false })
    );
    if (res === "timeout")
      return "down";
    if (res.status < 200 || res.status >= 300)
      return "unknown";
    const items = res.json;
    return Array.isArray(items) ? items : "unknown";
  } catch (e) {
    return "down";
  }
}
async function probeOmnisearch(app, port) {
  var _a, _b;
  const myVault = app.vault.getName();
  const files = app.vault.getMarkdownFiles();
  const queries = [(_a = files[0]) == null ? void 0 : _a.basename, (_b = files[1]) == null ? void 0 : _b.basename, myVault].filter(Boolean);
  let sawEmpty = false;
  for (const q of queries.slice(0, 3)) {
    const r = await omniSearchOnce(port, q);
    if (r === "down")
      return "down";
    if (r === "unknown")
      return "unknown";
    if (r.length === 0) {
      sawEmpty = true;
      continue;
    }
    return r.some((it) => it.vault === myVault) ? "ok" : "conflict";
  }
  return sawEmpty ? "unknown" : "down";
}
async function probeLocalRest(port, key) {
  var _a;
  if (!key)
    return "down";
  try {
    const res = await withTimeout(
      (0, import_obsidian3.requestUrl)({
        url: `http://127.0.0.1:${port}/`,
        headers: { Authorization: `Bearer ${key}` },
        throw: false
      })
    );
    if (res === "timeout")
      return "down";
    if (res.status === 401 || res.status === 403)
      return "conflict";
    if (res.status < 200 || res.status >= 300)
      return "unknown";
    const auth = (_a = res.json) == null ? void 0 : _a.authenticated;
    return auth === true ? "ok" : auth === false ? "conflict" : "unknown";
  } catch (e) {
    return "down";
  }
}
async function checkLiveStatus(app) {
  const st = await checkStatus(app);
  const [omniProbe, restProbe] = await Promise.all([
    probeOmnisearch(app, st.omniPort),
    st.restInstalled ? probeLocalRest(st.restPort, st.restKey) : Promise.resolve("down")
  ]);
  return { ...st, omniProbe, restProbe };
}
function isPortFree(port) {
  return new Promise((resolve) => {
    try {
      const net = require("net");
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    } catch (e) {
      resolve(false);
    }
  });
}
async function findFreePort(start, skip) {
  for (let p = start; p < start + 20; p++) {
    if (p < 1024 || p > 65535 || skip.includes(p))
      continue;
    if (await isPortFree(p))
      return p;
  }
  return null;
}
var sleep = (ms) => new Promise((r) => window.setTimeout(r, ms));
async function resolveConflict(app, spec) {
  const st = await checkStatus(app);
  const cur = spec.getPort(st);
  const first = await spec.probe(app, st);
  if (first === "ok")
    return { ok: true, port: cur };
  if (first === "down" && await isPortFree(cur)) {
    if (await spec.apply(app)) {
      for (let i = 0; i < 3; i++) {
        await sleep(1e3);
        if (await spec.probe(app, await checkStatus(app)) === "ok")
          return { ok: true, port: cur };
      }
    }
  }
  let searchFrom = cur + 1;
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = await findFreePort(searchFrom, spec.skipPorts(st));
    if (next === null)
      break;
    if (await spec.apply(app, next)) {
      for (let i = 0; i < 3; i++) {
        await sleep(1e3);
        if (await spec.probe(app, await checkStatus(app)) === "ok")
          return { ok: true, port: next };
      }
    }
    searchFrom = next + 1;
  }
  return { ok: false, port: cur };
}
function resolveOmniPortConflict(app) {
  return resolveConflict(app, {
    getPort: (st) => Number(st.omniPort),
    probe: (app2, st) => probeOmnisearch(app2, st.omniPort),
    apply: (app2, port) => setOmnisearchHttp(app2, port),
    skipPorts: (st) => [st.restPort, 27124]
  });
}
function resolveRestPortConflict(app) {
  return resolveConflict(app, {
    getPort: (st) => st.restPort,
    probe: (app2, st) => probeLocalRest(st.restPort, st.restKey),
    apply: (app2, port) => setRestHttp(app2, port),
    skipPorts: (st) => [Number(st.omniPort), 27124]
  });
}

// src/settings-tab.ts
var A4PSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.dashEl = null;
    this.lastStatus = null;
    this.catSections = {};
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "A4P Omnisearch Helper" });
    containerEl.createEl("p", {
      text: "\uAD6C\uAE00\xB7\uB124\uC774\uBC84\xB7Bing\xB7\uC720\uD29C\uBE0C \uAC80\uC0C9 \uC606\uC5D0 \uB0B4 \uBCFC\uD2B8\uB97C \uB744\uC6B0\uB294 A4P \uD1B5\uD569\uAC80\uC0C9\uC758 \uC124\uC815 \uB3C4\uC6B0\uBBF8\uC785\uB2C8\uB2E4. \uC544\uB798 \uCCB4\uD06C\uB9AC\uC2A4\uD2B8\uAC00 \uBAA8\uB450 \u2705\uAC00 \uB418\uBA74 [\uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC]\uB97C \uB20C\uB7EC \uBE0C\uB77C\uC6B0\uC800 \uC704\uC82F\uC758 \u26A1 \uBC84\uD2BC\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694.",
      cls: "a4p-desc"
    });
    this.dashEl = containerEl.createDiv({ cls: "a4p-dashboard" });
    void this.renderDashboard();
    this.renderCategorySection(containerEl);
    new import_obsidian4.Setting(containerEl).setName("\uC131\uACBD\uAD6C\uC808 \uB178\uD2B8 \uC774\uB984 \uD615\uC2DD").setDesc("\uBCFC\uD2B8\uC758 \uC131\uACBD\uAD6C\uC808 \uB178\uD2B8 \uD30C\uC77C\uBA85 \uD615\uC2DD. \uAE30\uBCF8 {\uC57D\uC5B4}{\uC7A5}_{\uC808} \u2192 \uC6943_16. \uC124\uC815 \uCF54\uB4DC\uC5D0 \uD568\uAED8 \uB2F4\uAE41\uB2C8\uB2E4.").addText(
      (t) => t.setValue(this.plugin.settings.bibleFormat).onChange(async (v) => {
        this.plugin.settings.bibleFormat = v.trim() || "{\uC57D\uC5B4}{\uC7A5}_{\uC808}";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("\uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC").setDesc("\u26A0\uFE0F \uCF54\uB4DC\uC5D0 Local REST API \uD0A4\uC640 \uBCFC\uD2B8 \uACBD\uB85C\uAC00 \uB4E4\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uC0AC\uB78C\uACFC \uACF5\uC720\uD558\uC9C0 \uB9C8\uC138\uC694. \uD3EC\uD2B8\uAC00 \uBC14\uB00C\uBA74 \uCF54\uB4DC\uB97C \uB2E4\uC2DC \uBCF5\uC0AC\uD574 \uBD99\uC5EC\uB123\uC5B4\uC57C \uD569\uB2C8\uB2E4.").addButton(
      (b) => b.setButtonText("\u{1F4CB} \uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC").setCta().onClick(() => this.plugin.copySetupCode())
    );
  }
  // ---------- 카테고리 폴더 (행 단위 UI) ----------
  /** 카테고리별 자료 위치 — 위젯의 설교/조각/묵상/성경/주석 칩이 이 경로 키워드로 분류된다. */
  renderCategorySection(containerEl) {
    containerEl.createEl("h3", { text: "\uC790\uB8CC \uC704\uCE58 (\uCE74\uD14C\uACE0\uB9AC \uD544\uD130)" });
    containerEl.createEl("p", {
      text: "\uAC80\uC0C9 \uC704\uC82F\uC758 [\uC124\uAD50][\uC870\uAC01][\uBB35\uC0C1][\uC131\uACBD][\uC8FC\uC11D] \uCE69\uC774 \uB178\uD2B8\uB97C \uBD84\uB958\uD560 \uB54C \uC4F0\uB294 \uD3F4\uB354 \uC704\uCE58\uC785\uB2C8\uB2E4. \uB178\uD2B8 \uACBD\uB85C\uC5D0 \uC544\uB798 \uD3F4\uB354 \uC774\uB984\uC774 \uD3EC\uD568\uB418\uBA74 \uD574\uB2F9 \uCE74\uD14C\uACE0\uB9AC\uB85C \uC7A1\uD799\uB2C8\uB2E4. \uD3F4\uB354\uB294 \uCE74\uD14C\uACE0\uB9AC\uB9C8\uB2E4 \uC5EC\uB7EC \uAC1C \uCD94\uAC00\uD560 \uC218 \uC788\uACE0, \uC124\uC815 \uCF54\uB4DC\uC5D0 \uD568\uAED8 \uB2F4\uACA8 \uC704\uC82F\uC5D0 \uC790\uB3D9 \uC801\uC6A9\uB429\uB2C8\uB2E4.",
      cls: "a4p-desc"
    });
    new import_obsidian4.Setting(containerEl).setName("\u{1F50D} \uB0B4 \uBCFC\uD2B8\uC5D0\uC11C \uC790\uB3D9 \uAC10\uC9C0").setDesc("\uBCFC\uD2B8\uC758 \uD3F4\uB354 \uC774\uB984\uC744 \uD6D1\uC5B4\uC11C \uC124\uAD50\xB7\uC870\uAC01\xB7\uBB35\uC0C1\xB7\uC131\uACBD\xB7\uC8FC\uC11D \uD3F4\uB354\uB97C \uC790\uB3D9\uC73C\uB85C \uCC3E\uC544 \uCC44\uC6C1\uB2C8\uB2E4.").addButton(
      (b) => b.setButtonText("\uC790\uB3D9 \uAC10\uC9C0").onClick(async () => {
        this.plugin.settings.cats = this.detectCategoryFolders();
        await this.plugin.saveSettings();
        new import_obsidian4.Notice("\uD3F4\uB354 \uC790\uB3D9 \uAC10\uC9C0 \uC644\uB8CC \u2014 \uACB0\uACFC\uB97C \uD655\uC778\uD558\uACE0 \uD544\uC694\uD558\uBA74 \uC218\uC815\uD558\uC138\uC694.");
        for (const key of Object.keys(this.catSections)) {
          this.renderCategoryRows(key);
        }
      })
    );
    const defs = [
      ["sermon", "\uC124\uAD50", "\uC124\uAD50 \uC6D0\uACE0\uAC00 \uC788\uB294 \uD3F4\uB354"],
      ["frag", "\uC870\uAC01", "\uC124\uAD50\uC870\uAC01\xB7\uAC15\uC758\uC870\uAC01 \uB4F1 \uC870\uAC01 \uBA54\uBAA8 \uD3F4\uB354"],
      ["devo", "\uBB35\uC0C1", "\uBB35\uC0C1\xB7\uD050\uD2F0 \uB178\uD2B8 \uD3F4\uB354"],
      ["bible", "\uC131\uACBD", "\uC131\uACBD\uAD6C\uC808 \uB178\uD2B8 \uD3F4\uB354"],
      ["comm", "\uC8FC\uC11D", "\uC8FC\uC11D\xB7\uAC15\uD574 \uC790\uB8CC \uD3F4\uB354"]
    ];
    for (const [key, name, desc] of defs) {
      this.catSections[key] = { el: containerEl.createDiv({ cls: "a4p-cat-section" }), name, desc };
      this.renderCategoryRows(key);
    }
  }
  /** 한 카테고리의 폴더 행 목록만 다시 그린다 (전체 display() 재호출 금지 — 프로브 재실행·스크롤 튐 방지). */
  renderCategoryRows(key) {
    const section = this.catSections[key];
    if (!section)
      return;
    const { el, name, desc } = section;
    el.empty();
    const folders = this.plugin.settings.cats[key];
    new import_obsidian4.Setting(el).setName(name).setDesc(desc).setHeading().addButton(
      (b) => b.setButtonText("\uFF0B \uD3F4\uB354 \uCD94\uAC00").onClick(async () => {
        folders.push("");
        await this.plugin.saveSettings();
        this.renderCategoryRows(key);
      })
    );
    if (!folders.length) {
      el.createEl("p", { text: "\uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4 \u2014 [\uFF0B \uD3F4\uB354 \uCD94\uAC00]\uB97C \uB20C\uB7EC \uB4F1\uB85D\uD558\uC138\uC694.", cls: "a4p-desc a4p-cat-empty" });
      return;
    }
    folders.forEach((path, i) => {
      const row = new import_obsidian4.Setting(el);
      row.settingEl.addClass("a4p-folder-row");
      row.addText((t) => {
        t.setPlaceholder("\uD3F4\uB354 \uACBD\uB85C (\uC785\uB825\uD558\uBA74 \uC790\uB3D9\uC644\uC131)").setValue(path).onChange(async (v) => {
          this.plugin.settings.cats[key][i] = v.trim();
          await this.plugin.saveSettings();
        });
        t.inputEl.addClass("a4p-folder-input");
        new FolderSuggest(this.app, t.inputEl);
      });
      row.addExtraButton(
        (b) => b.setIcon("trash-2").setTooltip("\uC774 \uD3F4\uB354 \uC81C\uAC70").onClick(async () => {
          this.plugin.settings.cats[key].splice(i, 1);
          await this.plugin.saveSettings();
          this.renderCategoryRows(key);
        })
      );
    });
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
      if (!(f instanceof import_obsidian4.TFolder) || !f.name)
        continue;
      for (const [key, re] of rules) {
        if (re.test(f.name)) {
          buckets[key].push(f.path);
          break;
        }
      }
    }
    const d = this.plugin.settings.cats;
    const pick = (key) => buckets[key].length ? buckets[key].slice(0, 6) : [...d[key]];
    return { sermon: pick("sermon"), frag: pick("frag"), devo: pick("devo"), bible: pick("bible"), comm: pick("comm") };
  }
  // ---------- 상태 대시보드 (실검증 프로브) ----------
  async renderDashboard() {
    const el = this.dashEl;
    if (!el)
      return;
    el.empty();
    el.createEl("p", { text: "\uC0C1\uD0DC \uD655\uC778 \uC911\u2026 (\uC2E4\uC81C \uC11C\uBC84 \uC751\uB2F5\uC744 \uAC80\uC0AC\uD569\uB2C8\uB2E4)", cls: "a4p-loading" });
    const st = await checkLiveStatus(this.app);
    this.lastStatus = st;
    if (el !== this.dashEl)
      return;
    el.empty();
    this.renderRows(el, st);
  }
  renderRows(el, st) {
    new import_obsidian4.Setting(el).setName("\uC5F0\uACB0 \uC0C1\uD0DC").setDesc("\uC124\uC815 \uD30C\uC77C\uC774 \uC544\uB2C8\uB77C \uC2E4\uC81C \uC11C\uBC84 \uC751\uB2F5\uC73C\uB85C \uAC80\uC0AC\uD55C \uACB0\uACFC\uC785\uB2C8\uB2E4.").setHeading().addButton(
      (b) => b.setButtonText("\u{1F504} \uC7AC\uAC80\uC0AC").setTooltip("\uC11C\uBC84\uC5D0 \uC2E4\uC81C\uB85C \uC811\uC18D\uD574 \uC0C1\uD0DC\uB97C \uB2E4\uC2DC \uD655\uC778\uD569\uB2C8\uB2E4").onClick(() => void this.renderDashboard())
    );
    const row = (mark, name, desc, fixLabel, onFix) => {
      const s = new import_obsidian4.Setting(el).setName(`${mark} ${name}`).setDesc(desc);
      if (fixLabel && onFix) {
        s.addButton(
          (b) => b.setButtonText(fixLabel).setCta().onClick(async () => {
            await onFix();
            void this.renderDashboard();
          })
        );
      }
    };
    const probeRow = (name, probe, flagOn, port, okDesc, resolve) => {
      if (!flagOn && probe !== "conflict") {
        row("\u274C", `${name} (\uD3EC\uD2B8 ${port})`, "HTTP \uC11C\uBC84\uAC00 \uAEBC\uC838 \uC788\uC2B5\uB2C8\uB2E4. \uC790\uB3D9 \uC124\uC815\uC73C\uB85C \uCF1C\uC138\uC694.", "\u26A1 \uC790\uB3D9 \uC124\uC815", async () => {
          const r = await resolve();
          new import_obsidian4.Notice(r.ok ? `${name}\uB97C \uCF30\uC2B5\uB2C8\uB2E4 \u2705 (\uD3EC\uD2B8 ${r.port})` : "\uC790\uB3D9 \uC124\uC815 \uC2E4\uD328 \u2014 \uD574\uB2F9 \uD50C\uB7EC\uADF8\uC778 \uC124\uC815\uC5D0\uC11C \uC9C1\uC811 \uCF1C \uC8FC\uC138\uC694.");
          if (r.ok && String(r.port) !== String(port))
            this.notifyPortChanged();
        });
        return;
      }
      switch (probe) {
        case "ok":
          row("\u2705", `${name} (\uD3EC\uD2B8 ${port})`, okDesc, null, null);
          break;
        case "conflict":
          row("\u26A0\uFE0F", `${name} (\uD3EC\uD2B8 ${port})`, "\uC774 \uD3EC\uD2B8\uC5D0 \uB2E4\uB978 \uBCFC\uD2B8\uC758 \uC11C\uBC84\uAC00 \uB5A0 \uC788\uC2B5\uB2C8\uB2E4 (\uD3EC\uD2B8 \uCDA9\uB3CC). \uBE48 \uD3EC\uD2B8\uB85C \uC62E\uAE30\uBA74 \uB450 \uBCFC\uD2B8\uB97C \uD568\uAED8 \uC4F8 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", "\u{1F500} \uBE48 \uD3EC\uD2B8\uB85C \uC774\uB3D9", async () => {
            const r = await resolve();
            new import_obsidian4.Notice(r.ok ? `\uD3EC\uD2B8\uB97C ${r.port}(\uC73C)\uB85C \uC62E\uACBC\uC2B5\uB2C8\uB2E4 \u2705` : "\uBE48 \uD3EC\uD2B8 \uC774\uB3D9 \uC2E4\uD328 \u2014 \uD3EC\uD2B8\uB97C \uC9C1\uC811 \uBC14\uAFD4 \uC8FC\uC138\uC694 (\uC544\uB798 \uACE0\uAE09 \uC124\uC815).");
            if (r.ok)
              this.notifyPortChanged();
          });
          break;
        case "unknown":
          row("\u26A0\uFE0F", `${name} (\uD3EC\uD2B8 ${port})`, "\uC11C\uBC84\uB294 \uC751\uB2F5\uD558\uC9C0\uB9CC \uC774 \uBCFC\uD2B8\uC758 \uC11C\uBC84\uC778\uC9C0 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uAC80\uC0C9\uC774 \uC548 \uB418\uBA74 [\uBE48 \uD3EC\uD2B8\uB85C \uC774\uB3D9]\uC744 \uB20C\uB7EC \uBCF4\uC138\uC694.", "\u{1F500} \uBE48 \uD3EC\uD2B8\uB85C \uC774\uB3D9", async () => {
            const r = await resolve();
            new import_obsidian4.Notice(r.ok ? `\uD3EC\uD2B8 ${r.port}\uC5D0\uC11C \uC815\uC0C1 \uC751\uB2F5\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4 \u2705` : "\uC774\uB3D9 \uC2E4\uD328 \u2014 \uD3EC\uD2B8\uB97C \uC9C1\uC811 \uBC14\uAFD4 \uC8FC\uC138\uC694 (\uC544\uB798 \uACE0\uAE09 \uC124\uC815).");
            if (r.ok && String(r.port) !== String(port))
              this.notifyPortChanged();
          });
          break;
        default:
          row("\u274C", `${name} (\uD3EC\uD2B8 ${port})`, "\uC124\uC815\uC740 \uCF1C\uC838 \uC788\uC9C0\uB9CC \uC11C\uBC84\uAC00 \uC751\uB2F5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4 (\uD3EC\uD2B8 \uC810\uC720\xB7\uBC14\uC778\uB529 \uC2E4\uD328 \uAC00\uB2A5). \uC790\uB3D9 \uC124\uC815\uC774 \uBE48 \uD3EC\uD2B8\uB97C \uCC3E\uC544 \uBCF5\uAD6C\uD569\uB2C8\uB2E4.", "\u26A1 \uC790\uB3D9 \uC124\uC815", async () => {
            const r = await resolve();
            new import_obsidian4.Notice(r.ok ? `\uC11C\uBC84\uB97C \uBCF5\uAD6C\uD588\uC2B5\uB2C8\uB2E4 \u2705 (\uD3EC\uD2B8 ${r.port})` : "\uBCF5\uAD6C \uC2E4\uD328 \u2014 \uC635\uC2DC\uB514\uC5B8 \uC7AC\uC2DC\uC791 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
            if (r.ok && String(r.port) !== String(port))
              this.notifyPortChanged();
          });
      }
    };
    if (!st.omniInstalled) {
      row("\u274C", "Omnisearch \uD50C\uB7EC\uADF8\uC778", "\uAC80\uC0C9 \uC5D4\uC9C4 \uC5ED\uD560\uC744 \uD558\uB294 \uD544\uC218 \uD50C\uB7EC\uADF8\uC778\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", "\uC124\uCE58 \uD654\uBA74 \uC5F4\uAE30", () => openPluginInstallPage(OMNI_ID));
    } else {
      row("\u2705", "Omnisearch \uD50C\uB7EC\uADF8\uC778", "\uC124\uCE58\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.", null, null);
      probeRow(
        "Omnisearch HTTP \uC11C\uBC84",
        st.omniProbe,
        st.omniHttp && st.omniEnabled,
        st.omniPort,
        "\uC11C\uBC84 \uC751\uB2F5 \uD655\uC778 \u2014 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC774 \uBCFC\uD2B8\uB97C \uAC80\uC0C9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        () => resolveOmniPortConflict(this.app)
      );
    }
    if (!st.restInstalled) {
      row("\u274C", "Local REST API \uD50C\uB7EC\uADF8\uC778 (\uC120\uD0DD)", "\uC5C6\uC5B4\uB3C4 \uAC80\uC0C9\uC740 \uB418\uC9C0\uB9CC, \uBCF8\uBB38 \uBBF8\uB9AC\uBCF4\uAE30\xB7\uC2E0\uD559(doctrine) \uCE69\xB7\uC131\uACBD\uAD6C\uC808 \uCE69\uC744 \uC4F0\uB824\uBA74 \uD544\uC694\uD569\uB2C8\uB2E4.", "\uC124\uCE58 \uD654\uBA74 \uC5F4\uAE30", () => openPluginInstallPage(REST_ID));
    } else {
      row("\u2705", "Local REST API \uD50C\uB7EC\uADF8\uC778 (\uC120\uD0DD)", "\uC124\uCE58\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.", null, null);
      probeRow(
        "Local REST API HTTP \uC11C\uBC84",
        st.restProbe,
        st.restHttp && st.restEnabled,
        st.restPort,
        "\uC11C\uBC84 \uC751\uB2F5\xB7API \uD0A4 \uC778\uC99D \uD655\uC778 \u2014 \uBCF8\uBB38 \uBBF8\uB9AC\uBCF4\uAE30\uC640 \uCE69 \uD45C\uC2DC\uAC00 \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
        () => resolveRestPortConflict(this.app)
      );
    }
    this.renderAdvanced(el, st);
  }
  notifyPortChanged() {
    new import_obsidian4.Notice("\u{1F4CB} \uD3EC\uD2B8\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4 \u2014 [\uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC]\uB97C \uB2E4\uC2DC \uB20C\uB7EC \uBE0C\uB77C\uC6B0\uC800 \uC704\uC82F \u26A1\uC5D0 \uBD99\uC5EC\uB123\uC5B4 \uC8FC\uC138\uC694.", 12e3);
  }
  /** 고급: 포트 수동 편집 (접이식) */
  renderAdvanced(el, st) {
    const details = el.createEl("details", { cls: "a4p-advanced" });
    details.createEl("summary", { text: "\uACE0\uAE09 \u2014 \uD3EC\uD2B8 \uC9C1\uC811 \uC9C0\uC815" });
    const body = details.createDiv();
    const portField = (name, current, apply) => {
      let value = current;
      new import_obsidian4.Setting(body).setName(name).setDesc(`\uD604\uC7AC ${current}. 1024~65535 \uC0AC\uC774 \uAC12\uC73C\uB85C \uBC14\uAFBC \uB4A4 [\uC801\uC6A9]\uC744 \uB204\uB974\uC138\uC694.`).addText((t) => t.setValue(current).onChange((v) => value = v.trim())).addButton(
        (b) => b.setButtonText("\uC801\uC6A9").onClick(async () => {
          const port = Number(value);
          if (!Number.isInteger(port) || port < 1024 || port > 65535) {
            new import_obsidian4.Notice("1024~65535 \uC0AC\uC774\uC758 \uD3EC\uD2B8 \uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
            return;
          }
          const ok = await apply(port);
          new import_obsidian4.Notice(ok ? `\uD3EC\uD2B8\uB97C ${port}(\uC73C)\uB85C \uBCC0\uACBD\uD588\uC2B5\uB2C8\uB2E4 \u2705` : "\uD3EC\uD2B8 \uBCC0\uACBD \uC2E4\uD328 \u2014 \uD50C\uB7EC\uADF8\uC778 \uC124\uCE58 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
          if (ok)
            this.notifyPortChanged();
          void this.renderDashboard();
        })
      );
    };
    portField("Omnisearch HTTP \uD3EC\uD2B8", st.omniPort, (p) => setOmnisearchHttp(this.app, p));
    if (st.restInstalled) {
      portField("Local REST API HTTP \uD3EC\uD2B8", String(st.restPort), (p) => setRestHttp(this.app, p));
    }
  }
};

// src/main.ts
var CATEGORY_KEYS = ["sermon", "frag", "devo", "bible", "comm"];
var DEFAULT_SETTINGS = {
  bibleFormat: "{\uC57D\uC5B4}{\uC7A5}_{\uC808}",
  cats: {
    sermon: ["\uC124\uAD50"],
    frag: ["\uC124\uAD50\uC870\uAC01", "\uAC15\uC758\uC870\uAC01"],
    devo: ["\uBB35\uC0C1", "\uD050\uD2F0", "QT"],
    bible: ["\uC131\uACBD"],
    comm: ["\uC8FC\uC11D", "\uAC15\uD574"]
  },
  onboarded: false
};
var A4POmnisearchPlugin = class extends import_obsidian5.Plugin {
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
    this.app.workspace.onLayoutReady(() => {
      window.setTimeout(() => void this.autoResolveConflicts(), 4e3);
    });
    if (!this.settings.onboarded) {
      this.settings.onboarded = true;
      await this.saveSettings();
      new import_obsidian5.Notice("A4P Omnisearch Helper\uAC00 \uCF1C\uC84C\uC2B5\uB2C8\uB2E4.\n\uC124\uC815 \uD0ED\uC5D0\uC11C \uCCB4\uD06C\uB9AC\uC2A4\uD2B8\uB97C \uD655\uC778\uD558\uACE0 [\uC124\uC815 \uCF54\uB4DC \uBCF5\uC0AC]\uB97C \uB20C\uB7EC \uC8FC\uC138\uC694.", 8e3);
    }
  }
  /** 볼트 시작 시 포트 충돌을 감지하면 빈 포트로 자동 이동시킨다. */
  async autoResolveConflicts() {
    try {
      const st = await checkLiveStatus(this.app);
      let moved = false;
      if (st.omniHttp && st.omniEnabled && st.omniProbe === "conflict") {
        const r = await resolveOmniPortConflict(this.app);
        if (r.ok) {
          moved = true;
          new import_obsidian5.Notice(`\u26A0\uFE0F \uB2E4\uB978 \uBCFC\uD2B8\uC640 \uD3EC\uD2B8\uAC00 \uACB9\uCCD0 Omnisearch \uD3EC\uD2B8\uB97C ${r.port}(\uC73C)\uB85C \uC62E\uACBC\uC2B5\uB2C8\uB2E4.`, 12e3);
        }
      }
      if (st.restHttp && st.restEnabled && st.restProbe === "conflict") {
        const r = await resolveRestPortConflict(this.app);
        if (r.ok) {
          moved = true;
          new import_obsidian5.Notice(`\u26A0\uFE0F \uB2E4\uB978 \uBCFC\uD2B8\uC640 \uD3EC\uD2B8\uAC00 \uACB9\uCCD0 Local REST \uD3EC\uD2B8\uB97C ${r.port}(\uC73C)\uB85C \uC62E\uACBC\uC2B5\uB2C8\uB2E4.`, 12e3);
        }
      }
      if (moved) {
        new import_obsidian5.Notice("\u{1F4CB} \uD3EC\uD2B8\uAC00 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4 \u2014 \uC124\uC815 \uCF54\uB4DC\uB97C \uB2E4\uC2DC \uBCF5\uC0AC\uD574 \uBE0C\uB77C\uC6B0\uC800 \uC704\uC82F \u26A1\uC5D0 \uBD99\uC5EC\uB123\uC5B4 \uC8FC\uC138\uC694.", 15e3);
      }
    } catch (e) {
    }
  }
  async copySetupCode() {
    const { code, status } = await buildSetupCode(this.app, this.settings.bibleFormat, this.settings.cats);
    if (!status.omniHttp || !status.omniEnabled) {
      new import_obsidian5.Notice("\u26A0\uFE0F Omnisearch HTTP \uC11C\uBC84\uAC00 \uAEBC\uC838 \uC788\uC2B5\uB2C8\uB2E4.\n\uC124\uC815 \uD0ED\uC758 [\u26A1 \uC790\uB3D9 \uC124\uC815]\uC744 \uBA3C\uC800 \uB20C\uB7EC \uC8FC\uC138\uC694.", 8e3);
      return;
    }
    await navigator.clipboard.writeText(code);
    const restNote = status.restHttp && status.restKey ? "" : "\n(Local REST API \uBBF8\uC124\uC815 \u2014 \uBCF8\uBB38 \uBBF8\uB9AC\uBCF4\uAE30 \uC5C6\uC774 \uB3D9\uC791)";
    new import_obsidian5.Notice("\uC124\uC815 \uCF54\uB4DC\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4 \u{1F4CB}\n\uBE0C\uB77C\uC6B0\uC800 \uAC80\uC0C9 \uC704\uC82F\uC758 \u26A1 \uBC84\uD2BC\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694." + restNote + "\n\u26A0\uFE0F \uC774 \uCF54\uB4DC\uB294 \uB2E4\uB978 \uC0AC\uB78C\uACFC \uACF5\uC720\uD558\uC9C0 \uB9C8\uC138\uC694.", 1e4);
  }
  async showStatus() {
    const st = await checkLiveStatus(this.app);
    const mark = (b) => b ? "\u2705" : "\u274C";
    const probeMark = (p) => p === "ok" ? "\u2705" : p === "down" ? "\u274C" : "\u26A0\uFE0F";
    const probeText = (p) => p === "ok" ? "\uC751\uB2F5 \uD655\uC778" : p === "conflict" ? "\uB2E4\uB978 \uBCFC\uD2B8\uAC00 \uD3EC\uD2B8 \uC0AC\uC6A9 \uC911" : p === "unknown" ? "\uC751\uB2F5 \uD655\uC778 \uBD88\uAC00" : "\uC751\uB2F5 \uC5C6\uC74C";
    new import_obsidian5.Notice(
      [
        `${mark(st.omniInstalled)} Omnisearch \uC124\uCE58`,
        `${probeMark(st.omniProbe)} Omnisearch HTTP \uC11C\uBC84 (\uD3EC\uD2B8 ${st.omniPort}) \u2014 ${probeText(st.omniProbe)}`,
        `${mark(st.restInstalled)} Local REST API \uC124\uCE58 (\uC120\uD0DD)`,
        `${probeMark(st.restProbe)} Local REST HTTP \uC11C\uBC84 (\uD3EC\uD2B8 ${st.restPort}) \u2014 ${probeText(st.restProbe)}`,
        "\uC790\uC138\uD55C \uD574\uACB0\uC740 \uC124\uC815 \uD0ED \u2192 A4P Omnisearch Helper"
      ].join("\n"),
      1e4
    );
  }
  async loadSettings() {
    var _a, _b, _c;
    const data = (_a = await this.loadData()) != null ? _a : {};
    const toArr = (v) => Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : null;
    const rawCats = (_b = data.cats) != null ? _b : {};
    const cats = {};
    for (const k of CATEGORY_KEYS)
      cats[k] = (_c = toArr(rawCats[k])) != null ? _c : [...DEFAULT_SETTINGS.cats[k]];
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      cats
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
