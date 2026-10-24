// Ollama（ローカル LLM）モジュール Ver2.0
// src/modules/ollama.js

registerModule({
  id: "ollama",
  label: "Ollama（ローカル LLM）",
  description:
    "Ollama サーバを追加します。ポート・保存先・初回に pull するモデルを指定できます。",

  iconPath: "src/modules/ollama.png",
  category: "ai",

  fields: [
    {
      name: "port",
      label: "HTTP ポート（ホスト側）",
      type: "number",
      default: 11434,
      min: 1,
      max: 65535,
      isPort: true,
      protocol: "tcp",
      placeholder: "11434",
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
  default: "ollama-data",
  placeholder: "ollama-data",
  visibleWhen: { field: "dataStoreType", equals: "named" },
},
{
      name: "dataStorePath",
      label: "モデル保存先（ホスト側）",
      type: "text",
      default: "./ollama-data",
      placeholder: "./ollama-data",
      visibleWhen: { field: "dataStoreType", equals: "bind" },
      isDir: true,
      browseEnabledWhen: { field: "dataStoreType", equals: "bind" },
    },
    {
      name: "models",
      label: "初回に pull するモデル（カンマ区切り）",
      type: "text",
      default: "",
      placeholder: "llama3.1, qwen2.5 など",
    },
  ],

  buildCompose(config = {}, shared = {}) {
    const projectName =
      shared.projectName || config.projectName || "myapp";

    const port =
      Number(config.port) > 0 ? Number(config.port) : 11434;
    const protocol =
      (config.portProtocol || "tcp").toLowerCase() === "udp"
        ? "udp"
        : "tcp";

    const svcName = `${projectName}-ollama`;

    const portMapping =
      protocol === "udp"
        ? `${port}:11434/udp`
        : `${port}:11434`;

    const models = (config.models || "")
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    let command;

    if (models.length > 0) {
      const scriptLines = [
        "ollama serve & sleep 5",
        ...models.map((m) => {
          if (m.startsWith("-")) throw new Error("モデル名をオプションとして指定することはできません。");
          // Model names are data, never shell syntax inside the generated script.
          return `ollama pull '${m.replace(/'/g, "'\\''")}'`;
        }),
        "tail -f /dev/null",
      ];
      command = ["sh", "-c", scriptLines.join(" && ")];
    } else {
      command = ["ollama", "serve"];
    }

    const storeType = String(config.dataStoreType || "named");
    const storeName = String(config.dataStoreName || "").trim();
    const storePath = String(config.dataStorePath || "./ollama-data").trim().replace(/\\/g, "/");
    const volumes = [];
    const namedVolumes = [];
    if (storeType === "bind") {
      volumes.push(`${storePath}:/root/.ollama`);
    } else {
      const key = (storeName || "ollama-data").replace(/[^\w.-]/g, "-");
      const volName = `${projectName}-${key}`;
      volumes.push(`${volName}:/root/.ollama`);
      namedVolumes.push(volName);
    }

const service = {
      name: svcName,
      image: "ollama/ollama",
      restart: "always",
      ports: [portMapping],
      volumes,
      command,
    };

    return {
      services: [service],
      volumes: namedVolumes,
    };
  },

  buildDockerfile(config = {}, shared = {}) {
    return `
FROM ollama/ollama

# ここに追加の設定（プリセットモデル・設定ファイルなど）を追記できます。
    `.trim();
  },
});
