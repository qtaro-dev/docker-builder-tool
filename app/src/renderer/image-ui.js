/* カタログ更新と選択状態を管理。設定保存やテーマの状態とは独立させる。 */
let catalog = { schemaVersion: 1, checkedAt: "2026-10-26T00:00:00.000Z", entries: [] };
const selections = new Map();
let verifiedEntries = [];
function key(entry) { return `${entry.slotId}|${entry.tag}|${entry.digest}`; }
function candidates(id) {
  const entries = window.ImageVersions.candidates(catalog, id);
  const previous = selections.get(id);
  if (previous && !entries.some(e => key(e) === key(previous))) entries.unshift(previous);
  return entries;
}
function selected(id) {
  if (!selections.has(id)) selections.set(id, candidates(id).find(e => !window.ImageVersions.assess(e).blocked));
  return selections.get(id);
}
function appendControls(section, mod) {
  const entries = candidates(mod.id);
  selected(mod.id);
  const panel = document.createElement("div"); panel.className = "image-version-panel";
  const series = document.createElement("select"); series.setAttribute("aria-label", "バージョン系列"); series.className = "image-series";
  const variant = document.createElement("select"); variant.setAttribute("aria-label", "イメージ形式"); variant.className = "image-variant";
  const tag = document.createElement("code"); tag.className = "image-tag";
  const status = document.createElement("p"); status.className = "image-status"; status.setAttribute("role", "status");
  const details = document.createElement("details"); details.className = "image-details";
  const summary = document.createElement("summary"); summary.textContent = "詳細情報を表示";
  const detailText = document.createElement("p"); detailText.className = "image-detail-text";
  details.append(summary, detailText);
  function fill(select, values) {
    select.replaceChildren();
    for (const value of values) { const option = document.createElement("option"); option.value = value; option.textContent = value; select.appendChild(option); }
  }
  fill(series, [...new Set(entries.map(e => e.series))]);
  series.value = selected(mod.id)?.series || series.value;
  function renderVariants() {
    fill(variant, entries.filter(e => e.series === series.value).map(key));
    for (const option of variant.options) { const e = entries.find(e => key(e) === option.value); option.textContent = `${e.variant} — ${e.tag}`; }
    const current = selected(mod.id);
    if (current?.series === series.value) variant.value = key(current);
  }
  function show() {
    const entry = selected(mod.id);
    tag.textContent = entry?.image.split("@")[0] || "確認済みタグがありません";
    const messages = window.ImageVersions.assess(entry).messages;
    // 判断に必要な警告は折りたたまない。管理用の日時・出典等だけを詳細へ移す。
    const administrative = text => /^(保守情報確認：|タグ確認：)/.test(text);
    status.textContent = messages.filter(text => !administrative(text)).map(text => text.startsWith("脆弱性検査済み：") ? "脆弱性検査済み（検査日時は詳細）" : text).join("\n");
    detailText.textContent = entry ? [entry.image, `digest：${entry.digest}`, ...messages.filter(administrative),
      ...(entry.scan.checkedAt ? [`脆弱性検査日時：${entry.scan.checkedAt}`] : []),
      `情報源：${entry.source}`, `Linux：${entry.platforms.map(p => p.architecture).join(" / ")}`,
      window.ProjectGeneration.requirements[mod.id] || ""].filter(Boolean).join("\n") : "確認済みのイメージ情報がありません。";
  }
  renderVariants(); show();
  series.addEventListener("change", () => {
    renderVariants(); selections.set(mod.id, entries.find(e => key(e) === variant.value)); show();
  });
  variant.addEventListener("change", () => { selections.set(mod.id, entries.find(e => key(e) === variant.value)); show(); });
  for (const [text, control] of [["バージョン系列", series], ["イメージ形式 / 完全タグ", variant]]) {
    const label = document.createElement("label"); label.textContent = text + "： "; label.appendChild(control); panel.appendChild(label);
  }
  panel.append(tag, status, details);
  section.appendChild(panel);
}
async function initialize() {
  const status = document.getElementById("imageCatalogStatus");
  try {
    catalog = window.ImageVersions.validate(await window.electronAPI.getImageCatalog());
    verifiedEntries = catalog.entries;
    status.textContent = `保存済みデータ：${catalog.checkedAt}。オフライン利用可能。脆弱性未検査。`;
  } catch { status.textContent = "バージョン情報を読み込めません。更新してから生成してください。"; }
  const update = document.getElementById("updateImageCatalogButton");
  update.addEventListener("click", async () => {
    update.disabled = true; status.textContent = "公式レジストリでタグを確認しています。既存の選択は保持します…";
    try {
      const result = await window.electronAPI.updateImageCatalog();
      if (!result.ok) throw new Error(result.error);
      catalog = window.ImageVersions.validate(result.catalog);
      for (const [id, previous] of selections) {
        const sameImage = window.ImageVersions.candidates(catalog, id).find(e => previous && key(e) === key(previous));
        if (sameImage) selections.set(id, sameImage);
      }
      // 更新前に選択した実在タグの確認記録だけを保持。任意の入力値を実在扱いしない。
      verifiedEntries = [...catalog.entries, ...verifiedEntries.filter(e => [...selections.values()].some(s => s && key(s) === key(e)))];
      status.textContent = `更新完了：${catalog.checkedAt}。選択中のタグは維持しています。新しい候補へは各カードで切り替えてください。保守情報は同梱時点、脆弱性は未検査です。`;
      window.renderConfigSections();
    } catch (error) { status.textContent = `更新失敗：${error.message} 保存済みデータを引き続き利用します。`; }
    finally { update.disabled = false; }
  });
}
window.ImageUI = { initialize, appendControls, selected, selections, getCatalog: () => catalog, getVerifiedEntries: () => verifiedEntries, reset: () => selections.clear() };
