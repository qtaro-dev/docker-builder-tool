// src/renderer/generate.js
// ------------------------------------------------------------
// 生成部：docker-compose.yml / Dockerfile 生成（ヘルパー＋本体）
// ------------------------------------------------------------

/* global window, document */

// ==============================
// [G01] docker-compose.yml 生成ヘルパー
// ==============================
function renderComposeYaml(model) {
  // JSON strings/arrays are valid YAML flow values. Quoting prevents newlines,
  // comments and YAML metacharacters in user input from adding configuration.
  const scalar = (value) => JSON.stringify(String(value));
  const lines = [];
  lines.push('version: "3.9"');
  lines.push("services:");

  model.services.forEach((svc) => {
    lines.push(`  ${scalar(svc.name)}:`);
    lines.push(`    image: ${scalar(svc.image)}`);
    if (svc.restart) lines.push(`    restart: ${scalar(svc.restart)}`);

    if (svc.ports && svc.ports.length > 0) {
      lines.push("    ports:");
      svc.ports.forEach((p) => lines.push(`      - ${scalar(p)}`));
    }
    if (svc.volumes && svc.volumes.length > 0) {
      lines.push("    volumes:");
      svc.volumes.forEach((v) => lines.push(`      - ${scalar(v)}`));
    }
    if (svc.environment && Object.keys(svc.environment).length > 0) {
      lines.push("    environment:");
      Object.entries(svc.environment).forEach(([k, v]) => {
        lines.push(`      - ${scalar(`${k}=${v}`)}`);
      });
    }
    if (svc.depends_on && svc.depends_on.length > 0) {
      lines.push("    depends_on:");
      svc.depends_on.forEach((d) => lines.push(`      - ${scalar(d)}`));
    }
    if (svc.command) lines.push(`    command: ${Array.isArray(svc.command) ? JSON.stringify(svc.command.map(String)) : scalar(svc.command)}`);
  });

  if (model.volumes.size > 0) {
    lines.push("volumes:");
    Array.from(model.volumes).forEach((v) => lines.push(`  ${scalar(v)}:`));
  }

  return lines.join("\n");
}
// [G01] END

// ==============================
// [G02] 構成生成メイン処理
// ==============================
async function generateConfigs() {
  // core.js で公開されているものを利用（互換で window 直参照も可）
  const appendLog = window.__rendererCore?.appendLog || window.appendLog;
  const getCurrentProjectName =
    window.__rendererCore?.getCurrentProjectName || window.getCurrentProjectName;

  const moduleRegistry =
    window.__rendererModulesUI?.moduleRegistry || window.moduleRegistry || [];
  const getSelectedModuleIds =
    window.__rendererModulesUI?.getSelectedModuleIds || window.getSelectedModuleIds;

  if (typeof appendLog === "function") {
    appendLog("=== 構成生成ボタン押下 ===");
  }

  // 既存ハイライト解除
  document
    .querySelectorAll("input.port-conflict")
    .forEach((el) => el.classList.remove("port-conflict"));

  const msg = document.getElementById("portMessage");
  if (msg) {
    msg.textContent = "";
    msg.className = "generate-message";
  }

  const separator = document.getElementById("generateSeparator");
  if (separator) separator.classList.add("active");

  const projectName = typeof getCurrentProjectName === "function" ? getCurrentProjectName() : "myapp";
  const selectedIds = typeof getSelectedModuleIds === "function" ? getSelectedModuleIds() : [];
  const activeModules = moduleRegistry.filter((m) => selectedIds.includes(m.id));

  const validationErrors = [];
  const warnings = [];
  const runtimeErrors = [];
  const portUsages = [];
  const dbRequiredBy = [];
  const moduleConfigs = new Map();

  // モジュール未選択時
  if (activeModules.length === 0) {
    if (msg) {
      msg.textContent = "モジュールが選択されていません。";
      msg.classList.add("port-message-error");
    }
    return;
  }

  // 入力値の収集 & バリデーション
  activeModules.forEach((mod) => {
    const section = document.querySelector(`section.card[data-module-id="${mod.id}"]`);
    if (!section) return;

    const cfg = {};

    (mod.fields || []).forEach((field) => {
      const input = section.querySelector(`input[data-field-name="${field.name}"], select[data-field-name="${field.name}"]`);
      if (!input) return;

      let value = input.value ?? "";

      // 数値フィールドのバリデーション＆デフォルト適用
      if (field.type === "number") {
        value = String(value).trim();
        if (value === "") {
          if (field.default !== undefined && field.default !== null && field.default !== "") {
            value = String(field.default);
            input.value = value;
          } else {
            validationErrors.push(
              `${mod.label || mod.name || mod.id} の「${field.label}」が未入力です。`
            );
            input.classList.add("port-conflict");
            return;
          }
        }
      }

      // デフォルト値適用
      const effective = value === "" && field.default !== undefined ? field.default : value;

      if (field.isPort && effective) {
        const portNum = Number(effective);
        if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
          validationErrors.push(
            `${mod.label || mod.name || mod.id} の「${field.label}」は 1〜65535 の整数で指定してください。（現在：${effective}）`
          );
          input.classList.add("port-conflict");
        } else {
          let protocolValue = "tcp";
          if (typeof field.protocol === "string") {
            const wrapper = input.closest(".field-input-wrapper");
            const checkbox = wrapper && wrapper.querySelector(".protocol-toggle-checkbox");
            if (checkbox) {
              protocolValue = checkbox.checked ? "udp" : "tcp";
            } else {
              protocolValue = String(field.protocol).toLowerCase() === "udp" ? "udp" : "tcp";
            }
          }

          portUsages.push({
            port: portNum,
            protocol: protocolValue,
            moduleId: mod.id,
            fieldLabel: field.label,
            moduleLabel: mod.label || mod.name || mod.id,
            inputElement: input,
          });

          cfg[`${field.name}Protocol`] = protocolValue;
        }
      }

      cfg[field.name] = effective;
    });

    // モジュール側で DB 必須指定がある場合のチェック
    const requiresDb =
      mod.needsDatabase === true ||
      (Array.isArray(mod.requires) && mod.requires.includes("db"));

    if (requiresDb) {
      dbRequiredBy.push(mod.label || mod.name || mod.id);
    }

    moduleConfigs.set(mod.id, cfg);
  });

  // ポート重複チェック
  const portMap = new Map();
  portUsages.forEach((u) => {
    const key = `${u.port}/${u.protocol || "tcp"}`;
    if (!portMap.has(key)) portMap.set(key, []);
    portMap.get(key).push(u);
  });

  Array.from(portMap.entries()).forEach(([key, usages]) => {
    if (usages.length > 1) {
      const [port, protocol] = key.split("/");
      const detail = usages.map((u) => `${u.moduleLabel}（${u.fieldLabel}）`).join(" / ");
      validationErrors.push(
        `ポート ${port}/${protocol.toUpperCase()} が複数のモジュールで重複しています：${detail}`
      );
      usages.forEach((u) => {
        if (u.inputElement) u.inputElement.classList.add("port-conflict");
      });
    }
  });

  // DB モジュールが選択されているか
  const hasDbModule = activeModules.some(
    (m) => m.category === "db" || ["mysql", "mariadb", "postgres"].includes(m.id)
  );

  // DB 必須モジュールがあるのに DB が選択されていなければエラー扱い
  if (!hasDbModule && dbRequiredBy.length > 0) {
    validationErrors.push(
      `アプリケーションモジュール（${dbRequiredBy.join(
        " / "
      )}）を利用するには、データベースモジュール（MySQL / MariaDB / PostgreSQL など）が必要です。`
    );
  }

  // 入力系のエラーがある場合はここで終了
  if (validationErrors.length > 0) {
    if (msg) {
      msg.textContent = validationErrors.concat(warnings).join("\n");
      msg.classList.add("port-message-error");
    }
    return;
  }

  // Compose モデル構築
  const model = {
    version: "3.9",
    services: [],
    volumes: new Set(),
  };

  activeModules.forEach((mod) => {
    const baseCfg = moduleConfigs.get(mod.id) || {};
    const cfg = { ...baseCfg, projectName };

    cfg.shared = cfg.shared || {};
    if (cfg.shared && typeof cfg.shared === "object") {
      cfg.shared.projectName = cfg.shared.projectName || projectName;
    }

    if (typeof mod.buildCompose === "function") {
      try {
        const shared = { projectName, config: cfg };
        const partial = mod.buildCompose(cfg, shared);

        if (partial && partial.services) model.services.push(...partial.services);
        if (partial && partial.volumes) partial.volumes.forEach((v) => model.volumes.add(v));
      } catch (e) {
        runtimeErrors.push(
          `${mod.label || mod.name || mod.id} の docker-compose.yml 生成中にエラーが発生しました。`
        );
        console.error(e);
      }
    }
  });

  // Dockerfile 断片
  const dockerfileSnippets = [];
  activeModules.forEach((mod) => {
    if (typeof mod.buildDockerfile === "function") {
      const baseCfg = moduleConfigs.get(mod.id) || {};
      const cfg = { ...baseCfg, projectName };

      cfg.shared = cfg.shared || {};
      if (cfg.shared && typeof cfg.shared === "object") {
        cfg.shared.projectName = cfg.shared.projectName || projectName;
      }

      try {
        const shared = { projectName, config: cfg };
        const snippet = mod.buildDockerfile(cfg, shared);
        if (snippet && snippet.trim()) dockerfileSnippets.push(snippet.trimEnd());
      } catch (e) {
        runtimeErrors.push(
          `${mod.label || mod.name || mod.id} の Dockerfile 生成中にエラーが発生しました。`
        );
        console.error(e);
      }
    }
  });

  const composeYaml = renderComposeYaml(model);
  const dockerfileText = dockerfileSnippets.join("\n\n");

  const composeOutput = document.getElementById("composeOutput");
  if (composeOutput) composeOutput.value = composeYaml;

  const dockerfileOutput = document.getElementById("dockerfileOutput");
  if (dockerfileOutput) dockerfileOutput.value = dockerfileText;

  // メッセージ表示
  if (msg) {
    const messages = [];
    messages.push("構成を生成しました。生成結果タブで内容を確認できます。");

    if (warnings.length > 0) warnings.forEach((w) => messages.push(w));

    if (runtimeErrors.length > 0) {
      runtimeErrors.forEach((e) => messages.push(e));
      msg.classList.add("port-message-error");
    } else if (warnings.length > 0) {
      msg.classList.add("port-message-warning");
    } else {
      messages.push("ポートの重複はありません。");
      msg.classList.add("port-message-ok");
    }

    msg.textContent = messages.join("\n");
  }

  // ---- ログ出力（最後にサマリーを書き出し）----
  const status = runtimeErrors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARN" : "OK";

  const summary =
    `result=${status} ` +
    `project=${projectName} ` +
    `modules=[${activeModules.map((m) => m.id).join(",")}] ` +
    `errors=${runtimeErrors.length} warnings=${warnings.length}`;

  if (typeof appendLog === "function") {
    appendLog(summary);
  }
}

async function handleGenerateClick() {
  const appendLog = window.__rendererCore?.appendLog || window.appendLog;

  try {
    await generateConfigs();
  } catch (err) {
    console.error("構成生成中にエラー:", err);

    if (typeof appendLog === "function") {
      appendLog("構成生成中にエラー: " + (err && err.stack ? err.stack : String(err)));
    }

    const msg = document.getElementById("portMessage");
    if (msg) {
      msg.textContent =
        "構成生成中に予期しないエラーが発生しました。docker-builder.log を確認してください。";
      msg.className = "generate-message port-message-error";
    }
  }
}
// [G02] END

// ==============================
// [G99] グローバル公開（他モジュールから参照）
// ==============================
window.__rendererGenerate = {
  renderComposeYaml,
  generateConfigs,
  handleGenerateClick,
};

// 互換：既存コードが直接参照していた場合に備えて公開
window.renderComposeYaml = renderComposeYaml;
window.generateConfigs = generateConfigs;
window.handleGenerateClick = handleGenerateClick;
// [G99] END
