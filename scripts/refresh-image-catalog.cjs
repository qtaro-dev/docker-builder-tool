// 開発時に公式レジストリで確認した初期データを作る。コンテナ実行は行わない。
const fs = require("node:fs");
const path = require("node:path");
const { collect } = require("../image-catalog");
const target = path.join(__dirname, "../app/data/image-catalog.json");
const previous = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : { schemaVersion: 1, checkedAt: new Date().toISOString(), entries: [] };
// 開発者が同梱ポリシーを変更した場合のみ、廃止slotを初期データから除く。
const { slots } = require("../app/src/image-versions");
previous.entries = previous.entries.filter(e => slots.some(s => s.id === e.slotId && new RegExp(s.pattern).test(e.tag)));
collect(previous, undefined, undefined, console.log).then(catalog => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Verified ${catalog.entries.length} candidates`);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
