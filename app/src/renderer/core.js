// src/renderer/core.js
// ------------------------------------------------------------
// コア部：IPC / FS / Log / 共通ユーティリティ
// ------------------------------------------------------------

// ==============================
// [C01] Electron IPC
// ==============================
const api = window.electronAPI;

// ==============================
// [C03] ログ出力ユーティリティ
// ==============================
async function appendLog(message) {
  const line = `[renderer] ${message}`;
  try {
    if (api) await api.writeLog(line);
    else console.log(line);
  } catch (err) {
    console.error("ログ書き込みに失敗しました:", err);
  }
}
// [C03] END

// ==============================
// [C04] ユーティリティ
// ==============================
function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "myapp";
}

function getCurrentProjectName() {
  const input = document.getElementById("projectNameInput");
  const raw = (input && input.value.trim()) || "myapp";
  return sanitizeName(raw);
}
// [C04] END

// ==============================
// [C99] グローバル公開（他モジュールから参照）
// ==============================
/**
 * renderer.js を ES Modules で分割する都合上、
 * このファイルの中の値はモジュールスコープに閉じます。
 * 既存コードの呼び出し構造を崩さないため、window に公開します。
 */
window.__rendererCore = {
  api,
  appendLog,
  sanitizeName,
  getCurrentProjectName,
};

// 互換：既存コードが直接参照していた場合に備えて公開
window.appendLog = appendLog;
window.sanitizeName = sanitizeName;
window.getCurrentProjectName = getCurrentProjectName;
// [C99] END
