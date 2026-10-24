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

module.exports = { entryURL, text, record, validateSettings, assertTrustedSender };
