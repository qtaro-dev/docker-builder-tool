/* バージョン選択とサービス別の生成物を一緒に組み立て、FROM/buildの食い違いを防ぐ。 */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./image-versions") : root.ImageVersions);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProjectGeneration = api;
})(typeof window === "object" ? window : globalThis, function (versions) {
  "use strict";
  const buildModules = ["nodejs", "python-web", "laravel", "jenkins", "ollama"];
  const requirements = {
    nodejs: "利用者がpackage.json・対応するpackage-lock.json・ソースをnodejs/へ用意します。標準設定のnpm ciで両ファイルが一致すること、scripts.dev（またはカスタムコマンド）が存在することを確認してください。依存はビルド時にインストールし、既定の起動時はnpm run devのみ実行します。0.0.0.0:3000で待受する開発用アプリが必要です。本番用のビルド・起動は別途設計してください。非標準npm設定・プライベート依存のビルド用認証は自動生成しません。",
    "python-web": "requirements.txt（Django/Flaskと依存の固定版）・ソースをpython-web/へ配置。Djangoはmanage.py、FlaskはFLASK_APPまたはapp.pyが必要です。開発サーバーを0.0.0.0で起動します。",
    laravel: "Laravelソース（artisan/public/）・composer.json・composer.lock・.envをlaravel/へ配置。PHPとの対応、APP_KEY・DB接続・storage/bootstrap/cacheの権限を確認し、初回migrationは利用者が実施してください。PHP CLIの開発サーバー（HTTP 8000）を使用します。本番公開用ではありません。",
    jenkins: "Jenkins初期管理者・プラグインの設定が必要です。JDKの更新と各ジョブの互換性を確認してください。",
    ollama: "モデルの取得には別途ネットワーク・容量/RAMが必要です。GPU設定は自動生成しません。",
  };
  function nodeCommand(cfg) { return String(cfg.startCmd || "npm run dev"); }
  function nodeAdvice(cfg) {
    const mode = cfg.dataStoreType || "image";
    const notes = [mode === "named"
      ? "互換モード：名前付きボリュームが/app全体を覆います。既存ソース・依存が残るため、再ビルドしても更新されない場合があります。バックアップと内容を確認してください。自動削除は行いません。"
      : mode === "bind"
        ? "開発用：指定したホストソースを/appへマウントし、/app/node_modulesはイメージの依存で初期化する匿名ボリュームへ分離します。build contextは./nodejsです。同じpackage.json/lockとソースを両方に用意してください。依存変更後は再ビルドし、依存用匿名ボリュームの更新も確認してください。"
        : "標準：ソースと依存をイメージ内に含め、/appにはボリュームをマウントしません。ソース変更は再ビルドで反映します。実行時に生成したファイルの永続化は別途設計してください。"];
    if (/\bnpm\s+(?:install|i|ci)\b/.test(nodeCommand(cfg))) notes.push("カスタム起動コマンドに依存インストールが含まれています。指定は保持しましたが、ビルド時のnpm ciと二重実行になります。必要性と再現性を確認してください。");
    return notes;
  }
  function pythonCommand(cfg) {
    const fw = cfg.framework === "flask" ? "flask" : "django";
    return String(cfg.startCommand || "").trim() || (fw === "flask" ? "flask run --host=0.0.0.0 --port=5000" : "python manage.py runserver 0.0.0.0:8000");
  }
  function dockerfile(id, cfg, entry, composer) {
    const from = `FROM ${entry.image}`;
    if (id === "nodejs") return [from, "WORKDIR /app", "COPY package.json package-lock.json ./", "RUN npm ci", "COPY . .", "EXPOSE 3000", `CMD ${JSON.stringify(["sh", "-c", nodeCommand(cfg)])}`].join("\n");
    if (id === "python-web") return [`# Framework: ${cfg.framework === "flask" ? "Flask" : "Django"}`, from, "WORKDIR /app", "COPY requirements.txt ./", "RUN pip install --no-cache-dir -r requirements.txt", "COPY . .", `ENV FRAMEWORK=${cfg.framework === "flask" ? "flask" : "django"}`, `EXPOSE ${cfg.framework === "flask" ? 5000 : 8000}`, `CMD ${JSON.stringify(["sh", "-c", pythonCommand(cfg)])}`].join("\n");
    if (id === "laravel") return [from,
      "# Laravel開発用。composer.lockとPHP拡張の要件を確認してください。",
      "RUN apt-get update && apt-get install -y --no-install-recommends git unzip libicu-dev libonig-dev libzip-dev libpq-dev \\",
      "    && docker-php-ext-install pdo_mysql pdo_pgsql intl mbstring zip bcmath opcache \\",
      "    && rm -rf /var/lib/apt/lists/*",
      `COPY --from=${composer.image} /usr/bin/composer /usr/bin/composer`, "WORKDIR /app", "COPY . .",
      "RUN composer install --prefer-dist --no-interaction --no-progress", "EXPOSE 8000",
      'CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]'].join("\n");
    return `${from}\n# このサービス用の追加設定を記述できます。\n`;
  }
  function build({ modules, configs, catalog, verifiedEntries = catalog.entries, selections = new Map(), projectName, allowUnsafe = false, now = Date.now() }) {
    versions.validate(catalog, now);
    const errors = [], warnings = [], files = [], services = [], volumes = new Set(), notes = [];
    const selected = new Map();
    for (const mod of modules) {
      const entry = selections.has(mod.id) ? selections.get(mod.id) : versions.candidates(catalog, mod.id)[0];
      if (entry) {
        try {
          // 選択値も共通スキーマで確認。更新前に選んだdigestは自動変更しない。
          const verified = verifiedEntries.find(e => e.slotId === entry.slotId && e.tag === entry.tag && e.digest === entry.digest);
          if (!verified) throw new Error("Unverified tag");
          const raw = Object.fromEntries(["slotId", "tag", "digest", "platforms", "checkedAt", "scan"].map(k => [k, verified[k]]));
          versions.validate({ schemaVersion: 1, checkedAt: verified.checkedAt, entries: [raw] }, now);
          const slot = versions.slots.find(s => s.id === entry.slotId && s.moduleId === mod.id);
          if (!slot) throw new Error("Invalid selection");
          selected.set(mod.id, { ...slot, ...raw, image: `${slot.repository.replace(/^library\//, "")}:${raw.tag}@${raw.digest}` });
        } catch { errors.push(`${mod.label || mod.id}：存在を確認したタグだけを選択してください。`); continue; }
      }
      const status = versions.assess(selected.get(mod.id), now);
      warnings.push(...status.messages.map(m => `${mod.label || mod.id}：${m}`));
      if (status.blocked && !(allowUnsafe && status.exceptionAllowed)) errors.push(`${mod.label || mod.id}：${status.exceptionAllowed ? "EOL/既知の重大な脆弱性により通常生成を制限します。" : status.messages[0]}`);
    }
    if (errors.length) return { errors, warnings, files, services, volumes, notes };
    const dbs = modules.filter(m => ["mysql", "mariadb", "postgres"].includes(m.id));
    const cfgFor = id => configs.get(id) || {};
    const consumers = modules.filter(m => ["wordpress", "redmine", "phpmyadmin", "laravel"].includes(m.id));
    const connections = new Map();
    for (const mod of consumers) {
      const cfg = cfgFor(mod.id);
      const compatible = dbs.filter(m => mod.id === "laravel" || mod.id === "redmine" || m.id !== "postgres");
      let db;
      if (cfg.dbHost) db = compatible.find(m => `${projectName}-${m.id}` === String(cfg.dbHost).trim());
      else if (compatible.length === 1) db = compatible[0];
      if (!db) { errors.push(`${mod.label || mod.id}：対応DBを1種類選ぶか、DBホストに選択したサービス名を指定してください（WordPress/phpMyAdminはMySQL/MariaDB専用）。`); continue; }
      const dbCfg = cfgFor(db.id);
      const conn = { db, host: `${projectName}-${db.id}`, database: dbCfg.dbName || dbCfg.database || "appdb", user: dbCfg.dbUser || dbCfg.user || "appuser", password: dbCfg.dbPassword || dbCfg.password || "secret" };
      // 独自に入力した接続値を黙って上書きせず、DB側との不一致を知らせる。
      for (const [field, key] of [["dbName", "database"], ["dbUser", "user"], ["dbPassword", "password"]]) {
        const original = mod.fields?.find(f => f.name === field)?.default;
        if (cfg[field] && cfg[field] !== original && cfg[field] !== conn[key]) errors.push(`${mod.label || mod.id}：${field}を選択したDBの設定値と揃えてください。`);
      }
      connections.set(mod.id, conn);
    }
    if (errors.length) return { errors, warnings, files, services, volumes, notes };
    const composer = versions.candidates(catalog, "composer")[0];
    for (const mod of modules) {
      const cfg = { ...cfgFor(mod.id), projectName };
      if (mod.id === "python-web") cfg.startCommand = pythonCommand(cfg);
      const conn = connections.get(mod.id);
      if (conn) Object.assign(cfg, { dbHost: conn.host, dbName: conn.database, dbUser: conn.user, dbPassword: conn.password });
      const partial = mod.buildCompose(cfg, { projectName, config: cfg });
      const entry = selected.get(mod.id);
      for (const svc of partial.services) {
        svc.image = entry.image;
        if (mod.id === "nodejs") {
          svc.ports = [`${Number(cfg.hostPort) || 3000}:3000`];
          svc.command = ["sh", "-c", nodeCommand(cfg)];
          notes.push(...nodeAdvice(cfg));
          if (cfg.dataStoreType === "named" || /\bnpm\s+(?:install|i|ci)\b/.test(nodeCommand(cfg))) warnings.push(...nodeAdvice(cfg));
        }
        if (Array.isArray(svc.environment)) svc.environment = Object.fromEntries(svc.environment.map(pair => { const n = pair.indexOf("="); return [pair.slice(0, n), pair.slice(n + 1)]; }));
        if (mod.id === "python-web") svc.command = ["sh", "-c", pythonCommand(cfg)];
        if (mod.id === "ollama") {
          svc.entrypoint = [];
          if (!cfg.models?.trim()) svc.command = ["ollama", "serve"];
        }
        if (mod.id === "steamcmd") svc.entrypoint = [];
        if (conn) {
          svc.depends_on = [conn.host];
          if (mod.id === "laravel") {
            svc.working_dir = "/app";
            svc.env_file = ["./laravel/.env"];
            svc.environment = { ...svc.environment, APP_ENV: "local", APP_DEBUG: "true", DB_CONNECTION: conn.db.id === "postgres" ? "pgsql" : "mysql", DB_HOST: conn.host, DB_PORT: conn.db.id === "postgres" ? "5432" : "3306", DB_DATABASE: conn.database, DB_USERNAME: conn.user, DB_PASSWORD: conn.password };
            svc.command = ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"];
          } else if (mod.id === "redmine") {
            svc.environment = { [`REDMINE_DB_${conn.db.id === "postgres" ? "POSTGRES" : "MYSQL"}`]: conn.host, REDMINE_DB_DATABASE: conn.database, REDMINE_DB_USERNAME: conn.user, REDMINE_DB_PASSWORD: conn.password };
          }
          warnings.push(`${mod.label || mod.id}：depends_onはDBの準備完了を待ちません。アプリの再試行・初回migrationを確認してください。`);
        }
        if (buildModules.includes(mod.id)) {
          if (mod.id === "laravel" && !composer) { errors.push("Composerの確認済みイメージがありません。"); continue; }
          if (mod.id === "laravel") {
            const status = versions.assess(composer, now);
            warnings.push(...status.messages.map(m => `Composer：${m}`));
            if (status.blocked && !allowUnsafe) { errors.push("Composer：既知の重大な脆弱性により通常生成を制限します。"); continue; }
          }
          const filename = `Dockerfile.${mod.id}`;
          svc.build = { context: `./${mod.id}`, dockerfile: filename };
          // 自作ビルドに公式image名を併記しない。pull優先による取り違えを防ぐ。
          delete svc.image;
          const content = dockerfile(mod.id, cfg, entry, composer) + "\n";
          files.push({ moduleId: mod.id, filename, relativePath: `${mod.id}/${filename}`, content });
          const ignoreName = filename + ".dockerignore";
          files.push({ moduleId: mod.id, filename: ignoreName, relativePath: `${mod.id}/${ignoreName}`,
            content: ".git\n.env\n.env.*\n*.pem\n*.key\nnode_modules\nvendor\n__pycache__\n*.pyc\n*.log\n" + (mod.id === "nodejs" ? ".npmrc\n.npm\ncoverage\n" : "") });
          notes.push(`${mod.id}/${filename}：${requirements[mod.id]}`);
          notes.push(`${mod.id}/${ignoreName}も同じフォルダに保存してください。.env・秘密鍵・.git等をCOPY対象から除外します。.envは実行用に利用者が準備してください。`);
          if (["python-web", "laravel"].includes(mod.id)) notes.push(`${mod.id}：既存の/appボリュームは再ビルドしても古いコードを保持する場合があります。バックアップとコードの配置を確認してください。自動削除は行いません。`);
        }
        services.push(svc);
      }
      (partial.volumes || []).forEach(v => volumes.add(v));
    }
    if (allowUnsafe) warnings.unshift("検証目的の例外を使用しました。EOL/既知High・Criticalの構成を本番へ公開しないでください。");
    if (modules.some(m => ["nginx", "apache"].includes(m.id)) && modules.some(m => ["nodejs", "python-web", "laravel"].includes(m.id))) notes.push("Nginx/Apacheとのリバースプロキシ設定は自動生成しません。HTTP upstreamをサービス名と内部ポートに合わせて別途設定してください。PHP-FPMは使用していません。");
    if (modules.some(m => m.id === "certbot")) {
      if (!cfgFor("certbot").domains?.trim() && !cfgFor("certbot").domain?.trim()) errors.push("Certbot：証明書を取得するドメインを入力してください。");
      notes.push("Certbot：Webサーバとchallenge用webroot・証明書を共有し、ドメインと外部80番到達性、更新/reloadを設定してください。取得・更新は自動実行しません。");
    }
    notes.push("開発用の既定パスワードsecret、公開ポート、認証/アクセス制御を利用前に見直してください。コンテナの起動と脆弱性スキャンは未検証です。");
    return { errors, warnings, files, services, volumes, notes,
      images: [...selected.values(), ...(modules.some(m => m.id === "laravel") && composer ? [composer] : [])] };
  }
  return { build, dockerfile, buildModules, requirements, nodeCommand, nodeAdvice };
});
