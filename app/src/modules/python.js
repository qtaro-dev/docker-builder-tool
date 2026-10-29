// Python アプリ（Django / Flask）モジュール Ver2.1
// - フレームワーク種別を Django / Flask から選択（トグル）
// - docker-compose.yml 上でサービス名にフレームワーク名を含める
// - environment で FRAMEWORK=django/flask を付与
// - Dockerfile の先頭に Framework 情報コメントを出力

registerModule({
  id: "python-web",
  label: "Python アプリ（Django / Flask）",

  iconPath: "src/modules/python.png",
  category: "app",
  description:
    "Django または Flask フレームワークを使用した Python アプリケーションの開発環境を構築します。",

  fields: [
    // ▼フレームワーク種別（Django / Flask トグル用）
    {
      name: "framework",
      label: "フレームワーク種別",
      type: "hidden", // 画面には入力欄を出さず、トグルで値だけ変える
      default: "django",
      isFrameworkToggle: true, // renderer.js 側で Django/Flask トグルを出すフラグ
    },

    // ▼公開ポート（ホスト側）
    {
      name: "hostPort",
      label: "公開ポート（ホスト側）",
      type: "number",
      default: 8000,
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp", // TCP/UDP トグル用
      placeholder: "8000",
    },
{
  name: "dataStoreType",
  label: "データ保存方式",
  type: "select",
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
  default: "python-app",
  placeholder: "python-app",
  visibleWhen: { field: "dataStoreType", equals: "named" },
},
{
  name: "dataStorePath",
  label: "バインドマウント（ホストパス）",
  type: "text",
  default: "./app",
  placeholder: "./app",
  visibleWhen: { field: "dataStoreType", equals: "bind" },
  isDir: true,
  browseEnabledWhen: { field: "dataStoreType", equals: "bind" },
},

    // ▼起動コマンド
    {
      name: "startCommand",
      label: "起動コマンド",
      type: "text",
      default: "",
      placeholder: "未指定時は選択したDjango / Flaskの開発サーバーを起動",
    },
  ],

  /**
   * docker-compose.yml 用のサービス定義を生成
   */
  buildCompose(config, ctx) {
    const projectName = ctx.projectName || "myapp";

    // フレームワーク種別（django / flask）
    const fw = (config.framework || "django").toLowerCase() === "flask"
      ? "flask"
      : "django";

	    // 永続化（named/bind）
	    const storeType = String(config.dataStoreType || "named");
	    const storeName = String(config.dataStoreName || "").trim();
	    const storePath = String(config.dataStorePath || "./app").trim();

	    const volumes = [];
	    const namedVolumes = [];
	    if (storeType === "bind") {
	      volumes.push(`${storePath.replace(/\\/g, "/")}:/app`);
	    } else {
	      const key = (storeName || "python-app").replace(/[^\w.-]/g, "-");
	      const volName = `${projectName}-${key}`;
	      volumes.push(`${volName}:/app`);
	      namedVolumes.push(volName);
	    }

	    // サービス名：フレームワークが一目で分かるようにする
	const serviceName =
      fw === "django" ? `${projectName}-django` : `${projectName}-flask`;

    // 公開ポート（ホスト側）
    const hostPort =
      Number(config.hostPort) || (fw === "flask" ? 5000 : 8000);

    // コンテナ内部のポート
    const containerPort = fw === "flask" ? 5000 : 8000;

    // 起動コマンド（未指定ならフレームワークに応じたデフォルト）
    let command = (config.startCommand || "").trim();
    if (!command) {
      if (fw === "flask") {
        // Flask 開発サーバ
        command = `flask run --host=0.0.0.0 --port=${containerPort}`;
      } else {
        // Django 開発サーバ
        command = `python manage.py runserver 0.0.0.0:${containerPort}`;
      }
    }

    const service = {
      name: serviceName,
      image: "python:3.12-slim",
      restart: "always",
      working_dir: "/app",
      ports: [`${hostPort}:${containerPort}`],
      volumes,
      environment: {
        // コンテナ内からも参照できるようにフレームワーク種別を渡す
        FRAMEWORK: fw,
      },
      depends_on: [],
      command,
    };

	    return {
	      services: [service],
	      volumes: namedVolumes,
	    };
  },

  /**
   * Dockerfile（Web 用）を生成
   */
  buildDockerfile(config = {}) {
    // FROMと依存インストールは共通生成処理に集約する。
    if (!config.imageVersion) return "";
    return window.ProjectGeneration.dockerfile("python-web", config, config.imageVersion, config.composerVersion);
  },
});
