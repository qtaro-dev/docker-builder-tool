/* 生成時点のモデルから説明を作る。入力カードの後の変更でガイドをすり替えない。 */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./image-versions") : root.ImageVersions,
    typeof module === "object" && module.exports ? require("./project-generation") : root.ProjectGeneration);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GenerationGuideModel = api;
})(typeof window === "object" ? window : globalThis, function (versions, generation) {
  const sources = {
    nodejs: ["package.json（利用者が準備・scripts.dev等）", "package-lock.json（利用者が準備）", "アプリソース（利用者が準備）"],
    "python-web": ["requirements.txt（利用者が準備）", "Django / Flaskソース（利用者が準備）"],
    laravel: ["composer.json / composer.lock（利用者が準備）", "artisan / public/ 等のソース（利用者が準備）", ".env（実行用・利用者が準備）"],
  };
  function build(output, projectName) {
    const directories = [...new Set(output.files.map(f => f.moduleId))];
    const tree = [`${projectName}/`, "├─ docker-compose.yml"];
    directories.forEach((id, index) => {
      const last = index === directories.length - 1;
      const prefix = last ? "   " : "│  ";
      tree.push(`${last ? "└" : "├"}─ ${id}/`);
      const children = [...output.files.filter(f => f.moduleId === id).map(f => f.relativePath.startsWith(id+'/') ? f.relativePath.slice(id.length+1) : '../'+f.relativePath), ...(sources[id] || [])];
      children.forEach((child, n) => tree.push(`${prefix}${n === children.length - 1 ? "└" : "├"}─ ${child}`));
    });
    const placement = [
      "「生成ファイル一式を保存」で新規サブフォルダへ相対パスを維持して保存できます。個別保存する場合は、各ファイルに表示された相対パスどおりに配置してください。利用者が準備するアプリ・依存ファイルは別途必要です。",
      ...output.services.filter(s => s.build).map(s => `${s.name}：build.context = ${s.build.context}（Composeからの相対パス）、build.dockerfile = ${s.build.dockerfile}（context内のファイル名）。専用dockerignoreも同じcontext内の ${s.build.dockerfile}.dockerignore に保存します。`),
      ...directories.filter(id => sources[id]).map(id => generation.requirements[id]),
    ];
    if (!directories.length) placement.push("この構成にはbuild/Dockerfileはありません。各imageを利用します。マウントするコンテンツ・設定は別途用意してください。");
    if (output.services.some(s => s.volumes?.some(v => v.endsWith(":/app") && !output.volumes.has(v.slice(0, -5))))) placement.push("バインドマウントを使うサービスは、入力したホストのマウント元にも同じアプリソース・依存ファイルを用意してください。build.contextとは別のパスを指定すると、ビルド時と実行時の内容が異なる場合があります。");
    const startup = [
      { text: "Docker環境を準備：Docker EngineまたはDocker Desktop（Linuxコンテナ）とCompose v2を用意し、Dockerが起動していることを確認します。", command: "docker info\ndocker compose version" },
      { text: "上記の必要ファイルを配置し、docker-compose.ymlのあるフォルダで以降のコマンドを実行します。ソースコードや依存ファイルはこのアプリでは生成しません。" },
      { text: "環境変数・認証情報・公開ポート・マウント先を確認します。既存データのあるDBは互換性とバックアップを確認してください。" },
      { text: "Compose構文と参照を検証します。エラーがあれば起動前に修正してください。", command: "docker compose config -q" },
    ];
    const certbotOnly = output.services.length === 1 && output.images?.some(e => e.moduleId === "certbot");
    startup.push(certbotOnly
      ? { text: "ドメイン・challenge配信・外部到達性を準備後に実行します。この操作はACMEへ接続します。", command: `docker compose run --rm ${output.services[0].name}` }
      : { text: output.services.some(s => s.build) ? "必要なアプリのイメージをビルドして起動します。" : "選択したイメージでサービスを起動します。", command: output.services.some(s => s.build) ? "docker compose up --build -d" : "docker compose up -d" });
    startup.push({ text: "起動状態とログを確認します。", command: "docker compose ps\ndocker compose logs --tail=100" },
      { text: "利用を終えたら、この構成のサービスを停止します。ボリュームやデータは削除しません。", command: "docker compose stop" });
    const bindNode = output.services.find(s => s.build?.context === "./nodejs" && s.volumes?.includes("/app/node_modules"));
    if (bindNode) startup.splice(startup.length - 1, 0, {
      text: "開発用バインドマウントでpackage.json/lockを変更した場合だけ：再ビルド後にNode.jsの匿名依存ボリュームも更新します。このNode.jsサービスの匿名ボリュームを作り直すため、そこに利用者のデータを保存しないでください。",
      command: `docker compose up --build -d --renew-anon-volumes ${bindNode.name}`,
    });
    const security = [...output.notes, ...output.warnings];
    for (const svc of output.services) {
      if (svc.ports?.length) security.push(`${svc.name}の公開ポート（ホスト:コンテナ）：${svc.ports.join(" / ")}。アクセス範囲・認証を確認してください。`);
      if (svc.command) security.push(`${svc.name}の起動コマンド：${JSON.stringify(svc.command)}`);
      if (svc.volumes?.length) security.push(`${svc.name}のマウント：${svc.volumes.join(" / ")}`);
    }
    for (const entry of output.images || []) security.push(
      `${entry.moduleId}：${entry.image}\n${versions.assess(entry).messages.join("\n")}\n保守情報源：${entry.source}\n対応Linuxアーキテクチャ：${entry.platforms.map(p => p.architecture).join(" / ")}`);
    security.push("この画面は手順の説明です。コマンドをアプリから実行しません。Docker実動作・ビルド・接続とイメージの脆弱性スキャンは未検証です。");
    return { tree: tree.join("\n"), placement, startup, security: [...new Set(security)] };
  }
  return { build };
});
