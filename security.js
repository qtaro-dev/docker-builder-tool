const path = require("node:path");
const { pathToFileURL } = require("node:url");

const entryURL = pathToFileURL(path.join(__dirname, "app/index.html")).href;
const themes = new Set(["system", "light", "dark", "blue", "green", "yellow", "orange", "red", "pink", "warm", "cool"]);
const pathKeys = new Set(["projectRoot", "composeDir", "dockerfileDir", "logDir"]);

function text(value, maxLength = 4096) {
  if (typeof value !== "string" || value.length > maxLength || value.includes("\0")) {
    throw new TypeError("Invalid text argument");
  }
  return value;
}

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Invalid object argument");
  }
}

function validateSettings(value) {
  record(value);
  const result = {};
  for (const key of Object.keys(value)) {
    if (key === "defaultProjectName") result[key] = text(value[key], 256);
    else if (key === "theme") {
      if (!themes.has(value[key])) throw new TypeError("Invalid theme");
      result[key] = value[key];
    } else if (key === "paths") {
      record(value.paths);
      result.paths = {};
      for (const name of Object.keys(value.paths)) {
        if (!pathKeys.has(name)) throw new TypeError("Invalid settings path key");
        result.paths[name] = text(value.paths[name]);
      }
    } else throw new TypeError("Invalid settings key");
  }
  return result;
}

function assertTrustedSender(event, window) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      !event.senderFrame || event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== entryURL) {
    throw new Error("Untrusted IPC sender");
  }
}

// 保存先はネイティブダイアログで選んだ新規フォルダ内に限定する。
function validateGeneratedFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 200) throw new TypeError("Invalid file list");
  const seen = new Set(); let total = 0;
  return files.map(file => {
    record(file);
    const relativePath = text(file.relativePath, 400), content = text(file.content, 2 * 1024 * 1024);
    const segments = relativePath.split('/');
    if (segments.some(p => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(p) || /[.]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) ||
        !/^(?:docker-compose\.yml|index\.html|setting\.html|default\.conf|httpd-support\.conf|Dockerfile\.[a-z0-9-]+(?:\.dockerignore)?)$/.test(segments.at(-1)) || seen.has(relativePath.toLowerCase())) throw new TypeError("Invalid generated path");
    seen.add(relativePath.toLowerCase()); total += Buffer.byteLength(content);
    if (total > 8 * 1024 * 1024) throw new TypeError("Generated files too large");
    return {relativePath, content};
  });
}
module.exports = { entryURL, text, record, validateSettings, assertTrustedSender, validateGeneratedFiles };
