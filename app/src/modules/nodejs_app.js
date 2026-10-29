// Node.js アプリ モジュール
// src/modules/nodejs_app.js

registerModule({
  id: "nodejs",
  label: "Node.js アプリ",
  description: "Node.js ベースのフロントエンド／バックエンド開発用コンテナを追加します。",
  iconPath: "src/modules/nodejs.png",
  category: "app",

  fields: [
    {
      name: "hostPort",
      label: "公開ポート（ホスト側）",
      type: "number",
      default: 3000,
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp",
      placeholder: "3000",
    },

    // === データ保存方式（アプリ領域）===
    {
      name: "dataStoreType",
      label: "アプリの配置方式（データ保存方式）",
      type: "select",
      default: "image",
      options: [
        { value: "image", label: "イメージ内に含める（標準・ソースを隠さない）" },
        { value: "bind", label: "開発用バインドマウント（ホストソース）" },
        { value: "named", label: "名前付きボリューム（旧構成との互換用）" },
      ],
    },
    {
      name: "dataStoreName",
      label: "ネームボリューム名",
      type: "text",
      default: "node-app",
      placeholder: "node-app",
      visibleWhen: { field: "dataStoreType", equals: "named" },
    },
    {
      name: "dataStorePath",
      label: "バインドマウント（ホストパス）",
      type: "text",
      default: "./nodejs",
      placeholder: "./nodejs",
      visibleWhen: { field: "dataStoreType", equals: "bind" },
      isDir: true,
      browseEnabledWhen: { field: "dataStoreType", equals: "bind" },
    },

    {
      name: "startCmd",
      label: "起動コマンド（sh -c で実行）",
      type: "text",
      default: "npm run dev",
      placeholder: "npm run dev",
    },
  ],

  buildCompose(config = {}, shared = {}) {
    const projectName = shared.projectName || "myapp";
    const svcName = `${projectName}-nodejs`;
    const hostPort = Number(config.hostPort) > 0 ? Number(config.hostPort) : 3000;

    const volumes = [];
    const namedVolumes = [];

    const storeType = String(config.dataStoreType || "image");
    const storeName = String(config.dataStoreName || "node-app").trim();
    const storePath = String(config.dataStorePath || "./nodejs").trim().replace(/\\/g, "/");

    if (storeType === "bind") {
      volumes.push(`${storePath}:/app`);
      // ホスト側のnode_modulesでLinux向けのビルド済み依存を隠さない。
      volumes.push("/app/node_modules");
    } else if (storeType === "named") {
      const key = (storeName || "node-app").replace(/[^\w.-]/g, "-");
      const volName = `${projectName}-${key}`;
      volumes.push(`${volName}:/app`);
      namedVolumes.push(volName);
    }

    return {
      services: [
        {
          name: svcName,
          image: "node:20-alpine",
          restart: "always",
          working_dir: "/app",
          ports: [`${hostPort}:3000`],
          volumes,
          // 明示的な旧/カスタムコマンドは変更せず、未指定時だけ新しい既定値を使う。
          command: ["sh", "-c", String(config.startCmd || "npm run dev")],
        },
      ],
      volumes: namedVolumes,
    };
  },

  buildDockerfile(config = {}) {
    // FROMと依存インストールは共通生成処理に集約する。
    if (!config.imageVersion) return "";
    return window.ProjectGeneration.dockerfile("nodejs", config, config.imageVersion, config.composerVersion);
  },
});
