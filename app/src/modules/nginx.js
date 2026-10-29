// Nginx（Web サーバ）モジュール

registerModule({
  id: "nginx",
  label: "Nginx（Web サーバ）",
  description:
    "静的サイトやシンプルな Web アプリを提供するための Nginx コンテナを追加します。",
  // 要望どおりアイコンパスは iconPath で持つ
  iconPath: "src/modules/nginx.png",
  category: "web",
  // Nginx 自体は DB 必須ではないので requires は空配列
  requires: [],

  // 構成入力フィールド
  fields: [
    ...window.ProjectGeneration.webFields(),
    {
      name: "hostPort",
      label: "公開ポート（ホスト側）",
      type: "number",
      default: 8080,
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp", // TCP を規定値
      placeholder: "8080",
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
      default: "nginx-html",
      placeholder: "nginx-html",
      visibleWhen: { field: "dataStoreType", equals: "named" },
    },
    {
      name: "dataStorePath",
      label: "バインドマウント（ホストパス）",
      type: "text",
      default: "./src",
      placeholder: "./src",
      visibleWhen: { field: "dataStoreType", equals: "bind" },
      isDir: true,
      browseEnabledWhen: { field: "dataStoreType", equals: "bind" },
    },
  ],

  /**
   * docker-compose.yml 用の定義を返す
   * @param {object} config  - renderer 側で組んだ設定値
   * @param {object} shared  - { projectName, config } など
   */
  buildCompose(config = {}, shared = {}) {
    const projectName =
      shared.projectName || config.projectName || "myapp";

    const hostPort =
      Number(config.hostPort) > 0 ? Number(config.hostPort) : 8080;

    const protocol = (config.hostPortProtocol || "tcp").toLowerCase();
    const storeType = String(config.dataStoreType || "named");
    const storeName = String(config.dataStoreName || "").trim();
    const storePath = String(config.dataStorePath || "./src").trim();

    const serviceName = `${projectName}-nginx`;

    // ボリューム（named/bind）
    const volumes = [];
    const namedVolumes = [];
    if (storeType === "bind") {
      volumes.push(`${storePath.replace(/\\/g, "/")}:/usr/share/nginx/html:ro`);
    } else {
      const key = (storeName || "nginx-html").replace(/[^\w.-]/g, "-");
      const volName = `${projectName}-${key}`;
      volumes.push(`${volName}:/usr/share/nginx/html:ro`);
      namedVolumes.push(volName);
    }

    // ポートマッピング文字列（udp 選択時だけ /udp を付ける）
    const portMapping =
      protocol === "udp"
        ? `${hostPort}:80/udp`
        : `${hostPort}:80`;

    const service = {
      name: serviceName,
      image: "nginx:latest",
      restart: "always",
      ports: [portMapping],
      volumes,
      environment: {},
    };

    return {
      services: [service],
      volumes: namedVolumes,
    };
  },

  /**
   * Nginx 単体の場合は Dockerfile を特に生成しないので空文字を返す
   * （アプリ系モジュール側で Dockerfile を組み立てる想定）
   */
  buildDockerfile(config = {}, shared = {}) {
    return "";
  },
});
