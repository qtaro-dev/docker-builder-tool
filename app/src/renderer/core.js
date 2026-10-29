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
// [C05] テーマの共通反映（保存は呼び出し側で明示的に行う）
// ==============================
const themes = [
  ["system", "自動", "🖥"], ["light", "ライト", "☀"], ["dark", "ダーク", "🌙"],
  ["blue", "青", "🔵"], ["green", "緑", "🟢"], ["yellow", "黄", "🟡"],
  ["orange", "オレンジ", "🟠"], ["red", "赤", "🔴"], ["pink", "ピンク", "🌸"],
];
let currentTheme = document.documentElement.getAttribute("data-theme") || "light";
const systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
function getTheme() { return currentTheme; }
function getSystemTheme() { return systemThemeQuery?.matches ? "dark" : "light"; }
function getEffectiveTheme() {
  return currentTheme === "system" ? getSystemTheme() : currentTheme;
}
function applyTheme(theme) {
  // warm/cool は旧設定との互換用。選択カードには既存の9テーマだけを表示する。
  if (!themes.some(([id]) => id === theme) && !["warm", "cool"].includes(theme)) return;
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", getEffectiveTheme());
  const button = document.getElementById("themeToggleButton");
  const definition = themes.find(([id]) => id === theme);
  if (button) button.textContent = definition ? `${definition[2]} ${definition[1]}` : "テーマ";
  window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme, effectiveTheme: getEffectiveTheme() } }));
}
// 「自動」という設定値を保ち、OSの変更時には配色だけを追従させる。
systemThemeQuery?.addEventListener("change", () => {
  if (currentTheme === "system") applyTheme("system");
});
// [C05] END

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
  themes,
  getTheme,
  getSystemTheme,
  getEffectiveTheme,
  applyTheme,
};

// 互換：既存コードが直接参照していた場合に備えて公開
window.appendLog = appendLog;
window.sanitizeName = sanitizeName;
window.getCurrentProjectName = getCurrentProjectName;
// [C99] END
