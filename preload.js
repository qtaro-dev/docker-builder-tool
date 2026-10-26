const { contextBridge, ipcRenderer } = require("electron");

// Never expose raw IPC, Electron events, or filesystem access to the page.
contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: () => ipcRenderer.invoke("get-app-version"),
  getImageCatalog: () => ipcRenderer.invoke("images:get"),
  updateImageCatalog: () => ipcRenderer.invoke("images:update"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getSettingsPath: () => ipcRenderer.invoke("settings:path"),
  isDirectory: (path) => ipcRenderer.invoke("directory:check", path),
  initializeProjectPaths: () => ipcRenderer.invoke("settings:initializeProjectPaths"),
  pickDirectory: (title) => ipcRenderer.invoke("dialog:openDirectory", { title }),
  writeLog: (message) => ipcRenderer.invoke("write-log", message),
  saveGeneratedFile: (filename, content) => ipcRenderer.invoke("file:saveGenerated", filename, content),
  onMenuCommand: (handler) => {
    const listener = (_event, command) => handler(command);
    ipcRenderer.on("menu-command", listener);
    return () => ipcRenderer.removeListener("menu-command", listener);
  },
});
