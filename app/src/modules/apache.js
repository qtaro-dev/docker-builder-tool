// Apache（Web サーバ）モジュール  Ver2.0
// src/modules/apache.js

registerModule({
  id: "apache",
  label: "Apache（Web サーバ）",
  description:
    "静的サイトや PHP と組み合わせて利用される Apache HTTP Server を追加します。",

  iconPath: "src/modules/apache.png",
  category: "web",

  fields: [
    ...window.ProjectGeneration.webFields(),
    {
      name: "port",
      label: "公開ポート（ホスト側）",
      type: "number",
      default: 8082,            // 旧モジュールの規定値を継承
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp",          // 規定値 TCP（トグル表示用）
      placeholder: "8082",
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
  default: "apache-docroot",
  placeholder: "apache-docroot",
  visibleWhen: { field: "dataStoreType", equals: "named" },
},
{
      name: "dataStorePath",
      label: "バインドマウント（ホストパス）",
      type: "text",
      default: "./src",
      visibleWhen: { field: "dataStoreType", equals: "bind" },
      isDir: true,
      browseEnabledWhen: { field: "dataStoreType", equals: "bind" },
      placeholder: "./src",
    },
  ],

  /**
   * docker-compose.yml 用定義
   */
  buildCompose(config = {}, shared = {}) {
    const projectName =
      shared.projectName || config.projectName || "myapp";

    const hostPort =
      Number(config.port) > 0 ? Number(config.port) : 8082;
    const protocol =
      (config.portProtocol || "tcp").toString().toLowerCase() === "udp"
        ? "udp"
        : "tcp";

    const storeType = String(config.dataStoreType || "named");
    const storeName = String(config.dataStoreName || "").trim();
    const storePath = String(config.dataStorePath || "./src").trim();

    const serviceName = `${projectName}-apache`;

    const portMapping =
      protocol === "udp"
        ? `${hostPort}:80/udp`
        : `${hostPort}:80`;

	    // ボリューム（named/bind）
	    const volumes = [];
	    const namedVolumes = [];
	    if (storeType === "bind") {
	      volumes.push(`${storePath.replace(/\\/g, "/")}:/usr/local/apache2/htdocs/`);
	    } else {
	      const key = (storeName || "apache-docroot").replace(/[^\w.-]/g, "-");
	      const volName = `${projectName}-${key}`;
	      volumes.push(`${volName}:/usr/local/apache2/htdocs/`);
	      namedVolumes.push(volName);
	    }

	    const service = {
      name: serviceName,
      image: "httpd:alpine",
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
   * Apache 用の Dockerfile は通常不要なので空文字を返す
   */
  buildDockerfile(config = {}, shared = {}) {
    return "";
  },
});
