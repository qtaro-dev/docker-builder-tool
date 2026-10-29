// src/renderer/modules_ui.js
// ------------------------------------------------------------
// モジュール部：モジュール登録 / モジュール一覧UI / 構成入力UI
// ------------------------------------------------------------

/* global window, document */

// ==============================
// [M01] モジュールレジストリ
// ==============================
const moduleRegistry = [];
// カードを再作成しても他サービスの入力を消さない。新規構成時だけ明示的に消す。
const configDrafts = new Map();
const configurationReview = new window.ConfigurationReview.ReviewState();
// チェック後に値が変更されたまま生成されないよう、生成入口でも現在値を照合する。
function configurationFingerprint(id) {
  const section = document.querySelector(`#configSections section[data-module-id="${id}"]`);
  if (!section) return null;
  return JSON.stringify({
    projectName: document.getElementById("projectNameInput")?.value || "",
    fields: [...section.querySelectorAll("input[data-field-name], select[data-field-name]")].map(e => [e.dataset.fieldName, e.value]),
    image: window.ImageUI?.selected(id)?.image || null,
  });
}
function updateConfigurationReview() {
  const ids = getSelectedModuleIds();
  const ready = configurationReview.ready(ids, configurationFingerprint);
  let confirmed = 0;
  for (const id of ids) {
    const reviewed = Boolean(configurationReview.states.get(id)?.confirmed);
    if (reviewed) confirmed++;
    const section = document.querySelector(`#configSections section[data-module-id="${id}"]`);
    const check = section?.querySelector(".module-review-checkbox");
    if (check) check.checked = reviewed;
    const status = section?.querySelector(".module-review-status");
    if (status) { status.textContent = reviewed ? "確認済み" : "未確認"; status.dataset.confirmed = String(reviewed); }
  }
  const button = document.getElementById("generateButton");
  if (button) {
    button.disabled = !ready;
    button.textContent = ready ? "構成を実行" : "構成を確認";
  }
  const status = document.getElementById("configurationReviewStatus");
  if (status) status.textContent = `確認済み ${confirmed} / ${ids.length} — ${ready ? "構成を実行できます。" : ids.length ? "各モジュールの設定を確認し、「設定確認」にチェックしてください。" : "モジュールを選択し、設定を確認してください。"}`;
  return ready;
}
function maskSectionSecrets(section) {
  section.querySelectorAll("input[data-secret-field]").forEach(input => { input.type = "password"; });
  section.querySelectorAll(".secret-visibility").forEach(toggle => { toggle.checked = false; });
}
function appendSecretControls(wrapper, input) {
  input.type = "password"; input.dataset.secretField = "true";
  input.autocomplete = "off"; input.spellcheck = false;
  const controls = document.createElement("div"); controls.className = "secret-controls";
  const label = document.createElement("label");
  const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.className = "secret-visibility";
  toggle.addEventListener("change", () => { input.type = toggle.checked ? "text" : "password"; });
  label.append(toggle, document.createTextNode("パスワードを表示"));
  const copy = document.createElement("button"); copy.type = "button"; copy.className = "secret-copy"; copy.textContent = "コピー";
  copy.title = "明示操作でコピーします。クリップボード履歴や他アプリから読み取られる場合があります。";
  const status = document.createElement("span"); status.className = "secret-copy-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  let copying = false;
  const update = () => { copy.disabled = copying || input.value.length === 0; status.textContent = ""; };
  input.addEventListener("input", update); input.addEventListener("change", update); update();
  copy.addEventListener("click", async () => {
    // 秘密値は表示・ログ出力しない。クリック時に限って既存の制限されたClipboard APIへ渡す。
    if (!input.value || copying) return;
    copying = true; copy.disabled = true;
    try { await navigator.clipboard.writeText(input.value); status.textContent = "コピーしました。"; }
    catch { status.textContent = "コピーできませんでした。クリップボードを利用できる状態で再試行してください。"; }
    finally { copying = false; copy.disabled = input.value.length === 0; }
  });
  controls.append(label, copy, status); wrapper.appendChild(controls);
}
function captureConfigDrafts() {
  document.querySelectorAll("#configSections section[data-module-id]").forEach(section => {
    const draft = {};
    section.querySelectorAll("input[data-field-name], select[data-field-name]").forEach(el => { draft[el.dataset.fieldName] = el.value; });
    configDrafts.set(section.dataset.moduleId, draft);
  });
}

// モジュール並び順（同カテゴリ内）
const moduleOrderMap = {
  nginx: 10,
  apache: 11,
  certbot: 12,
  laravel: 20,
  nodejs: 21,
  "python-web": 22,
  wordpress: 23,
  redmine: 24,
  mysql: 30,
  mariadb: 31,
  postgres: 32,
  phpmyadmin: 40,
  redis: 50,
  memcached: 51,
  rabbitmq: 52,
  portainer: 60,
  ollama: 70,
  steamcmd: 80,
};

// カテゴリ並び順
const categoryOrderMap = {
  web: { order: 10, label: "Web サーバ / リバースプロキシ" },
  ssl: { order: 15, label: "SSL / 証明書" },
  app: { order: 20, label: "アプリケーション" },
  db: { order: 30, label: "データベース" },
  dbtool: { order: 40, label: "DB 管理ツール" },
  cache: { order: 50, label: "キャッシュ" },
  queue: { order: 60, label: "メッセージキュー / MQ" },
  management: { order: 70, label: "コンテナ管理 / ツール" },
  ai: { order: 80, label: "AI / LLM" },
  game: { order: 90, label: "ゲーム / SteamCMD" },
  other: { order: 9999, label: "その他" },
};

// モジュール定義 JS から呼び出される
function registerModule(moduleDef) {
  const normalized = { ...moduleDef };

  if (!normalized.id && normalized.moduleId) normalized.id = normalized.moduleId;
  if (!normalized.label && normalized.name) normalized.label = normalized.name;
  if (!normalized.icon && normalized.iconPath) normalized.icon = normalized.iconPath;

  // デフォルトアイコン
  if (!normalized.icon) normalized.icon = "src/img/module_default.png";

  moduleRegistry.push(normalized);
}
// [M01] END

// ==============================
// [M02] モジュール一覧描画
// ==============================
function renderModuleList() {
  const tbody = document.getElementById("moduleListBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const sorted = [...moduleRegistry].sort((a, b) => {
    const catA = categoryOrderMap[a.category] || categoryOrderMap.other;
    const catB = categoryOrderMap[b.category] || categoryOrderMap.other;
    if (catA.order !== catB.order) return catA.order - catB.order;

    const orderA = moduleOrderMap[a.id] ?? 9999;
    const orderB = moduleOrderMap[b.id] ?? 9999;
    return orderA - orderB;
  });

  let currentCategoryLabel = null;

  sorted.forEach((mod) => {
    const catInfo = categoryOrderMap[mod.category] || categoryOrderMap.other;

    if (currentCategoryLabel !== catInfo.label) {
      currentCategoryLabel = catInfo.label;

      const catRow = document.createElement("tr");
      catRow.className = "module-category-row";

      const catCell = document.createElement("td");
      catCell.colSpan = 2;
      catCell.textContent = catInfo.label;

      catRow.appendChild(catCell);
      tbody.appendChild(catRow);
    }

    const tr = document.createElement("tr");
    tr.className = "module-row";
    tr.dataset.moduleId = mod.id;

    const selectTd = document.createElement("td");
    selectTd.className = "module-select-cell";

    const labelTd = document.createElement("td");
    labelTd.className = "module-label-cell";

    const iconWrapper = document.createElement("div");
    iconWrapper.className = "module-icon-wrapper";

    if (mod.icon) {
      const img = document.createElement("img");
      img.className = "module-icon";
      img.src = mod.icon;
      img.alt = `${mod.label || mod.name || mod.id} icon`;
      iconWrapper.appendChild(img);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "module-icon-fallback";
      fallback.textContent = (mod.label || mod.name || "?").charAt(0).toUpperCase();
      iconWrapper.appendChild(fallback);
    }

    const textWrapper = document.createElement("div");
    textWrapper.className = "module-text-wrapper";

    const nameSpan = document.createElement("span");
    nameSpan.className = "module-name";
    nameSpan.textContent = mod.label || mod.name || mod.id || "";

    const descSpan = document.createElement("span");
    descSpan.className = "module-desc";
    descSpan.textContent = mod.description || mod.desc || "";

    textWrapper.appendChild(nameSpan);
    textWrapper.appendChild(descSpan);

    labelTd.appendChild(iconWrapper);
    labelTd.appendChild(textWrapper);

    tr.appendChild(selectTd);
    tr.appendChild(labelTd);

    // 行クリックで選択トグル
    tr.addEventListener("click", () => {
      tr.classList.toggle("is-selected");
      renderConfigSections();
    });

    tbody.appendChild(tr);
  });
}

function getSelectedModuleIds() {
  return Array.from(
    document.querySelectorAll("#moduleListBody tr.module-row.is-selected")
  ).map((row) => row.dataset.moduleId);
}
// [M02] END

// ==============================
// [M03] 構成入力 UI 描画
// ==============================
function renderConfigSections(reset = false) {
  const container = document.getElementById("configSections");
  if (!container) return;

  if (reset === true) { configDrafts.clear(); configurationReview.clear(); } else captureConfigDrafts();
  container.innerHTML = "";

  const selectedIds = getSelectedModuleIds();
  configurationReview.sync(selectedIds);
  const activeModules = moduleRegistry.filter((m) => selectedIds.includes(m.id));

  activeModules.forEach((mod) => {
    const section = document.createElement("section");
    section.className = "card";
    section.dataset.moduleId = mod.id;

    const state = configurationReview.states.get(mod.id);
    const header = document.createElement("div"); header.className = "module-panel-header";
    const h2 = document.createElement("h2"); h2.className = "module-panel-heading";
    const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "module-panel-toggle";
    const icon = document.createElement("img"); icon.src = mod.icon; icon.alt = ""; icon.className = "module-panel-icon";
    const title = document.createElement("span"); title.className = "module-panel-name"; title.textContent = mod.label || mod.name || mod.id || "";
    const arrow = document.createElement("span"); arrow.className = "module-panel-arrow"; arrow.setAttribute("aria-hidden", "true");
    toggle.append(icon, title, arrow); h2.appendChild(toggle);
    const reviewLabel = document.createElement("label"); reviewLabel.className = "module-review-label";
    const review = document.createElement("input"); review.type = "checkbox"; review.className = "module-review-checkbox";
    review.setAttribute("aria-label", `${title.textContent}の設定確認`);
    const reviewStatus = document.createElement("span"); reviewStatus.className = "module-review-status";
    reviewLabel.append(review, document.createTextNode("設定確認"), reviewStatus);
    header.append(h2, reviewLabel); section.appendChild(header);
    const body = document.createElement("div"); body.className = "module-panel-body"; body.id = `module-panel-${mod.id}`;
    toggle.setAttribute("aria-controls", body.id);
    const showPanel = () => {
      body.hidden = !state.expanded; toggle.setAttribute("aria-expanded", String(state.expanded));
      arrow.textContent = state.expanded ? "▾" : "▸";
      if (!state.expanded) maskSectionSecrets(section);
    };
    toggle.addEventListener("click", () => { state.expanded = !state.expanded; showPanel(); });
    review.addEventListener("change", () => { configurationReview.acknowledge(mod.id, configurationFingerprint(mod.id), review.checked); updateConfigurationReview(); });
    section.appendChild(body);
    window.ImageUI?.appendControls(body, mod);
    const draft = configDrafts.get(mod.id) || {};
// 条件付き表示/自動入力のための参照テーブル
const __fieldRows = new Map();
const __fieldInputs = new Map();
const __fieldBrowseBtns = new Map();


    if (mod.description) {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = mod.description;
      body.appendChild(p);
    }

    const advanced = document.createElement("details"); advanced.className = "module-advanced-settings";
    const advancedTitle = document.createElement("summary"); advancedTitle.textContent = "詳細設定（リバースプロキシ）"; advanced.appendChild(advancedTitle);
    (mod.fields || []).forEach((field) => {
      const fieldContainer = field.advanced ? advanced : body;
      const row = document.createElement("div");
      row.className = "field-row";
      row.dataset.fieldName = field.name;
      __fieldRows.set(field.name, row);

      const title = document.createElement("label");
      title.htmlFor = `module-field-${mod.id}-${field.name}`;
      title.textContent = `${field.label}：`;
      row.appendChild(title);

      const wrapper = document.createElement("div");
      wrapper.className = "field-input-wrapper";

      // select 型（options を持つ）に対応
      // 例: { type: "select", options: [{value:"light", label:"ライト"}, ...] }
      if (field.type === "select") {
        const select = document.createElement("select");
        select.id = title.htmlFor;
        select.dataset.fieldName = field.name;
        select.dataset.moduleId = mod.id;

        const opts = field.httpTargets ? [{value:"",label:"転送先を選択してください"}, ...activeModules.filter(m=>window.ProjectGeneration.httpPorts[m.id]).map(m=>({value:m.id,label:m.label||m.id}))] : Array.isArray(field.options) ? field.options : [];
        opts.forEach((opt) => {
          const o = document.createElement("option");
          if (typeof opt === "string") {
            o.value = opt;
            o.textContent = opt;
          } else {
            o.value = String(opt.value ?? "");
            o.textContent = String(opt.label ?? opt.value ?? "");
          }
          select.appendChild(o);
        });

        if (field.default !== undefined) select.value = String(field.default);
        if (Object.hasOwn(draft, field.name)) select.value = draft[field.name];

        select.dataset.fieldName = field.name;
        select.dataset.moduleId = mod.id;
        __fieldInputs.set(field.name, select);

        wrapper.appendChild(select);
        row.appendChild(wrapper);
        fieldContainer.appendChild(row);
        return; // 以降の input 作成処理はスキップ
      }

      const input = document.createElement("input");
      input.id = title.htmlFor;
      input.type = field.type || "text";
      if (field.default !== undefined) input.value = field.default;
      if (Object.hasOwn(draft, field.name)) input.value = draft[field.name];

      input.dataset.fieldName = field.name;
      input.dataset.moduleId = mod.id;
      __fieldInputs.set(field.name, input);

      if (field.min != null) input.min = String(field.min);
      if (field.max != null) input.max = String(field.max);
      if (field.placeholder) input.placeholder = field.placeholder;

      // ポート用トグル（既存：生成側で protocol-toggle-checkbox を参照する）
      if (field.isPort && typeof field.protocol === "string") {
        // ここは既存仕様に合わせて input は通常のまま。
        // protocol UI は他所実装がある前提（現状維持）。
      }

      // フレームワーク種別用トグル（Django / Flask）
      if (field.isFrameworkToggle) {
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "protocol-toggle framework-toggle";

        const toggleCheckbox = document.createElement("input");
        toggleCheckbox.type = "checkbox";
        toggleCheckbox.className = "framework-toggle-checkbox";

        const slider = document.createElement("span");
        slider.className = "protocol-toggle-slider";

        const fwText = document.createElement("span");
        fwText.className = "protocol-toggle-label";

        const updateFramework = () => {
          const current = toggleCheckbox.checked ? "flask" : "django";
          fwText.textContent = current === "django" ? "Django" : "Flask";
          input.value = current;
        };

        toggleCheckbox.checked = input.value === "flask";
        updateFramework();

        toggleCheckbox.addEventListener("change", updateFramework);

        toggleLabel.appendChild(toggleCheckbox);
        toggleLabel.appendChild(slider);
        toggleLabel.appendChild(fwText);

        wrapper.appendChild(toggleLabel);
      }

      // まず入力欄
      wrapper.appendChild(input);
      if (window.ConfigurationReview.isSecretField(field)) appendSecretControls(wrapper, input);

      // パス系入力（例: dataDir / dataPath）はフォルダ選択ボタンを付ける
      // OS 操作は用途を限定した preload API を経由する
      const isDirField = field.isDir === true || field.name === "dataDir" || field.name === "dataPath" || field.name === "dataStorePath";
      if (isDirField) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-browse";
        btn.textContent = "参照";

        btn.addEventListener("click", async () => {
          try {
            const result = await window.electronAPI.pickDirectory("フォルダを選択");
            if (result && !result.canceled && result.path) {
              // Windows の \ を / に統一（既存生成処理と合わせる）
              input.value = String(result.path).replace(/\\/g, "/");
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          } catch (e) {
            console.warn("フォルダ選択に失敗:", e);
          }
        });

        __fieldBrowseBtns.set(field.name, btn);
        wrapper.appendChild(btn);
      }
      row.appendChild(wrapper);

      fieldContainer.appendChild(row);
    });
    if (advanced.children.length > 1) body.appendChild(advanced);


// [Mxx] 条件付き表示 / 自動入力 / 参照ボタン有効化
const __updateConditionalUI = () => {
  const getVal = (name) => {
    const el = __fieldInputs.get(name);
    if (!el) return "";
    return String(el.value ?? "");
  };

  (mod.fields || []).forEach((field) => {
    // 表示制御
    if (field.visibleWhen && field.visibleWhen.field) {
      const actual = getVal(field.visibleWhen.field);
      const ok = actual === String(field.visibleWhen.equals ?? "");
      const row = __fieldRows.get(field.name);
      if (row) row.style.display = ok ? "" : "none";
    }

    // 自動入力（条件一致 & 空欄のみ）
    if (field.autoFillWhen && field.autoFillWhen.field) {
      const actual = getVal(field.autoFillWhen.field);
      const ok = actual === String(field.autoFillWhen.equals ?? "");
      const el = __fieldInputs.get(field.name);
      if (ok && el && String(el.value ?? "").trim() === "") {
        el.value = String(field.autoFillWhen.value ?? "");
      }
    }

    // 参照ボタンの有効/無効
    if (field.browseEnabledWhen && field.browseEnabledWhen.field) {
      const actual = getVal(field.browseEnabledWhen.field);
      const ok = actual === String(field.browseEnabledWhen.equals ?? "");
      const btn = __fieldBrowseBtns.get(field.name);
      if (btn) btn.disabled = !ok;
    }
  });
};

// 監視：条件側フィールド変更で更新
(mod.fields || []).forEach((field) => {
  const deps = [];
  if (field.visibleWhen?.field) deps.push(field.visibleWhen.field);
  if (field.autoFillWhen?.field) deps.push(field.autoFillWhen.field);
  if (field.browseEnabledWhen?.field) deps.push(field.browseEnabledWhen.field);

  deps.forEach((dep) => {
    const el = __fieldInputs.get(dep);
    if (el && !el.dataset.__condBound) {
      el.addEventListener("change", __updateConditionalUI);
      el.addEventListener("input", __updateConditionalUI);
      el.dataset.__condBound = "1";
    }
  });
});

// 初期反映
__updateConditionalUI();

    if (mod.id === "nodejs") {
      const notice = document.createElement("p"); notice.className = "node-runtime-notice";
      const updateNotice = () => {
        const cfg = Object.fromEntries([...__fieldInputs].map(([key, input]) => [key, input.value]));
        notice.textContent = window.ProjectGeneration.nodeAdvice(cfg).join("\n");
      };
      for (const name of ["dataStoreType", "startCmd"]) {
        __fieldInputs.get(name)?.addEventListener("change", updateNotice);
        __fieldInputs.get(name)?.addEventListener("input", updateNotice);
      }
      updateNotice(); body.appendChild(notice);
    }
    // 開閉・確認・秘密値の表示/コピーは入力変更として扱わない。
    const onSettingChanged = event => {
      if (event.target.matches("input[data-field-name], select[data-field-name], .image-series, .image-variant, .framework-toggle-checkbox")) updateConfigurationReview();
    };
    body.addEventListener("input", onSettingChanged); body.addEventListener("change", onSettingChanged);
    container.appendChild(section);
    showPanel();
  });
  const project = document.getElementById("projectNameInput");
  if (project && !project.dataset.reviewBound) {
    project.addEventListener("input", updateConfigurationReview); project.addEventListener("change", updateConfigurationReview); project.dataset.reviewBound = "true";
  }
  updateConfigurationReview();
}
// [M03] END

// ==============================
// [M99] グローバル公開（他モジュールから参照）
// ==============================
window.__rendererModulesUI = {
  moduleRegistry,
  registerModule,
  renderModuleList,
  getSelectedModuleIds,
  renderConfigSections,
  categoryOrderMap,
  moduleOrderMap,
  areAllSettingsConfirmed: updateConfigurationReview,
};

// 互換：既存コードが直接参照していた場合に備えて公開
window.moduleRegistry = moduleRegistry;
window.registerModule = registerModule;
window.renderModuleList = renderModuleList;
window.getSelectedModuleIds = getSelectedModuleIds;
window.renderConfigSections = renderConfigSections;
// [M99] END
