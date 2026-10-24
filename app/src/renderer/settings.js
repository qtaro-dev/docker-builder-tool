// src/renderer/settings.js
// ------------------------------------------------------------
// 設定部：設定読み込み ＋ 設定UI ＋ 保存
// ------------------------------------------------------------

/* global window, document */

// ==============================
// [S01] 設定の初期読み込み（起動時）
// ==============================
async function applyInitialSettings() {
  const api = window.electronAPI;
  if (!api) return;

  try {
    const settings = await api.getSettings();

    // テーマ反映
    if (settings && settings.theme) {
      const t = String(settings.theme);
      if (t === "system") {
        const prefersDark =
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", t);
      }
    }

    // プロジェクト名反映
    const pnInput = document.getElementById("projectNameInput");
    if (pnInput && settings && settings.defaultProjectName) {
      pnInput.value = settings.defaultProjectName;
    }

    // 設定ダイアログ初期値（存在する要素だけ更新）
    const sProj = document.getElementById("settingsDefaultProject");
    if (sProj && settings && settings.defaultProjectName) {
      sProj.value = settings.defaultProjectName;
    }

    const sTheme = document.getElementById("settingsTheme");
    if (sTheme && settings && settings.theme) {
      sTheme.value = settings.theme;
    }

    // パス系（新UI：テキスト入力）
    const paths = (settings && settings.paths) || {};

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && typeof v === "string") el.value = v;
    };

    setVal("settingsProjectRootPath", paths.projectRoot || "");
    setVal("settingsComposeDirPath", paths.composeDir || "");
    setVal("settingsDockerfileDirPath", paths.dockerfileDir || "");
    setVal("settingsLogDirPath", paths.logDir || "");

    // ヒントをクリア
    [
      "settingsProjectRootHint",
      "settingsComposeDirHint",
      "settingsDockerfileDirHint",
      "settingsLogDirHint",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = "";
        el.classList.remove("error");
      }
    });
  } catch (err) {
    console.error("設定の初期読み込みに失敗:", err);
  }
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
  const sTheme = document.getElementById("settingsTheme");

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

  if (invalids.length > 0) return { ok: false };

  const newSettings = {
    defaultProjectName: sProj ? sProj.value.trim() || "myapp" : "myapp",
    theme: sTheme ? sTheme.value || "light" : "light",
    paths,
  };

  if (!api) return { ok: false };

  const saved = await api.saveSettings(newSettings);

  // 即時反映：プロジェクト名
  const pn = document.getElementById("projectNameInput");
  if (pn) pn.value = saved.defaultProjectName || "myapp";

  // 即時反映：テーマ
  const t = String(saved.theme || "light");
  if (t === "system") {
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", t);
  }

  // テーマトグル表示も同期（存在する場合のみ）
  const btn = document.getElementById("themeToggleButton");
  if (btn) {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const map = {
      light: "🌙 ダーク",
      dark: "🔥 暖色",
      warm: "❄ 寒色",
      cool: "☀ ライト",
    };
    btn.textContent = map[current] || "テーマ";
  }

  return { ok: true };
}
// [S05] END

// ==============================
// [S06] 設定ダイアログ初期化（保存/キャンセル）
// ==============================
function setupSettingsDialog() {
  setupSettingsNavigation();
  setupFolderPickers();

  const settingsDialog = document.getElementById("settingsDialog");
  const saveBtn = document.getElementById("settingsSaveButton");
  const cancelBtn = document.getElementById("settingsCancelButton");

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        const result = await saveSettingsFromDialog();
        if (result && result.ok) {
          settingsDialog?.close();
        }
      } catch (e) {
        console.error("設定保存に失敗:", e);
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      settingsDialog?.close();
    });
  }
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
};

// 互換：既存コードが直接参照していた場合に備えて公開
window.applyInitialSettings = applyInitialSettings;
window.setupSettingsDialog = setupSettingsDialog;
// [S99] END
