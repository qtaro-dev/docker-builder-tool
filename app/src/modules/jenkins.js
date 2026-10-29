// Jenkins（CI サーバ）モジュール Ver2.0
// src/modules/jenkins.js

registerModule({
  id: "jenkins",
  label: "Jenkins（CI サーバ）",
  description:
    "Jenkins CI サーバを追加します。Web UI とエージェント接続用ポートを指定できます。",

  iconPath: "src/modules/jenkins.png",
  category: "ci",

  fields: [
    {
      name: "httpPort",
      label: "HTTP ポート（Jenkins UI・ホスト側）",
      type: "number",
      default: 8080,
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp",
      placeholder: "8080",
    },
    {
      name: "agentPort",
      label: "エージェント接続ポート（ホスト側）",
      type: "number",
      default: 50000,
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp",
      placeholder: "50000",
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
      default: "jenkins-home",
      placeholder: "jenkins-home",
      visibleWhen: { field: "dataStoreType", equals: "named" },
    },
    {
      name: "dataStorePath",
      label: "バインドマウント（ホストパス）",
      type: "text",
      default: "./jenkins-home",
      placeholder: "./jenkins-home",
      visibleWhen: { field: "dataStoreType", equals: "bind" },
      isDir: true,
      browseEnabledWhen: { field: "dataStoreType", equals: "bind" },
    },
  ],


  buildCompose(config = {}, shared = {}) {
    const projectName =
      shared.projectName || config.projectName || "myapp";

    const httpPort =
      Number(config.httpPort) > 0 ? Number(config.httpPort) : 8080;
    const agentPort =
      Number(config.agentPort) > 0 ? Number(config.agentPort) : 50000;

    const httpProto =
      (config.httpPortProtocol || "tcp").toLowerCase() === "udp"
        ? "udp"
        : "tcp";
    const agentProto =
      (config.agentPortProtocol || "tcp").toLowerCase() === "udp"
        ? "udp"
        : "tcp";

    const dataPathRaw =
      (config.dataPath || "./jenkins-data").toString();
    const dataPath = dataPathRaw.replace(/\\/g, "/");

    const svcName = `${projectName}-jenkins`;

    const ports = [];
    ports.push(
      httpProto === "udp"
        ? `${httpPort}:8080/udp`
        : `${httpPort}:8080`
    );
    ports.push(
      agentProto === "udp"
        ? `${agentPort}:50000/udp`
        : `${agentPort}:50000`
    );

    const volumes = [];
const namedVolumes = [];

// データ保存方式（named / bind）
const storeType = String(config.dataStoreType || "named");
const storeName = String(config.dataStoreName || "").trim();
const storePath = String(config.dataStorePath || "./jenkins-home").trim();

if (storeType === "bind") {
  const spec = storePath || "./jenkins-home";
  volumes.push(`${spec}:/var/jenkins_home`);
} else {
  const key = (storeName || "jenkins-home").replace(/[^\w.-]/g, "-");
  const volName = `${projectName}-${key}`;
  volumes.push(`${volName}:/var/jenkins_home`);
  namedVolumes.push(volName);
}

const service = {
      name: svcName,
      image: "jenkins/jenkins:lts-jdk17",
      restart: "always",
      ports,
      volumes,
      // 必要なら Docker ソケットもマウント可能：
      // volumes: [...volumes, "/var/run/docker.sock:/var/run/docker.sock"],
    };

    return {
      services: [service],
      volumes: namedVolumes,
    };
  },

  buildDockerfile(config = {}) {
    // FROMと依存インストールは共通生成処理に集約する。
    if (!config.imageVersion) return "";
    return window.ProjectGeneration.dockerfile("jenkins", config, config.imageVersion, config.composerVersion);
  },
});
