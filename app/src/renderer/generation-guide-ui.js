/* native dialogのモーダル性・Escape・フォーカス復帰を使い、背面の誤操作を防ぐ。 */
let snapshot = null;
function clear() {
  snapshot = null;
  const dialog = document.getElementById("generationGuideDialog");
  if (dialog.open) dialog.close();
  document.getElementById("generationGuideButton").disabled = true;
  for (const id of ["generatedPlacementGuide", "guidePlacementNotes", "guideStartup", "guideSecurity"]) document.getElementById(id).replaceChildren();
}
function set(output, projectName) {
  clear();
  snapshot = window.GenerationGuideModel.build(output, projectName);
  document.getElementById("generationGuideButton").disabled = false;
  render();
}
function paragraphs(target, values, highlight = false) {
  target.replaceChildren();
  for (const value of values) {
    const p = document.createElement("p"); p.textContent = value;
    if (highlight && /通常生成を制限|HIGH|CRITICAL|タグ存在未確認|未検証|検証目的の例外|互換モード|二重実行/.test(value)) p.className = "guide-warning";
    target.appendChild(p);
  }
}
function render() {
  document.getElementById("generatedPlacementGuide").textContent = snapshot.tree;
  paragraphs(document.getElementById("guidePlacementNotes"), snapshot.placement);
  const steps = document.getElementById("guideStartup"); steps.replaceChildren();
  for (const step of snapshot.startup) {
    const li = document.createElement("li"); const text = document.createElement("p"); text.textContent = step.text; li.appendChild(text);
    if (step.command) { const pre = document.createElement("pre"); pre.textContent = step.command; li.appendChild(pre); }
    steps.appendChild(li);
  }
  paragraphs(document.getElementById("guideSecurity"), snapshot.security, true);
  // 手編集した内容の構文解析や実在確認は行っていないため、基準を明示する。
  document.getElementById("guideEditNotice").hidden = !window.GeneratedFiles.isEdited();
}
function open() {
  if (!snapshot || !document.getElementById("composeOutput").value.trim()) return;
  const dialog = document.getElementById("generationGuideDialog");
  if (dialog.open) return;
  render();
  dialog.showModal();
  document.getElementById("guideScrollBody").scrollTop = 0;
}
function bind() {
  const button = document.getElementById("generationGuideButton");
  const dialog = document.getElementById("generationGuideDialog");
  button.addEventListener("click", open);
  document.getElementById("generationGuideCloseButton").addEventListener("click", () => dialog.close());
  document.getElementById("composeOutput").addEventListener("input", event => { if (!event.target.value.trim()) clear(); });
  dialog.addEventListener("close", () => {
    if (!button.disabled) button.focus({ preventScroll: true });
    else document.getElementById("composeOutput").focus({ preventScroll: true });
  });
}
window.GenerationGuideUI = { set, clear, bind, open };
