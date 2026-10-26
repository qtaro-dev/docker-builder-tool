// src/renderer/settings.js
// ------------------------------------------------------------
// 設定部：設定読み込み ＋ 設定UI ＋ 保存
// ------------------------------------------------------------

/* global window, document */

let lastSavedSettings = null;
let settingsSession = null;
let settingsMessageKind = "general";
const projectPathFields = [
  { key: "projectRoot", name: "ProjectRoot", label: "プロジェクトフォルダ" },
  { key: "composeDir", name: "ComposeDir", label: "docker-compose.yml 保存場所" },
  { key: "dockerfileDir", name: "DockerfileDir", label: "Dockerfile 保存場所" },
  { key: "logDir", name: "LogDir", label: "ログ保存場所" },
];

// ==============================
// [S01] 設定の初期読み込み（起動時）
// ==============================
async function applyInitialSettings() {
  const api = window.electronAPI;
  if (!api) return;
  try {
    const settings = await api.getSettings();
    lastSavedSettings = settings;
    // テーマ反映は共通処理へ。自動テーマの識別子もここで保持する。
    window.__rendererCore.applyTheme(settings.theme || "light");
    // プロジェクト名反映
    const pnInput = document.getElementById("projectNameInput");
    if (pnInput && settings.defaultProjectName) pnInput.value = settings.defaultProjectName;
    populateSettingsFields(settings);
  } catch (err) {
    console.error("設定の初期読み込みに失敗:", err);
  }
}

// 開き直した際は保存済みのプロジェクト設定を復元し、キャンセルした入力を残さない。
function populateSettingsFields(settings) {
  const sProj = document.getElementById("settingsDefaultProject");
  if (sProj) sProj.value = settings.defaultProjectName || "myapp";
  const mapping = [
    ["ProjectRoot", "projectRoot"], ["ComposeDir", "composeDir"],
    ["DockerfileDir", "dockerfileDir"], ["LogDir", "logDir"],
  ];
  mapping.forEach(([name, key]) => {
    const input = document.getElementById(`settings${name}Path`);
    if (input) input.value = settings.paths?.[key] || "";
    setHint(`settings${name}Hint`, "", false);
  });
}
// [S01] END

// ==============================
// [S02] パス検証・ヒント表示ユーティリティ
// ==============================
async function isValidDirectoryPath(p) {
  if (!p || !window.electronAPI) return false;
  try { return await window.electronAPI.isDirectory(p); }
  catch { return false; }
}

function setHint(id, text, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || "";
  if (isError) el.classList.add("error");
  else el.classList.remove("error");
  if (projectPathFields.some(field => id === `settings${field.name}Hint`)) updateProjectPathMessage();
}

// 外観タブからでも、プロジェクト内のどの項目が保存を妨げているか分かるようにする。
function projectPathErrorMessage(invalids) {
  const labels = projectPathFields.filter(field => invalids.includes(field.key)).map(field => field.label);
  return `プロジェクト内のパス指定を見直してください。\n対象：${labels.join("、")}`;
}

function updateProjectPathMessage() {
  if (!settingsSession) return;
  const invalids = projectPathFields.filter(field =>
    document.getElementById(`settings${field.name}Hint`)?.classList.contains("error")
  ).map(field => field.key);
  if (invalids.length) showSettingsError(projectPathErrorMessage(invalids), "paths");
  else if (settingsMessageKind === "paths") showSettingsError("");
}

async function validateProjectPathsOnOpen() {
  const session = settingsSession;
  await Promise.all(projectPathFields.map(async field => {
    const input = document.getElementById(`settings${field.name}Path`);
    const value = input?.value.trim() || "";
    const valid = !value || await isValidDirectoryPath(value);
    if (settingsSession !== session || input?.value.trim() !== value) return;
    setHint(`settings${field.name}Hint`, valid ? "" : "そのパスは無効です。", !valid);
  }));
}
// [S02] END

// ==============================
// [S03] ネイティブフォルダ選択（フォールバック無し）
// ==============================
async function pickDirectoryViaNativeDialog(title) {
  const api = window.electronAPI;
  if (!api) return null;

  try {
    // main.js 側の dialog:openDirectory を使う（ネイティブな「フォルダ選択」）
    const result = await api.pickDirectory(title);

    // 互換：以前の実装が「文字列」を返すパターンにも対応
    if (typeof result === "string") {
      const p = result.trim();
      return p ? p : null;
    }

    // 推奨：{ canceled: boolean, path: string }
    if (result && result.canceled === false && typeof result.path === "string") {
      const p = result.path.trim();
      return p ? p : null;
    }

    return null;
  } catch {
    return null;
  }
}
// [S03] END

// ==============================
// [S04] 設定画面（2ペイン）UIセットアップ
// ==============================
function setupFolderPickers() {
  const mapping = [
    {
      browseId: "settingsProjectRootBrowse",
      textId: "settingsProjectRootPath",
      hintId: "settingsProjectRootHint",
      title: "プロジェクトフォルダを選択",
    },
    {
      browseId: "settingsComposeDirBrowse",
      textId: "settingsComposeDirPath",
      hintId: "settingsComposeDirHint",
      title: "docker-compose.yml 保存場所を選択",
    },
    {
      browseId: "settingsDockerfileDirBrowse",
      textId: "settingsDockerfileDirPath",
      hintId: "settingsDockerfileDirHint",
      title: "Dockerfile 保存場所を選択",
    },
    {
      browseId: "settingsLogDirBrowse",
      textId: "settingsLogDirPath",
      hintId: "settingsLogDirHint",
      title: "ログ保存場所を選択",
    },
  ];

  mapping.forEach((m) => {
    const btn = document.getElementById(m.browseId);
    const input = document.getElementById(m.textId);

    // --- 「...」ボタン押下：ネイティブのフォルダ選択のみ ---
    if (btn) {
      btn.addEventListener("click", async () => {
        const dir = await pickDirectoryViaNativeDialog(m.title);
        if (!dir) return;

        if (input) input.value = dir;

        const valid = await isValidDirectoryPath(dir);
        if (input && input.value.trim() !== dir) return;
        if (!valid) {
          setHint(m.hintId, "そのパスは無効です。", true);
        } else {
          setHint(m.hintId, "", false);
        }
      });
    }

    // --- 手入力：入力のたびに検証（存在しない場合は無効表示） ---
    if (input) {
      input.addEventListener("input", async () => {
        const v = input.value.trim();
        if (!v) {
          setHint(m.hintId, "", false);
          return;
        }
        const valid = await isValidDirectoryPath(v);
        if (input.value.trim() !== v) return;
        if (!valid) {
          setHint(m.hintId, "そのパスは無効です。", true);
        } else {
          setHint(m.hintId, "", false);
        }
      });
    }
  });
}

function setupSettingsNavigation() {
  const buttons = document.querySelectorAll(".settings-nav-item");
  const sections = document.querySelectorAll(".settings-section");
  if (!buttons || buttons.length === 0) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.section;

      buttons.forEach((b) => b.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      btn.classList.add("active");
      const sec = document.getElementById(`settings-${target}`);
      if (sec) sec.classList.add("active");
    });
  });
}
// [S04] END

// ==============================
// [S05] 設定保存（dialog→settings:save）
// ==============================
async function saveSettingsFromDialog() {
  const api = window.electronAPI;

  const sProj = document.getElementById("settingsDefaultProject");
  const appliedTheme = settingsSession?.appliedTheme || window.__rendererCore.getTheme();

  const projectRoot = document.getElementById("settingsProjectRootPath")?.value?.trim() || "";
  const composeDir = document.getElementById("settingsComposeDirPath")?.value?.trim() || "";
  const dockerfileDir = document.getElementById("settingsDockerfileDirPath")?.value?.trim() || "";
  const logDir = document.getElementById("settingsLogDirPath")?.value?.trim() || "";

  const invalids = [];
  const paths = {};

  if (projectRoot)
    await isValidDirectoryPath(projectRoot) ? (paths.projectRoot = projectRoot) : invalids.push("projectRoot");
  if (composeDir)
    await isValidDirectoryPath(composeDir) ? (paths.composeDir = composeDir) : invalids.push("composeDir");
  if (dockerfileDir)
    await isValidDirectoryPath(dockerfileDir) ? (paths.dockerfileDir = dockerfileDir) : invalids.push("dockerfileDir");
  if (logDir)
    await isValidDirectoryPath(logDir) ? (paths.logDir = logDir) : invalids.push("logDir");

  // invalid のヒント表示
  if (invalids.includes("projectRoot")) setHint("settingsProjectRootHint", "そのパスは無効です。", true);
  if (invalids.includes("composeDir")) setHint("settingsComposeDirHint", "そのパスは無効です。", true);
  if (invalids.includes("dockerfileDir")) setHint("settingsDockerfileDirHint", "そのパスは無効です。", true);
  if (invalids.includes("logDir")) setHint("settingsLogDirHint", "そのパスは無効です。", true);

  if (invalids.length > 0) return { ok: false, error: projectPathErrorMessage(invalids), kind: "paths" };

  const newSettings = {
    defaultProjectName: sProj ? sProj.value.trim() || "myapp" : lastSavedSettings?.defaultProjectName || "myapp",
    theme: appliedTheme,
    paths,
  };

  if (!api) return { ok: false };

  const saved = await api.saveSettings(newSettings);

  // 即時反映：プロジェクト名
  const pn = document.getElementById("projectNameInput");
  if (pn) pn.value = saved.defaultProjectName || "myapp";

  // 適用済みのテーマだけを確定。未適用の選択は保存しない。
  lastSavedSettings = saved;
  window.__rendererCore.applyTheme(saved.theme);

  return { ok: true };
}
// [S05] END

// ==============================
// [S06] 設定ダイアログ初期化（保存/キャンセル）
// ==============================
// ダイアログを開いた時点をトランザクションの境界にする。
function beginSettingsSession() {
  // closeイベントの配送前に開き直した場合も、前回の取り消しを先に完了する。
  if (settingsSession) endSettingsSession();
  const theme = window.__rendererCore.getTheme();
  settingsSession = { originalTheme: theme, selectedTheme: theme, appliedTheme: theme, saving: false, committed: false };
  if (lastSavedSettings) populateSettingsFields(lastSavedSettings);
  showSettingsError("");
  const initializeStatus = document.getElementById("settingsInitializePathsStatus");
  if (initializeStatus) initializeStatus.textContent = "";
  syncAppearance();
  validateProjectPathsOnOpen();
}

function endSettingsSession() {
  const session = settingsSession;
  settingsSession = null;
  if (session && !session.committed) window.__rendererCore.applyTheme(session.originalTheme);
  syncAppearance();
}

function showSettingsError(message, kind = "general") {
  settingsMessageKind = kind;
  const error = document.getElementById("settingsSaveError");
  if (error) { error.textContent = message; error.hidden = !message; }
}

function syncAppearance() {
  const core = window.__rendererCore;
  const selected = settingsSession?.selectedTheme || core.getTheme();
  const applied = settingsSession?.appliedTheme || core.getTheme();
  const saving = !!(settingsSession?.saving || settingsSession?.initializing);
  document.querySelectorAll(".settings-theme-card").forEach(card => {
    const checked = card.dataset.themeId === selected;
    card.setAttribute("aria-checked", String(checked));
    card.tabIndex = checked ? 0 : -1;
    card.disabled = saving;
    // 自動カードの配色見本もOSテーマの変更に追従する。
    card.dataset.palette = card.dataset.themeId === "system"
      ? core.getSystemTheme()
      : card.dataset.themeId;
  });
  const label = id => core.themes.find(([theme]) => theme === id)?.[1] || id;
  const status = document.getElementById("settingsThemeStatus");
  if (status) status.textContent = selected !== applied
    ? `「${label(selected)}」は未適用です。保存するテーマ：${label(applied)}`
    : `適用中：${label(applied)}。保存すると確定します。`;
  const apply = document.getElementById("settingsApplyThemeButton");
  if (apply) apply.disabled = saving || selected === applied;
  const previewName = document.getElementById("settingsPreviewThemeName");
  if (previewName) previewName.textContent = `${label(applied)}の配色見本`;
  ["settingsSaveButton", "settingsCancelButton", "settingsCloseButton", "settingsInitializePathsButton"].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = saving;
  });
  document.getElementById("settingsDialog")?.setAttribute("aria-busy", String(saving));
}

function setupThemeCards() {
  const container = document.getElementById("settingsThemeCards");
  if (!container) return;
  window.__rendererCore.themes.forEach(([id, name]) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "settings-theme-card";
    card.dataset.themeId = id;
    card.setAttribute("role", "radio");
    card.setAttribute("aria-label", id === "system" ? "自動（OSの設定に合わせる）" : name);
    const swatch = document.createElement("span");
    swatch.className = "settings-theme-swatch";
    swatch.setAttribute("aria-hidden", "true");
    const caption = document.createElement("span");
    caption.className = "settings-theme-name";
    caption.textContent = name;
    const check = document.createElement("span");
    check.className = "settings-theme-check";
    check.textContent = "✓";
    check.setAttribute("aria-hidden", "true");
    card.append(swatch, caption, check);
    card.addEventListener("click", () => {
      if (!settingsSession || settingsSession.saving || settingsSession.initializing) return;
      settingsSession.selectedTheme = id;
      syncAppearance();
    });
    // ネイティブボタンのSpace/Enterに加えて、ラジオ選択の矢印キーをサポート。
    card.addEventListener("keydown", event => {
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
      if (!keys.includes(event.key) || settingsSession?.saving || settingsSession?.initializing) return;
      event.preventDefault();
      const cards = Array.from(container.children);
      const index = cards.indexOf(card);
      const next = event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1
        : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + cards.length) % cards.length;
      cards[next].click();
      cards[next].focus();
    });
    container.appendChild(card);
  });
  window.addEventListener("theme-change", syncAppearance);
  syncAppearance();
}

function setupSettingsDialog() {
  setupSettingsNavigation();
  setupFolderPickers();
  setupThemeCards();

  const settingsDialog = document.getElementById("settingsDialog");
  const saveBtn = document.getElementById("settingsSaveButton");
  const cancelBtn = document.getElementById("settingsCancelButton");
  document.getElementById("settingsInitializePathsButton")?.addEventListener("click", async () => {
    if (!settingsSession || settingsSession.saving || settingsSession.initializing) return;
    const session = settingsSession;
    const status = document.getElementById("settingsInitializePathsStatus");
    session.initializing = true;
    if (status) status.textContent = "既定フォルダを作成しています…";
    syncAppearance();
    try {
      const paths = await window.electronAPI.initializeProjectPaths();
      if (settingsSession !== session) return;
      // テーマや既存ファイルは変更せず、パスの入力欄だけを初期化する。
      projectPathFields.forEach(field => {
        document.getElementById(`settings${field.name}Path`).value = paths[field.key];
        setHint(`settings${field.name}Hint`, "", false);
      });
      showSettingsError("");
      if (status) status.textContent = "既定フォルダを作成しました。「保存」で設定を確定してください。";
    } catch {
      if (settingsSession !== session) return;
      if (status) status.textContent = "初期化できませんでした。";
      showSettingsError("既定フォルダを作成できませんでした。アプリのルートへの書き込み権限や、同名ファイル・リンクの有無を確認してください。");
    } finally {
      session.initializing = false;
      syncAppearance();
    }
  });
  document.getElementById("settingsApplyThemeButton")?.addEventListener("click", () => {
    if (!settingsSession || settingsSession.saving || settingsSession.initializing) return;
    settingsSession.appliedTheme = settingsSession.selectedTheme;
    window.__rendererCore.applyTheme(settingsSession.appliedTheme);
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (!settingsSession || settingsSession.saving || settingsSession.initializing) return;
      const session = settingsSession;
      session.saving = true;
      showSettingsError("");
      syncAppearance();
      try {
        const result = await saveSettingsFromDialog();
        if (result?.ok) {
          session.committed = true;
          settingsDialog.close();
        } else {
          showSettingsError(result?.error || "設定を保存できませんでした。入力内容を確認してください。", result?.kind);
        }
      } catch (e) {
        console.error("設定保存に失敗:", e);
        showSettingsError("設定を保存できませんでした。保存先の権限などを確認して再試行してください。");
      } finally {
        session.saving = false;
        syncAppearance();
      }
    });
  }
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    if (!settingsSession || settingsSession.saving || settingsSession.initializing) return;
    // キャンセルはテーマだけを開いた時点へ戻す。画面とプロジェクトの入力は維持する。
    settingsSession.selectedTheme = settingsSession.originalTheme;
    settingsSession.appliedTheme = settingsSession.originalTheme;
    window.__rendererCore.applyTheme(settingsSession.originalTheme);
  });
  const closeBtn = document.getElementById("settingsCloseButton");
  closeBtn?.addEventListener("click", () => {
    if (!settingsSession?.saving && !settingsSession?.initializing) settingsDialog.close();
  });
  // Escapeも標準のcloseイベントへ集約し、保存成功以外は必ず元へ戻す。
  settingsDialog?.addEventListener("cancel", event => {
    if (settingsSession?.saving || settingsSession?.initializing) event.preventDefault();
  });
  settingsDialog?.addEventListener("close", () => {
    // 前回のcloseイベントで、開き直した新しいセッションを破棄しない。
    if (!settingsDialog.open) endSettingsSession();
  });
}
// [S06] END

// ==============================
// [S99] グローバル公開（他モジュールから参照）
// ==============================
window.__rendererSettings = {
  applyInitialSettings,
  isValidDirectoryPath,
  setHint,
  pickDirectoryViaNativeDialog,
  setupFolderPickers,
  setupSettingsNavigation,
  saveSettingsFromDialog,
  setupSettingsDialog,
  beginSettingsSession,
};

// 互換：既存コードが直接参照していた場合に備えて公開
window.applyInitialSettings = applyInitialSettings;
window.setupSettingsDialog = setupSettingsDialog;
// [S99] END
