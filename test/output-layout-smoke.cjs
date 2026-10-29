// 生成結果の利用可能高さ・内部スクロール・他タブへの非干渉を実レイアウトで検査する。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({run,wc,win})=>{
 await run(`(async()=>{document.querySelectorAll('.module-row.is-selected').forEach(e=>e.click());['nginx','nodejs'].forEach(id=>document.querySelector('.module-row[data-module-id="'+id+'"]').click());window.__rendererModulesUI.renderConfigSections(true);window.__testConfirmModules();await window.__rendererGenerate.generateConfigs();document.querySelector('[data-tab="output"]').click();})()`);
 assert.equal(await run(`document.getElementById('generationGuideButton').disabled`),false);
 const frame=()=>run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
 const measure=()=>run(`(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};return {compose:rect('composeOutput'),file:rect('dockerfileOutput'),guide:rect('generationGuideButton'),width:innerWidth,height:innerHeight,bodyScroll:document.documentElement.scrollHeight,buttons:['composeDownloadBtn','composeCopyBtn','composeClearBtn','dockerfileDownloadBtn','dockerfileCopyBtn','dockerfileClearBtn','generatedBundleSaveBtn'].map(rect)}})()`);
 let small;
 for(const [width,height] of [[1280,640],[1280,720],[1920,1080],[1280,720]]){
  win.setContentSize(width,height);await frame();
  const m=await measure();assert.ok(m.compose.right<m.file.left);assert.ok(m.compose.height>150);assert.ok(m.file.height>100);
  assert.ok(m.guide.top>=Math.max(m.compose.bottom,m.file.bottom));assert.ok(m.guide.bottom<=height);assert.ok(m.bodyScroll<=height+1);
  for(const b of m.buttons){assert.ok(b.top>=0&&b.bottom<=height&&b.right<=width);}
  if(width===1280&&height===720)small=m;
  if(width===1920){assert.ok(m.compose.height>small.compose.height+300);assert.ok(m.file.height>small.file.height+300);}
 }
 await run(String.raw`document.getElementById('composeOutput').value=Array(500).fill('long output line').join('\n');document.getElementById('dockerfileOutput').value=Array(500).fill('long generated file').join('\n');document.getElementById('generatedSaveStatus').textContent=('長い保存先の通知です。').repeat(100);`);
 await frame();
 assert.equal(await run(`['composeOutput','dockerfileOutput'].every(id=>{const e=document.getElementById(id);e.scrollTop=200;return e.scrollHeight>e.clientHeight&&e.scrollTop>0})`),true);
 const notice=await measure();for(const b of notice.buttons)assert.ok(b.bottom<=720);assert.ok(notice.guide.bottom<=720);
 await run(`document.getElementById('generatedSaveStatus').textContent=''`);
 const screenshots=path.join(process.env.DOCKER_BUILDER_SOURCE_ROOT,'release/output-layout');fs.mkdirSync(screenshots,{recursive:true});
 for(const theme of ['system','light','dark','blue','green','yellow','orange','red','pink']){
  await run(`window.__rendererCore.applyTheme(${JSON.stringify(theme)})`);await frame();const m=await measure();assert.ok(m.guide.bottom<=720&&m.file.height>100);
  if(['light','dark'].includes(theme))fs.writeFileSync(path.join(screenshots,theme+'-1280x720.png'),(await wc.capturePage()).toPNG());
 }
 await run(`document.getElementById('generationGuideButton').click()`);assert.equal(await run(`document.getElementById('generationGuideDialog').open`),true);
 await run(`document.getElementById('generationGuideCloseButton').click();document.querySelector('[data-tab="modules"]').click()`);
 assert.equal(await run(`getComputedStyle(document.body).display`),'block');assert.equal(await run(`getComputedStyle(document.querySelector('.app-main')).marginBottom`),'32px');
 await run(`document.querySelector('[data-tab="config"]').click()`);assert.equal(await run(`getComputedStyle(document.body).display`),'block');
 await run(`window.__rendererCore.applyTheme('dark');window.__rendererUI.clearResultsOnly()`);
 console.log('PASS output Flex height tracking at 1280x640/720 and 1920x1080, two columns, visible controls/guide, long-status containment, internal scroll, nine themes and unchanged other-tab layout');
};
