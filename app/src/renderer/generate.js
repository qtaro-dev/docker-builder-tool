// src/renderer/generate.js
// ------------------------------------------------------------
// 生成部：docker-compose.yml / Dockerfile 生成（ヘルパー＋本体）
// ------------------------------------------------------------

/* global window, document */

// ==============================
// [G01] docker-compose.yml 生成ヘルパー
// ==============================
const renderComposeYaml = window.ComposeSerialization.renderComposeYaml;
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

  // ボタンを経由しないメニュー/直接呼出しでも、未確認・変更済みの設定は生成しない。
  if (!window.__rendererModulesUI?.areAllSettingsConfirmed()) {
    window.__rendererUI.clearResultsOnly();
    if (msg) { msg.textContent = "選択中の全モジュールの設定を確認し、「設定確認」にチェックしてください。"; msg.classList.add("port-message-error"); }
    return;
  }

  const validationErrors = [];
  const warnings = [];
  const runtimeErrors = [];
  const portUsages = [];
  const dbRequiredBy = [];
  const moduleConfigs = new Map();

  // モジュール未選択時
  if (activeModules.length === 0) {
    window.__rendererUI.clearResultsOnly();
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
    window.__rendererUI.clearResultsOnly();
    if (msg) {
      msg.textContent = validationErrors.concat(warnings).join("\n");
      msg.classList.add("port-message-error");
    }
    return;
  }

  // 確認済みカタログと共通モデルを使い、各サービスのbuildとFROMを揃える。
  const model = window.ProjectGeneration.build({
    modules: activeModules, configs: moduleConfigs, projectName,
    catalog: window.ImageUI.getCatalog(), selections: window.ImageUI.selections,
    verifiedEntries: window.ImageUI.getVerifiedEntries(),
  });
  const restricted = model.errors.length && model.errors.every(error => error.includes("通常生成を制限"));
  let output = model;
  if (restricted && confirm(model.errors.concat(model.warnings).join("\n") + "\n\n検証目的で今回だけ制限を解除しますか？ 本番公開には使用しないでください。")) {
    output = window.ProjectGeneration.build({ modules: activeModules, configs: moduleConfigs, projectName,
      catalog: window.ImageUI.getCatalog(), verifiedEntries: window.ImageUI.getVerifiedEntries(), selections: window.ImageUI.selections, allowUnsafe: true });
  }
  if (output.errors.length) {
    window.__rendererUI.clearResultsOnly();
    if (msg) { msg.textContent = output.errors.join("\n"); msg.classList.add("port-message-error"); }
    return;
  }
  warnings.push(...output.warnings);
  const composeOutput = document.getElementById("composeOutput");
  if (composeOutput) composeOutput.value = renderComposeYaml(output);
  window.GeneratedFiles.set(output.files);
  window.GenerationGuideUI.set(output, projectName);

  // メッセージ表示
  if (msg) {
    const messages = [];
    messages.push("構成を生成しました。生成結果タブで内容を確認できます。");

    if (warnings.length > 0) messages.push(`警告・確認事項 ${warnings.length}件。各カードと「構成ファイルの配置・起動ガイド」を確認してください。`);

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
