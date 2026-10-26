/* 選択中ファイルの編集を保持し、保存対象と画面の内容を一致させる。 */
let files = [], currentIndex = -1;
let originalCompose = "", originalContents = new Map();
function remember() {
  if (files[currentIndex]) files[currentIndex].content = document.getElementById("dockerfileOutput").value;
}
function display(index) {
  currentIndex = index;
  const file = files[index];
  document.getElementById("dockerfileOutput").value = file?.content || "";
  document.getElementById("generatedFilePath").textContent = file ? `Compose配置フォルダからの相対パス：${file.relativePath}` : "この構成にDockerfileはありません。";
  document.getElementById("dockerfileDownloadBtn").disabled = !file;
}
function set(next) {
  window.GenerationGuideUI?.clear();
  files = next.map(f => ({ ...f })); currentIndex = -1;
  originalCompose = document.getElementById("composeOutput").value;
  originalContents = new Map(files.map(f => [f.relativePath, f.content]));
  const select = document.getElementById("generatedFileSelect"); select.replaceChildren();
  files.forEach((file, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = file.relativePath; select.appendChild(option); });
  display(files.length ? 0 : -1);
  document.getElementById("generatedSaveStatus").textContent = "";
}
function isEdited() {
  remember();
  return document.getElementById("composeOutput").value !== originalCompose || files.some(f => f.content !== originalContents.get(f.relativePath));
}
function bind() {
  document.getElementById("generatedFileSelect").addEventListener("change", event => { remember(); display(Number(event.target.value)); });
}
window.GeneratedFiles = { set, bind, isEdited, current: () => { remember(); return files[currentIndex]; } };
