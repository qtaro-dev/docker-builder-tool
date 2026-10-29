// Laravel アプリ モジュール  Ver2.0
// src/modules/laravel_app.js

registerModule({
  id: "laravel",
  label: "Laravel アプリ",
  description:
    "PHP公式CLIイメージとLaravel開発サーバー（HTTP 8000）を利用します。Laravelソース、Composer lock、APP_KEYの設定とDBモジュールが必要です。本番公開用ではありません。",

  iconPath: "src/modules/laravel_app.png",
  category: "app",

  // DB カテゴリのモジュールが必須
  requires: ["db"],

  fields: [
    {
      name: "port",
      label: "公開ポート（ホスト側）",
      type: "number",
      default: 8000,
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp",
      placeholder: "8000",
    },
    {
      name: "dataStoreType",
      label: "データ保存方式",
      type: "select",
      // 仕様：デフォルトは名前付きボリューム
      default: "named",
      options: [
        { value: "named", label: "名前付きボリューム（推奨）" },
        { value: "bind", label: "バインドマウント（ホストパス）" },
      ],
    },
    {
      name: "dataStoreName",
      label: "ネームボリューム名",
      type: "text",
      default: "laravel-app",
      placeholder: "laravel-app",
      visibleWhen: { field: "dataStoreType", equals: "named" },
    },
    {
      name: "dataStorePath",
      label: "アプリコード（ホスト側パス）",
      type: "text",
      default: "./laravel-app",
      placeholder: "./laravel-app",
      visibleWhen: { field: "dataStoreType", equals: "bind" },
      isDir: true,
      browseEnabledWhen: { field: "dataStoreType", equals: "bind" },
    },
    {
      name: "dbHost",
      label: "DB ホスト名 / サービス名",
      type: "text",
      default: "",
      placeholder: '未指定時は "<プロジェクト名>-mysql" を自動使用',
    },
    {
      name: "dbName",
      label: "DB 名",
      type: "text",
      default: "appdb",
      placeholder: "appdb",
    },
    {
      name: "dbUser",
      label: "DB ユーザー名",
      type: "text",
      default: "appuser",
      placeholder: "appuser",
    },
    {
      name: "dbPassword",
      label: "DB パスワード",
      type: "text",
      default: "secret",
      placeholder: "secret",
    },
  ],

  buildCompose(config = {}, shared = {}) {
    const projectName =
      shared.projectName || config.projectName || "myapp";

    const hostPort =
      Number(config.port) > 0 ? Number(config.port) : 8000;
    const protocol =
      (config.portProtocol || "tcp").toString().toLowerCase() === "udp"
        ? "udp"
        : "tcp";


	  // 永続化（named/bind）
	  const storeType = String(config.dataStoreType || "named");
	  const storeName = String(config.dataStoreName || "").trim();
	  const storePath = String(config.dataStorePath || "./laravel-app").trim();

	  const appMounts = [];
	  const namedVolumes = [];
	  if (storeType === "bind") {
	    appMounts.push(`${storePath.replace(/\\/g, "/")}:/app`);
	  } else {
	    const key = (storeName || "laravel-app").replace(/[^\w.-]/g, "-");
	    const volName = `${projectName}-${key}`;
	    appMounts.push(`${volName}:/app`);
	    namedVolumes.push(volName);
	  }

    const dbHost =
      config.dbHost && String(config.dbHost).trim() !== ""
        ? String(config.dbHost).trim()
        : `${projectName}-mysql`;

    const dbName = config.dbName || "appdb";
    const dbUser = config.dbUser || "appuser";
    const dbPassword = config.dbPassword || "secret";

    const serviceName = `${projectName}-laravel`;

    const portMapping =
      protocol === "udp"
        ? `${hostPort}:8000/udp`
        : `${hostPort}:8000`;

	  const service = {
      name: serviceName,
      image: "php:8.4-cli-bookworm",
      working_dir: "/app",
      command: ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"],
      restart: "always",
      ports: [portMapping],
	    volumes: appMounts,
      environment: {
        APP_ENV: "local",
        APP_DEBUG: "true",
        DB_CONNECTION: "mysql",
        DB_HOST: dbHost,
        DB_PORT: "3306",
        DB_DATABASE: dbName,
        DB_USERNAME: dbUser,
        DB_PASSWORD: dbPassword,
      },
      depends_on: [dbHost],
    };

	  return {
	    services: [service],
	    volumes: namedVolumes,
	  };
  },

  buildDockerfile(config = {}) {
    // FROMと依存インストールは共通生成処理に集約する。
    if (!config.imageVersion) return "";
    return window.ProjectGeneration.dockerfile("laravel", config, config.imageVersion, config.composerVersion);
  },
});
