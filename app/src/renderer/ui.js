// src/renderer/ui.js
// ------------------------------------------------------------
// UI部：タブ / テーマ / 結果ボタン / ダイアログ / メニュー / ショートカット / About / 初期化
// ------------------------------------------------------------

/* global window, document */

// ==============================
// [U01] タブ切り替え
// ==============================
let __tabsBound = false;

function resolveTabPanelId(target) {
  // 1) そのまま（例: id="config"）
  const direct = document.getElementById(target);
  if (direct) return target;

  // 2) よくある prefix パターン（例: id="tab-config"）
  const prefixed = document.getElementById(`tab-${target}`);
  if (prefixed) return `tab-${target}`;

  // 3) よくある suffix パターン（例: id="config-panel"）
  const suffixed = document.getElementById(`${target}-panel`);
  if (suffixed) return `${target}-panel`;

  // 4) data 属性で持っているパターン（例: data-panel="config"）
  const byDataPanel = document.querySelector(`[data-panel="${target}"]`);
  if (byDataPanel && byDataPanel.id) return byDataPanel.id;

  // 見つからない
  return null;
}

// タブ初期化
function setupTabs() {
  // 既にイベント登録済みなら何もしない（分割後の二重初期化対策）
  if (__tabsBound) return true;

  // タブボタン候補
  let tabButtons = document.querySelectorAll(".tab-button");
  if (!tabButtons || tabButtons.length === 0) {
    // class が異なる場合に備えて data-tab で拾う
    tabButtons = document.querySelectorAll("[data-tab]");
  }

  // ボタンが 1 個も見つからなければ未初期化として false
  if (!tabButtons || tabButtons.length === 0) {
    console.warn("[U01] setupTabs: tab buttons not found yet");
    return false;
  }

  // メインタブのパネルは明示的に固定指定する
  const tabPanels = document.querySelectorAll(
    "#tab-modules, #tab-config, #tab-output"
  );


  // ボタンにクリックイベント登録
  tabButtons.forEach((btn) => {
    // 二重バインド防止（ボタン単位）
    if (btn.dataset && btn.dataset.tabBound === "1") return;
    if (btn.dataset) btn.dataset.tabBound = "1";

    btn.addEventListener("click", () => {
      const target = btn.dataset ? btn.dataset.tab : null;
  
      // target がない場合は警告して終了
      if (!target) {
        console.warn("[U01] setupTabs: clicked button has no data-tab");
        return;
      }

      // 対象パネルIDを解決（config → config / tab-config / config-panel など）
      const resolvedId = resolveTabPanelId(target);

      // タブ移動時は「構成入力」側のメッセージをクリアして判別しやすくする
      const portMessage = document.getElementById('portMessage');
      if (portMessage) {
        portMessage.textContent = '';
        portMessage.classList.remove('port-message-error', 'port-message-warning', 'port-message-ok');
      }

      // active を解除
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));

      // ボタンを active に
      btn.classList.add("active");

      // パネルを active に
      if (resolvedId) {
        const panel = document.getElementById(resolvedId);
        if (panel) {
          panel.classList.add("active");
        } else {
          // resolve できたのに DOM から取れないケースは想定外なので警告
          console.warn("[U01] setupTabs: resolved but element not found:", resolvedId);
        }
      } else {
        console.warn("[U01] setupTabs: panel not found for id:", target);
      }
    });
  });

  __tabsBound = true;
  return true;
}
// [U01] END


// ==============================
// [U02] テーマ切り替え
// ==============================
function setupThemeToggle() {
  const core = window.__rendererCore;
  const btn = document.getElementById("themeToggleButton");
  if (!btn || !core) return;
  const order = ["light", "dark", "blue", "green", "yellow", "orange", "red", "pink"];
  core.applyTheme(core.getTheme());

  // 現在値は共通処理から取得し、設定画面で適用した後も矛盾させない。
  btn.addEventListener("click", async () => {
    if (document.getElementById("settingsDialog")?.open) return;
    const previous = core.getTheme();
    const current = previous === "system" ? core.getEffectiveTheme() : previous;
    const next = order[(Math.max(0, order.indexOf(current)) + 1) % order.length];
    btn.disabled = true;
    core.applyTheme(next);
    try { await window.electronAPI?.saveSettings({ theme: next }); }
    catch (err) {
      core.applyTheme(previous);
      console.error("テーマ設定の保存に失敗:", err);
    } finally { btn.disabled = false; }
  });
}

// [U02] END


// ==============================
// [U03] 生成結果ボタン（ダウンロード/コピー/クリア）
// ==============================
function setupResultButtons() {
  const pairs = [
    {
      downloadId: "composeDownloadBtn",
      copyId: "composeCopyBtn",
      clearId: "composeClearBtn",
      textareaId: "composeOutput",
      filename: "docker-compose.yml",
    },
    {
      downloadId: "dockerfileDownloadBtn",
      copyId: "dockerfileCopyBtn",
      clearId: "dockerfileClearBtn",
      textareaId: "dockerfileOutput",
      filename: "Dockerfile",
    },
  ];

  // 各ボタンにイベント登録
  pairs.forEach((p) => {
    const textarea = document.getElementById(p.textareaId);
    if (!textarea) return;

    const dlBtn = document.getElementById(p.downloadId);
    if (dlBtn) {
      dlBtn.addEventListener("click", async () => {
        try {
          const selected = p.textareaId === "dockerfileOutput" ? window.GeneratedFiles.current() : null;
          if (p.textareaId === "dockerfileOutput" && !selected) return;
          const result = await window.electronAPI.saveGeneratedFile(selected?.filename || p.filename, textarea.value || "");
          const status = document.getElementById("generatedSaveStatus");
          status.textContent = result.canceled ? "保存をキャンセルしました。" : `保存先：${result.path || "選択したファイル"}${result.placementWarning ? "\n注意：" + result.placementWarning : "\n必要な配置は「構成ファイルの配置・起動ガイド」を確認してください。"}`;
        } catch (err) {
          console.error("ファイルの保存に失敗:", err);
          alert("ファイルの保存に失敗しました。保存先の権限や空き容量を確認してください。");
        }
      });
    }

    // コピー・クリアボタン
    const copyBtn = document.getElementById(p.copyId);
    if (copyBtn && navigator.clipboard) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(textarea.value || "");
      });
    }

    // クリアボタン
    const clearBtn = document.getElementById(p.clearId);
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        textarea.value = "";
        if (p.textareaId === "composeOutput") window.GenerationGuideUI.clear();
      });
    }
  });
}
// [U03] END

// ==============================
// [U04] 生成ボタン・生成実行
// ==============================
function setupGenerateButton() {
  const btn = document.getElementById("generateButton");
  if (!btn) return;

  const handler =
    window.__rendererGenerate?.handleGenerateClick || window.handleGenerateClick;

  btn.addEventListener("click", () => {
    if (typeof handler === "function") handler();
  });
}
// [U04] END

// ==============================
// [U05] ダイアログ（設定/About）表示・閉じる
// ==============================
function openSettingsDialog() {
  const dlg = document.getElementById("settingsDialog");
  if (dlg && typeof dlg.showModal === "function") {
    if (dlg.open) return;
    window.__rendererSettings.beginSettingsSession();
    dlg.showModal();
  }
}

  // About ダイアログ表示
  function openAboutDialog() {
    const dlg = document.getElementById("aboutDialog");
    if (dlg && typeof dlg.showModal === "function") {
      const update = window.__rendererAbout?.updateAboutVersion || window.updateAboutVersion;
      if (typeof update === "function") update();
      dlg.showModal();
    }
  }

/**
 * setupDialogs は「閉じる」系だけ担当
 * （保存は settings.js の setupSettingsDialog に一本化）
 */
  // ダイアログ閉じるボタン設定
  function setupDialogs() {
    const aboutDialog = document.getElementById("aboutDialog");

    const aboutClose = document.getElementById("aboutCloseButton");
  
  // 閉じるイベント登録
    // 設定画面の終了・取り消し処理は settings.js に一本化する。

  // About 閉じるイベント登録
    if (aboutClose && aboutDialog) {
      aboutClose.addEventListener("click", () => aboutDialog.close());
    }
}
// [U05] END

// ==============================
// [U06] 生成結果のみクリア
// ==============================
function clearResultsOnly() {
  window.GeneratedFiles?.set([]);
  const composeOutput = document.getElementById("composeOutput");
  const dockerfileOutput = document.getElementById("dockerfileOutput");
  if (composeOutput) composeOutput.value = "";
  if (dockerfileOutput) dockerfileOutput.value = "";

  // ポートメッセージなどリセット
  const msg = document.getElementById("portMessage");
  if (msg) {
    msg.textContent = "";
    msg.className = "generate-message";
  }
}
// [U06] END

// ==============================
// [U07] 構成全体リセット
// ==============================
function resetConfiguration() {
  // モジュール選択解除
  document
    .querySelectorAll("#moduleListBody tr.module-row.is-selected")
    .forEach((row) => row.classList.remove("is-selected"));

  // プロジェクト名を既定値に
  const projectInput = document.getElementById("projectNameInput");
  if (projectInput) projectInput.value = "myapp";

  // 構成入力エリア再描画
  const renderConfigSections =
    window.__rendererModulesUI?.renderConfigSections || window.renderConfigSections;
  window.ImageUI?.reset();
  if (typeof renderConfigSections === "function") renderConfigSections(true);

  // ポートメッセージなどリセット
  const msg = document.getElementById("portMessage");
  if (msg) {
    msg.textContent = "";
    msg.className = "generate-message";
  }

  // 生成セパレータ非アクティブ化
  const separator = document.getElementById("generateSeparator");
  if (separator) separator.classList.remove("active");

  // 生成結果も合わせてクリア
  clearResultsOnly();

  // ポートハイライト解除
  document
    .querySelectorAll("input.port-conflict")
    .forEach((el) => el.classList.remove("port-conflict"));
}
// [U07] END

// ==============================
// [U08] メニューコマンド連携
// ==============================
function setupMenuIntegration() {
  const api = window.electronAPI;
  if (!api) return;

  api.onMenuCommand((command) => {
    switch (command) {
      case "file-new":
        resetConfiguration();
        break;
      case "file-generate": {
        const handler =
          window.__rendererGenerate?.handleGenerateClick || window.handleGenerateClick;
        if (typeof handler === "function") handler();
        break;
      }
      // 生成結果クリア
      case "file-clear-results":
        clearResultsOnly();
        break;
      
      // 設定ダイアログ表示
      case "open-settings":
        openSettingsDialog();
        break;
      
      // About ダイアログ表示
      case "help-about":
        openAboutDialog();
        break;
      default:
        break;
    }
  });
}
// [U08] END

// ==============================
// [U09] ショートカット無効化レイヤ（将来拡張用）
// ==============================
function setupShortcutLayer() {
  const appendLog = window.__rendererCore?.appendLog || window.appendLog;

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    // 標準ショートカット（コピー等）は邪魔しない
    const safeKeys = ["c", "v", "x", "a", "z", "y"];
    if (safeKeys.includes(String(e.key || "").toLowerCase())) return;

    // 将来ユーザ定義が来たらここで拾う
    if (typeof appendLog === "function") {
      appendLog(`shortcut ignored: ${e.key} (ctrl/meta)`);
    }
  });
}
// [U09] END

// ==============================
// [U10] About：バージョン表示更新
// ==============================
function updateAboutVersion() {
  const span = document.getElementById("aboutVersion");
  if (!span) return;

  const api = window.electronAPI;
  // バージョン取得用 IPC レンダラー
  if (!api) {
    span.textContent = "開発版";
    return;
  }

  // バージョン取得要求
  api
    .getVersion()
    .then((ver) => {
      span.textContent = ver;
    })
    .catch((err) => {
      console.error("バージョン取得に失敗:", err);
      span.textContent = "取得エラー";
    });
}
// [U10] END

// ==============================
// [U11] 初期化（bootstrap）
// ==============================
function bootstrapApp() {
  // 先に一度タブ初期化を試す（DOM が揃っていればここで完了）
  const tabsOkFirst = setupTabs();

  // ここから下は「既存の呼び出し順」を維持しつつ、最後にもう一度タブを再試行する
  const renderModuleList =
    window.__rendererModulesUI?.renderModuleList || window.renderModuleList;
  if (typeof renderModuleList === "function") renderModuleList();

  const renderConfigSections =
    window.__rendererModulesUI?.renderConfigSections || window.renderConfigSections;
  if (typeof renderConfigSections === "function") renderConfigSections();

  setupGenerateButton();
  setupResultButtons();
  window.GeneratedFiles.bind();
  window.GenerationGuideUI.bind();
  setupThemeToggle();

  // ダイアログ（閉じる）
  setupDialogs();

  // 設定ダイアログ（保存/キャンセル）
  const setupSettingsDialog =
    window.__rendererSettings?.setupSettingsDialog || window.setupSettingsDialog;
  if (typeof setupSettingsDialog === "function") setupSettingsDialog();

  // メニュー連携
  setupMenuIntegration();

  // ショートカット層
  setupShortcutLayer();

  // タブ初期化が最初に失敗していた場合、DOM 構築後に再試行する
  if (!tabsOkFirst) {
    setTimeout(() => {
      setupTabs();
    }, 0);
  }
}
// [U11] END

// ==============================
// [U99] グローバル公開
// ==============================
window.__rendererUI = {
  setupTabs,
  setupThemeToggle,
  setupResultButtons,
  setupGenerateButton,
  openSettingsDialog,
  openAboutDialog,
  setupDialogs,
  clearResultsOnly,
  resetConfiguration,
  setupMenuIntegration,
  setupShortcutLayer,
  updateAboutVersion,
  bootstrapApp,
};

// 互換：既存コードが参照していた場合に備えて公開
window.bootstrapApp = bootstrapApp;
window.updateAboutVersion = updateAboutVersion;
// [U99] END
