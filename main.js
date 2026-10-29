// main.js
// Electron メインプロセス

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { createStore } = require("./image-catalog");
const { buildModules } = require("./app/src/project-generation");
const { describeApp } = require("./app-info");
const { openUserManual } = require("./user-manual");
const { applicationPaths, writableLogPath } = require("./app-paths");
const runtimePaths = applicationPaths({isPackaged:app.isPackaged,exePath:app.getPath("exe"),appDirectory:__dirname,userDataDirectory:app.getPath("userData"),portableDirectory:process.env.PORTABLE_EXECUTABLE_DIR});
if (runtimePaths.portable) {
  // Portableのプロファイル・カタログもEXE隣へ置き、インストール版と分離する。
  try {
    fs.mkdirSync(runtimePaths.userData,{recursive:true});
  } catch {
    runtimePaths.userData=path.join(app.getPath("appData"),"Docker Builder Tool Portable");
    fs.mkdirSync(runtimePaths.userData,{recursive:true});
  }
  app.setPath("userData",runtimePaths.userData);
  app.setPath("sessionData",path.join(runtimePaths.userData,"session"));
}
const imageStore = createStore(app.getPath("userData"), require("./app/data/image-catalog.json"));

const { entryURL, text, record, validateSettings, assertTrustedSender } = require("./security");

let mainWindow;
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event, mainWindow);
    return callback(event, ...args);
  });
}

// IPC: アプリバージョン取得
handle("get-app-version", () => app.getVersion());

// 固定された配布元のメタデータだけを取得。Rendererに通信権限は与えない。
handle("images:get", () => imageStore.read());
handle("images:update", async () => {
  try { return { ok: true, catalog: await imageStore.update() }; }
  catch (error) { return { ok: false, error: error.message, catalog: await imageStore.read() }; }
});

// アプリ本体のあるフォルダ
const appRootDir = runtimePaths.appRoot;

// ログファイル
const logFilePath = writableLogPath(appRootDir, app.getPath("userData"));

// About専用の表示情報。既存のバージョンIPC・ログの保存方式は維持する。
handle("about:info", () => ({
  ...describeApp(app.getVersion()),
  license: require("./package.json").license || null,
  logFilePath,
}));
// RendererからURLを受け取らず、利用者のクリック時だけ固定の公開ページを開く。
handle("about:openProjectPage", () => shell.openExternal("https://github.com/qtaro-dev/docker-builder-tool"));

// --------------------------------------
// ログ初期化
// --------------------------------------
function ensureLogFileExists() {
  try {
    const dir = path.dirname(logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, "", "utf8");
    }
  } catch (err) {
    console.error("failed to init log file:", err);
  }
}

// --------------------------------------
// BrowserWindow
// --------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    title: describeApp(app.getVersion()).title,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
    },
  });

  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-redirect", (event) => event.preventDefault());
  contents.on("will-attach-webview", (event) => event.preventDefault());
  const allowClipboardWrite = (sender, permission, details) =>
    sender === contents && sender.mainFrame.url === entryURL &&
    permission === "clipboard-sanitized-write" && details.isMainFrame &&
    details.requestingUrl === entryURL;
  contents.session.setPermissionRequestHandler((sender, permission, callback, details) =>
    callback(allowClipboardWrite(sender, permission, details)));
  contents.session.setPermissionCheckHandler((sender, permission, _origin, details) =>
    allowClipboardWrite(sender, permission, details));
  contents.session.setDevicePermissionHandler(() => false);

  mainWindow.loadFile(path.join(__dirname, "app/index.html"));

  const menu = Menu.buildFromTemplate(buildAppMenuTemplate());
  Menu.setApplicationMenu(menu);

  // mainWindow.webContents.openDevTools();
}

// --------------------------------------
// メニュー定義（ショートカット完全撤去）
// --------------------------------------
function buildAppMenuTemplate() {
  return [
    {
      label: "ファイル",
      submenu: [
        {
          label: "新規構成",
          click: () => {
            mainWindow?.webContents.send("menu-command", "file-new");
          },
        },
        {
          label: "生成開始",
          click: () => {
            mainWindow?.webContents.send("menu-command", "file-generate");
          },
        },
        {
          label: "生成結果をクリア",
          click: () => {
            mainWindow?.webContents.send(
              "menu-command",
              "file-clear-results"
            );
          },
        },
        { type: "separator" },
        {
          label: "終了",
          role: process.platform === "darwin" ? "close" : "quit",
        },
      ],
    },
    {
      label: "編集",
      submenu: [
        { role: "undo", label: "元に戻す" },
        { role: "redo", label: "やり直し" },
        { type: "separator" },
        { role: "cut", label: "切り取り" },
        { role: "copy", label: "コピー" },
        { role: "paste", label: "貼り付け" },
        { role: "delete", label: "削除" },
        { type: "separator" },
        { role: "selectAll", label: "すべて選択" },
      ],
    },
    {
      label: "表示",
      submenu: [
        { role: "zoomIn", label: "拡大" },
        { role: "zoomOut", label: "縮小" },
        { type: "separator" },
        { role: "toggleDevTools", label: "開発者ツール" },
      ],
    },
    {
      label: "設定",
      submenu: [
        {
          label: "設定...",
          click: () => {
            mainWindow?.webContents.send("menu-command", "open-settings");
          },
        },
      ],
    },
    {
      label: "ウィンドウ",
      submenu: [
        {
          label: "最大化",
          click: () => mainWindow?.maximize(),
        },
        {
          label: "標準サイズ",
          click: () => mainWindow?.unmaximize(),
        },
        {
          label: "最小化",
          role: "minimize",
        },
      ],
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "バージョン情報",
          click: () => {
            mainWindow?.webContents.send("menu-command", "help-about");
          },
        },
        {
          label: "ユーザーマニュアル",
          click: async () => {
            try {
              await openUserManual({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appDirectory: __dirname, manualCacheDirectory: runtimePaths.portable ? path.join(app.getPath("userData"),"manual",`${app.getVersion()}-release${describeApp().releaseNumber}`) : undefined, shell });
            } catch {
              dialog.showErrorBox("ユーザーマニュアルを開けませんでした", "同梱のマニュアルが見つからないか、ブラウザを起動できませんでした。アプリの再配置・再インストールをご確認ください。");
            }
          },
        },
        {
          label: "ログファイル閲覧",
          click: () => {
            shell.openPath(logFilePath);
          },
        },
      ],
    },
  ];
}


// --------------------------------------
// フォルダ選択ダイアログ（renderer から呼ぶ）
// --------------------------------------
handle("dialog:openDirectory", async (_event, options = {}) => {
  record(options);
  const title = options.title === undefined ? "フォルダを選択" : text(options.title, 256);
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ["openDirectory"],
  });

  if (result.canceled) return { canceled: true, path: "" };
  return { canceled: false, path: result.filePaths[0] || "" };
});

// --------------------------------------
// 設定管理
// --------------------------------------
// 設定ファイルの保存先
// 優先：アプリのルートフォルダ（ユーザー要望）
// ただし、書き込み権限が無い環境（Program Files 配下等）では userData にフォールバックします。
const rootSettingsPath = path.join(appRootDir, "settings.json");
const userSettingsPath = path.join(app.getPath("userData"), "settings.json");

function resolveSettingsPathForRead() {
  if (fs.existsSync(rootSettingsPath)) return rootSettingsPath;
  if (fs.existsSync(userSettingsPath)) return userSettingsPath;
  // 既存が無い場合は root を優先（書けない場合は save 側でフォールバック）
  return rootSettingsPath;
}

function resolveSettingsPathForWrite() {
  try {
    // ルートフォルダに書き込めるかチェック
    fs.accessSync(appRootDir, fs.constants.W_OK);
    return rootSettingsPath;
  } catch {
    return userSettingsPath;
  }
}

let settingsPath = resolveSettingsPathForRead();

const defaultSettings = {
  defaultProjectName: "myapp",
  theme: "light",
  paths: {
    projectRoot: "",
    composeDir: "",
    dockerfileDir: "",
    logDir: "",
  },
};

function loadSettings() {
  settingsPath = resolveSettingsPathForRead();
  try {
    if (fs.existsSync(settingsPath)) {
      return {
        ...defaultSettings,
        ...validateSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8"))),
      };
    }
  } catch (err) {
    console.error("設定の読み込みに失敗:", err);
  }
  return { ...defaultSettings };
}

function saveSettings(newSettings) {
  settingsPath = resolveSettingsPathForWrite();
  try {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(newSettings, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("設定の保存に失敗:", err);
    throw err;
  }
}

let currentSettings = loadSettings();

// 作成先はmain側の固定パスだけ。rendererから任意の保存先・名前を受け取らない。
handle("settings:initializeProjectPaths", async () => {
  const paths = {
    projectRoot: path.join(appRootDir, "Project"),
    composeDir: path.join(appRootDir, "Project", "docker-compose"),
    dockerfileDir: path.join(appRootDir, "Project", "Dockerfiles"),
    logDir: path.join(appRootDir, "logs"),
  };
  for (const directory of Object.values(paths)) {
    let stat;
    try { stat = await fs.promises.lstat(directory); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    // 既存データは消さず、リンク経由でアプリ外へ作成することも避ける。
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new Error("既定パスにフォルダ以外の項目またはリンクがあります。");
    }
    if (!stat) await fs.promises.mkdir(directory);
  }
  // 初期化は作成と入力値の提供まで。設定ファイルは「保存」で確定する。
  return paths;
});

handle("directory:check", async (_event, value) => {
  const directory = text(value);
  if (!directory) return false;
  try { return (await fs.promises.stat(directory)).isDirectory(); }
  catch { return false; }
});

// The renderer supplies content, never an arbitrary destination path. A native
// save dialog gives the user control of the destination and overwrite consent.
let lastComposeDirectory;
handle("file:saveGenerated", async (_event, filename, content) => {
  const generatedNames = [...buildModules, "nginx", "apache"].flatMap(id => [`Dockerfile.${id}`, `Dockerfile.${id}.dockerignore`]);
  if (!["docker-compose.yml", "Dockerfile", "index.html", "setting.html", "default.conf", "httpd-support.conf", ...generatedNames].includes(filename)) {
    throw new TypeError("Invalid generated filename");
  }
  content = text(content, 2 * 1024 * 1024);
  const moduleId = filename.slice("Dockerfile.".length).replace(/\.dockerignore$/, "");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "生成ファイルを保存",
    defaultPath: lastComposeDirectory && filename.startsWith("Dockerfile.")
      ? path.join(lastComposeDirectory, moduleId, filename) : filename,
    properties: ["showOverwriteConfirmation"],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.promises.writeFile(result.filePath, content, "utf8");
  if (filename === "docker-compose.yml") lastComposeDirectory = path.dirname(result.filePath);
  const expected = filename.startsWith("Dockerfile.") && lastComposeDirectory
    ? path.join(lastComposeDirectory, moduleId, filename) : null;
  return { canceled: false, path: result.filePath,
    placementWarning: expected && path.resolve(result.filePath) !== path.resolve(expected)
      ? `Composeが参照する場所は ${expected} です。移動するかComposeのbuild指定を合わせてください。` : "" };
});

handle("file:saveBundle", async (_event, input, projectName) => {
  const files = require("./security").validateGeneratedFiles(input);
  const {saveBundle,projectFolderName} = require("./app/bundle-save");
  try { projectFolderName(projectName); } catch (e) { return {error:e.message}; }
  const choice = await dialog.showOpenDialog(mainWindow, {title:`生成ファイル一式の保存先（直下に ${projectName} フォルダを作成）`,properties:["openDirectory","createDirectory"]});
  if (choice.canceled || !choice.filePaths?.[0]) return {canceled:true};
  try {
    return await saveBundle({parent:choice.filePaths[0],projectName,files,
      conflict:async ({destination,alternative}) => {
        const result = await dialog.showMessageBox(mainWindow, {type:"question",title:"同名フォルダが存在します",message:`保存先：${destination}`,detail:`既存ファイルは確認前に変更しません。\n別名の候補：${alternative}`,buttons:["既存フォルダに保存","別名で保存","キャンセル"],defaultId:2,cancelId:2,noLink:true});
        return ["existing","alternative","cancel"][result.response];
      },
      overwrite:async ({destination,overwritten,added}) => {
        const result = await dialog.showMessageBox(mainWindow, {type:"warning",title:"生成ファイルの保存確認",message:`${destination} に保存しますか？`,detail:`上書き対象（${overwritten.length}件）：\n${overwritten.join('\n')||'なし'}\n\n新規作成（${added.length}件）：\n${added.join('\n')||'なし'}\n\n一覧以外のファイルは変更しません。`,buttons:["保存する","キャンセル"],defaultId:1,cancelId:1,noLink:true});
        return result.response===0;
      }});
  } catch (e) {
    const reasons={EACCES:"保存先への書き込み権限がありません。",EPERM:"ファイルが使用中、または操作する権限がありません。",ENOSPC:"保存先の空き容量が不足しています。",EEXIST:"保存先が別の処理で作成されました。再度保存してください。",ENAMETOOLONG:"保存先のパスが長すぎます。短い場所を選択してください。"};
    return {error:reasons[e.code]||e.message||"保存先の権限・空き容量を確認してください。"};
  }
});

handle("settings:path", () => settingsPath);

handle("settings:get", () => currentSettings);

handle("settings:save", (_e, newSettings) => {
  const next = { ...currentSettings, ...validateSettings(newSettings) };
  saveSettings(next);
  currentSettings = next;
  return currentSettings;
});

// --------------------------------------
// ログ書き込み
// --------------------------------------
handle("write-log", async (_event, message) => {
  message = text(message, 16384).replace(/[\r\n]/g, " ");
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const timestamp = jst
    .toISOString()
    .replace("T", " ")
    .replace("Z", " +09:00");

  const line = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFilePath, line, "utf8");
    return { ok: true };
  } catch (err) {
    console.error("failed to write log:", err);
    return { ok: false, error: String(err) };
  }
});

// --------------------------------------
// アプリ起動
// --------------------------------------
app.whenReady().then(() => {
  ensureLogFileExists();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

