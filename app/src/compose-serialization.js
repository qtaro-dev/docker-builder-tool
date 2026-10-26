// GUIとCIから同じComposeシリアライザーを使う。DOMやElectronには依存しない。
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.ComposeSerialization=api;
})(typeof window==='object'?window:globalThis,function(){
function renderComposeYaml(model) {
  // JSON strings/arrays are valid YAML flow values. Quoting prevents newlines,
  // comments and YAML metacharacters in user input from adding configuration.
  // Composeの環境変数補間も無効化し、入力の$をコンテナへそのまま渡す。
  const literal = value => String(value).replaceAll("$", () => "$$");
  const scalar = (value) => JSON.stringify(literal(value));
  const lines = [];
  lines.push('version: "3.9"');
  lines.push("services:");

  model.services.forEach((svc) => {
    lines.push(`  ${scalar(svc.name)}:`);
    if (svc.image) lines.push(`    image: ${scalar(svc.image)}`);
    if (svc.build) {
      lines.push("    build:");
      lines.push(`      context: ${scalar(svc.build.context)}`);
      lines.push(`      dockerfile: ${scalar(svc.build.dockerfile)}`);
    }
    if (svc.working_dir) lines.push(`    working_dir: ${scalar(svc.working_dir)}`);
    if (svc.env_file) lines.push(`    env_file: ${JSON.stringify(svc.env_file.map(literal))}`);
    if (svc.entrypoint) lines.push(`    entrypoint: ${JSON.stringify(svc.entrypoint.map(literal))}`);
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
    if (svc.command) lines.push(`    command: ${Array.isArray(svc.command) ? JSON.stringify(svc.command.map(literal)) : scalar(svc.command)}`);
  });

  if (model.volumes.size > 0) {
    lines.push("volumes:");
    Array.from(model.volumes).forEach((v) => lines.push(`  ${scalar(v)}:`));
  }

  return lines.join("\n");
}
  return {renderComposeYaml};
});
