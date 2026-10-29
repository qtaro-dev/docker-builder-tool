// 実Electronで確認状態・開閉・秘密値の表示/コピーを検証。コピー以外の秘密値出力はしない。
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {clipboard,Menu,dialog}=require('electron');
module.exports=async({run,until,wc,win,errors})=>{
 const oldClipboard=await clipboard.readText();
 const originalTheme=await run('window.__rendererCore.getTheme()');
 const root='section.card[data-module-id="';
 const field=(id,name)=>`${root}${id}"] input[data-field-name="${name}"]`;
 const check=id=>`${root}${id}"] .module-review-checkbox`;
 const toggle=id=>`${root}${id}"] .module-panel-toggle`;
 const set=async(id,name,value,event='input')=>run(`(()=>{const e=document.querySelector(${JSON.stringify(field(id,name))});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('${event}',{bubbles:true}));})()`);
 const clicked=async selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const confirmed=id=>run(`document.querySelector(${JSON.stringify(check(id))}).checked`);
 const confirmAll=()=>run('window.__testConfirmModules()');
 const secret='clipboard-review-fixture-only';
 const nativeDialog=dialog.showOpenDialog;
 try{
  await run('window.__rendererUI.resetConfiguration();document.querySelector("[data-tab=config]").click()');
  assert.equal(await run('document.getElementById("generateButton").disabled'),true);
  assert.equal(await run('document.getElementById("generateButton").textContent.trim()'),'構成を確認');
  await run('window.__rendererGenerate.generateConfigs()');
  assert.equal(await run('document.getElementById("composeOutput").value'), '');
  await clicked('.module-row[data-module-id="nginx"]');
  await clicked(toggle('nginx'));assert.equal(await run('document.querySelector(".module-panel-body").hidden'),true);
  await clicked(toggle('nginx'));assert.equal(await run('document.querySelector(".module-panel-body").hidden'),false);
  win.focus();wc.focus();
  await run('document.querySelector(".module-panel-toggle").scrollIntoView({block:"center"});document.querySelector(".module-panel-toggle").focus()');
  await until('document.activeElement.classList.contains("module-panel-toggle")');
  await wc.sendInputEvent({type:'keyDown',keyCode:'Enter'});
  await wc.sendInputEvent({type:'char',keyCode:'\r'});
  await wc.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await until('document.querySelector(".module-panel-body").hidden');
  await clicked(toggle('nginx'));assert.equal(await run('document.querySelector(\'section.card[data-module-id="nginx"] input[data-field-name="hostPort"]\').value'),'8080');
  await run('window.__rendererUI.resetConfiguration()');
  const ids=['nginx','certbot','nodejs','wordpress','mysql','phpmyadmin'];
  for(const id of ids)await clicked(`.module-row[data-module-id="${id}"]`);
  assert.equal(await run('document.querySelectorAll(".module-panel-header").length'),6);
  assert.equal(await run('document.querySelectorAll(".module-panel-body:not([hidden])").length'),1);
  assert.equal(await run('document.querySelector(".module-panel-toggle").getAttribute("aria-expanded")'),'true');
  assert.equal(await run('document.querySelectorAll(".module-review-checkbox:checked").length'),0);
  await run('document.getElementById("projectNameInput").value="config-review"');
  await set('nginx','hostPort',19080);await set('nodejs','hostPort',19300);await set('wordpress','port',19090);await set('mysql','hostPort',13306);await set('phpmyadmin','port',19081);
  await set('certbot','domain','example.invalid');await set('certbot','email','learner@example.invalid');
  await set('mysql','password',secret);await set('phpmyadmin','dbPassword',secret);
  await clicked(check('nginx'));assert.match(await run('document.getElementById("configurationReviewStatus").textContent'),/確認済み 1 \/ 6/);
  await run('document.getElementById("generateButton").disabled=false;window.__rendererGenerate.generateConfigs()');
  assert.equal(await run('document.getElementById("composeOutput").value'),'');assert.equal(await run('document.getElementById("generateButton").disabled'),true);
  await confirmAll();assert.equal(await run('document.getElementById("generateButton").disabled'),false);
  assert.equal(await run('document.getElementById("generateButton").textContent.trim()'),'構成を実行');
  await clicked(toggle('mysql'));await clicked(toggle('wordpress'));
  assert.equal(await run('document.querySelectorAll(".module-panel-body:not([hidden])").length'),3);
  // ヘッダー内の確認チェックはパネルの開閉を起こさない。
  await clicked(check('mysql'));await clicked(check('mysql'));
  assert.equal(await run(`document.querySelector(${JSON.stringify(toggle('mysql'))}).getAttribute('aria-expanded')`),'true');
  const mysqlInput=field('mysql','password');const mysqlSection=`${root}mysql"]`;
  assert.equal(await run(`document.querySelector(${JSON.stringify(mysqlInput)}).type`),'password');
  await clicked(mysqlSection+' .secret-visibility');assert.equal(await run(`document.querySelector(${JSON.stringify(mysqlInput)}).type`),'text');
  await clicked(toggle('mysql'));assert.equal(await run(`document.querySelector(${JSON.stringify(mysqlInput)}).type`),'password');
  assert.equal(await run(`document.querySelector(${JSON.stringify(mysqlSection+' .secret-visibility')}).checked`),false);
  assert.equal(await confirmed('mysql'),true);
  await clicked(toggle('mysql'));assert.ok(await run(`document.querySelector(${JSON.stringify(mysqlInput)}).value===${JSON.stringify(secret)}`),'Collapse must retain the real input');
  await clicked(mysqlSection+' .secret-copy');await until(`document.querySelector(${JSON.stringify(mysqlSection+' .secret-copy-status')}).textContent.includes('コピーしました')`);
  assert.ok((await clipboard.readText())===secret,'Masked copy must preserve the original value');assert.equal(await confirmed('mysql'),true);
  await clicked(mysqlSection+' .secret-visibility');await clicked(mysqlSection+' .secret-visibility');assert.equal(await confirmed('mysql'),true);
  await run(`window.__secretWriter=navigator.clipboard.writeText;Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error(${JSON.stringify(secret)})}})`);
  await clicked(mysqlSection+' .secret-copy');await until(`document.querySelector(${JSON.stringify(mysqlSection+' .secret-copy-status')}).textContent.includes('コピーできません')`);
  assert.ok(await run(`!document.querySelector(${JSON.stringify(mysqlSection+' .secret-copy-status')}).textContent.includes(${JSON.stringify(secret)})`),'Failure notice must not contain the secret');
  await run('Object.defineProperty(navigator.clipboard,"writeText",{configurable:true,value:window.__secretWriter});delete window.__secretWriter');
  assert.equal(await confirmed('mysql'),true);
  await set('nginx','hostPort',19082);assert.equal(await confirmed('nginx'),false);assert.equal(await confirmed('mysql'),true);assert.equal(await confirmed('nodejs'),true);await clicked(check('nginx'));
  await set('mysql','password','');assert.equal(await confirmed('mysql'),false);assert.equal(await run(`document.querySelector(${JSON.stringify(mysqlSection+' .secret-copy')}).disabled`),true);
  await clicked(mysqlSection+' .secret-copy');assert.ok((await clipboard.readText())===secret,'Empty copy must not replace clipboard contents');
  await set('mysql','password',secret);await clicked(check('mysql'));
  // イメージ変更も対象だけ未確認にする。
  await run('const reviewSeries=document.querySelector(\'section.card[data-module-id="nodejs"] .image-series\');reviewSeries.value="22";reviewSeries.dispatchEvent(new Event("change",{bubbles:true}))');
  assert.equal(await confirmed('nodejs'),false);assert.equal(await confirmed('mysql'),true);await clicked(check('nodejs'));
  // プログラムからイベントなしで変えられても、生成処理自身が検出する。
  await run('document.querySelector(\'section.card[data-module-id="nodejs"] input[data-field-name="hostPort"]\').value="19301";window.__rendererGenerate.generateConfigs()');
  assert.equal(await confirmed('nodejs'),false);assert.equal(await run('document.getElementById("composeOutput").value'),'');await clicked(check('nodejs'));
  await clicked(mysqlSection+' .secret-visibility');await clicked('.module-row[data-module-id="redis"]');
  assert.equal(await confirmed('redis'),false);assert.equal(await confirmed('mysql'),true);assert.equal(await run(`document.querySelector(${JSON.stringify(mysqlInput)}).type`),'password');
  await clicked('.module-row[data-module-id="redis"]');await clicked('.module-row[data-module-id="nodejs"]');await clicked('.module-row[data-module-id="nodejs"]');
  assert.equal(await confirmed('nodejs'),false);assert.equal(await confirmed('mysql'),true);assert.equal(await run('document.querySelector(\'section.card[data-module-id="nodejs"] input[data-field-name="hostPort"]\').value'),'19301');await clicked(check('nodejs'));
  // 実フォルダ選択の戻り値も、そのカードの確認を解除する。
  await run('const storage=document.querySelector(\'section.card[data-module-id="nginx"] select[data-field-name="dataStoreType"]\');storage.value="bind";storage.dispatchEvent(new Event("change",{bubbles:true}))');
  await clicked(check('nginx'));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[__dirname]});
  await clicked('section.card[data-module-id="nginx"] [data-field-name="dataStorePath"] .btn-browse');
  await until('!document.querySelector(\'section.card[data-module-id="nginx"] .module-review-checkbox\').checked');assert.equal(await confirmed('mysql'),true);
  dialog.showOpenDialog=nativeDialog;await confirmAll();
  await run('window.__rendererGenerate.generateConfigs()');
  const compose=await run('document.getElementById("composeOutput").value');
  assert.ok(compose.includes('MYSQL_PASSWORD='+secret)&&compose.includes('WORDPRESS_DB_PASSWORD='+secret)&&compose.includes('PMA_PASSWORD='+secret),'Actual password must reach all generated consumers');
  assert.match(compose,/19301:3000/);assert.match(compose,/19090:80/);assert.match(compose,/example\.invalid/);
  console.log('PASS six-module panel open/close, confirmation gate/direct-call guard, targeted invalidation, real secret copy/failure/empty behavior, dependent Compose values and directory changes');
  // 既存の入力検証を確認チェックが置き換えていないこと。
  await set('nodejs','hostPort',19090);await clicked(check('nodejs'));await run('window.__rendererGenerate.generateConfigs()');
  assert.match(await run('document.getElementById("portMessage").textContent'),/ポート.*重複/);
  await set('nodejs','hostPort',19301);await clicked(check('nodejs'));
  await run('document.getElementById("projectNameInput").value="config-review-next";document.getElementById("projectNameInput").dispatchEvent(new Event("input",{bubbles:true}))');
  assert.equal(await run('document.querySelectorAll(".module-review-checkbox:checked").length'),0);await confirmAll();
  // 全テーマで6カードをコンパクトに表示。秘密値を表示した状態の画像は保存しない。
  const screenshots=process.env.DOCKER_BUILDER_SCREENSHOT_DIR;
  if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
  await run('document.querySelectorAll(".module-panel-toggle[aria-expanded=true]").forEach(b=>b.click())');
  const compactHeight=await run('[...document.querySelectorAll("#configSections section.card")].reduce((n,e)=>n+e.getBoundingClientRect().height,0)');assert.ok(compactHeight<650,'Six collapsed cards must remain compact');
  await run('window.__rendererCore.applyTheme("light")');await clicked(toggle('mysql'));
  await run('document.querySelector(\'section.card[data-module-id="mysql"]\').scrollIntoView();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  assert.equal(await run(`document.querySelector(${JSON.stringify(mysqlInput)}).type`),'password');
  if(screenshots)fs.writeFileSync(path.join(screenshots,'configuration-password-masked.png'),(await wc.capturePage()).toPNG());
  await clicked(toggle('mysql'));
  const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for(const theme of ['system','light','dark','blue','green','yellow','orange','red','pink']){
   await run(`window.__rendererCore.applyTheme('${theme}');document.querySelector('[data-tab=config]').click();document.getElementById('configSections').scrollIntoView();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
   const readyColor=await run('getComputedStyle(document.getElementById("generateButton")).backgroundColor');
   await clicked(check('nginx'));
   const pending=await run('(()=>{const b=document.getElementById("generateButton"),s=getComputedStyle(b);return {disabled:b.disabled,text:b.textContent,background:s.backgroundColor,color:s.color}})()');
   assert.equal(pending.disabled,true);assert.equal(pending.text,'構成を確認');assert.equal(pending.background,'rgb(180, 35, 54)');
   const pendingColors=[pending.color,pending.background].map(luminance);assert.ok((Math.max(...pendingColors)+.05)/(Math.min(...pendingColors)+.05)>=4.5,theme+' review button contrast');
   await clicked(check('nginx'));assert.equal(await run('document.getElementById("generateButton").textContent'),'構成を実行');
   assert.equal(await run('getComputedStyle(document.getElementById("generateButton")).backgroundColor'),readyColor);
   const colors=await run('(()=>{const h=getComputedStyle(document.querySelector(".module-panel-toggle"));const c=getComputedStyle(document.querySelector("#configSections .card"));return [h.color,c.backgroundColor]})()');
   const values=colors.map(luminance);assert.ok((Math.max(...values)+.05)/(Math.min(...values)+.05)>=4.5,theme+' header contrast');
   await clicked(toggle('mysql'));
   const passwordStyle=await run('(()=>{const input=document.querySelector(\'section.card[data-module-id="mysql"] input[data-secret-field]\');const other=document.querySelector(\'section.card[data-module-id="mysql"] input[data-field-name="database"]\');const c=getComputedStyle(input);return {width:input.getBoundingClientRect().width,other:other.getBoundingClientRect().width,colors:[c.color,c.backgroundColor]}})()');
   assert.ok(Math.abs(passwordStyle.width-passwordStyle.other)<=1,theme+' password width');
   const secretColors=passwordStyle.colors.map(luminance);assert.ok((Math.max(...secretColors)+.05)/(Math.min(...secretColors)+.05)>=4.5,theme+' password contrast');
   await clicked(toggle('mysql'));
   assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
   if(screenshots)fs.writeFileSync(path.join(screenshots,'configuration-panels-'+theme+'.png'),(await wc.capturePage()).toPNG());
  }
  win.setContentSize(540,720);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);win.setContentSize(1280,900);
  // 宣言に存在する5つの秘密入力が、再描画・追加時にも全てマスクされる。
  Menu.getApplicationMenu().items[0].submenu.items[0].click();await until('document.querySelectorAll(".module-panel-header").length===0');
  assert.equal(await run('document.getElementById("generateButton").disabled'),true);
  for(const id of ['mysql','mariadb','postgres','phpmyadmin','laravel','wordpress','redmine'])await clicked(`.module-row[data-module-id="${id}"]`);
  assert.equal(await run('document.querySelectorAll("input[data-secret-field]").length'),5);
  assert.equal(await run('[...document.querySelectorAll("input[data-secret-field]")].every(e=>e.type==="password")'),true);
  // 未対応DB依存の検証も残す。
  await run('window.__rendererUI.resetConfiguration();document.querySelector(\'.module-row[data-module-id="wordpress"]\').click();window.__testConfirmModules();window.__rendererGenerate.generateConfigs()');
  assert.match(await run('document.getElementById("portMessage").textContent'),/データベース/);
  assert.ok(!fs.readFileSync(path.join(__dirname,'docker-builder.log'),'utf8').includes(secret),'Secret must never enter the application log');
  assert.ok(!errors.some(message=>message.includes(secret)),'Secret must never enter renderer errors');
  console.log('PASS nine themes, compact six-card layout, five masked secret definitions, project/new/add/remove state and preserved port/dependency validation; no secret logging');
 }finally{
  dialog.showOpenDialog=nativeDialog;
  await run('if(window.__secretWriter){Object.defineProperty(navigator.clipboard,"writeText",{configurable:true,value:window.__secretWriter});delete window.__secretWriter;}window.__rendererUI.resetConfiguration()');
  await run(`window.__rendererCore.applyTheme(${JSON.stringify(originalTheme)})`);
  await clipboard.writeText(oldClipboard);
 }
};
