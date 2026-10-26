// src/renderer.js
// ------------------------------------------------------------
// 目次（入口）：全JSの読み込み順を制御し、起動処理を1箇所に集約
// ------------------------------------------------------------

// ==============================
// [R01] サブモジュール読み込み（順序が重要）
// ==============================
import "./renderer/core.js";        // Cxx: ipc/fs/log/utils
import "./image-versions.js";
import "./project-generation.js";
import "./compose-serialization.js";
import "./generation-guide.js";
import "./renderer/image-ui.js";
import "./renderer/generated-files.js";
import "./renderer/generation-guide-ui.js";
import "./renderer/modules_ui.js"; // Mxx: module registry & UI

// --- モジュール定義読み込み（registerModule が必要なのでここが最適）---
import "./modules/nginx.js";
import "./modules/mysql.js";
import "./modules/portainer.js";
import "./modules/redis.js";
import "./modules/phpmyadmin.js";
import "./modules/mariadb.js";
import "./modules/apache.js";
import "./modules/postgres.js";
import "./modules/memcached.js";
import "./modules/rabbitmq.js";
import "./modules/laravel_app.js";
import "./modules/nodejs_app.js";
import "./modules/python.js";
import "./modules/redmine.js";
import "./modules/wordpress.js";
import "./modules/jenkins.js";
import "./modules/ollama.js";
import "./modules/steamcmd.js";
import "./modules/certbot.js";

import "./renderer/generate.js";    // Gxx: generate
import "./renderer/settings.js";    // Sxx: settings load/save/ui
import "./renderer/ui.js";          // Uxx: tabs/theme/buttons/dialogs/menu/boot
// [R01] END

// ==============================
// [R02] 起動処理（DOMContentLoaded）
// ==============================
document.addEventListener("DOMContentLoaded", async () => {
  const appendLog = window.__rendererCore?.appendLog || window.appendLog;

  const log = (msg) => {
    console.log(msg);
    if (typeof appendLog === "function") appendLog(msg);
  };

  try {
    log("[R02] DOMContentLoaded: start");

    // 1) 設定の初期反映（タイムアウト付き）
    const applyInitialSettings =
      window.__rendererSettings?.applyInitialSettings || window.applyInitialSettings;

    if (typeof applyInitialSettings === "function") {
      log("[R02] applyInitialSettings: begin");

      const TIMEOUT_MS = 2000;
      await Promise.race([
        Promise.resolve(applyInitialSettings()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("applyInitialSettings timeout")), TIMEOUT_MS)
        ),
      ]).catch((e) => {
        log("[R02] applyInitialSettings: skipped (" + e.message + ")");
      });

      log("[R02] applyInitialSettings: end");
    } else {
      log("[R02] applyInitialSettings: not found");
    }

    await window.ImageUI.initialize();

    // 2) UI起動（描画・イベント登録）※ここは必ず通したい
    const bootstrapApp = window.__rendererUI?.bootstrapApp || window.bootstrapApp;
    if (typeof bootstrapApp === "function") {
      log("[R02] bootstrapApp: begin");
      bootstrapApp();
      log("[R02] bootstrapApp: end");
    } else {
      log("[R02] bootstrapApp: not found");
    }

    // 3) About 表示の初期更新（存在する場合のみ）
    const updateAboutVersion =
      window.__rendererUI?.updateAboutVersion || window.updateAboutVersion;

    if (typeof updateAboutVersion === "function") {
      log("[R02] updateAboutVersion: begin");
      updateAboutVersion();
      log("[R02] updateAboutVersion: end");
    }
  } catch (err) {
    console.error("renderer 起動処理でエラー:", err);
    log("[R02] fatal error: " + (err?.stack ? err.stack : String(err)));
  }
});
// [R02] END

// ==============================
// [R99] デバッグ用（必要なら）
// ==============================
window.__rendererEntry = {
  loaded: true,
  modules: {
    core: !!window.__rendererCore,
    modules_ui: !!window.__rendererModulesUI,
    generate: !!window.__rendererGenerate,
    settings: !!window.__rendererSettings,
    ui: !!window.__rendererUI,
  },
};
// [R99] END
