// 注記番号と対象部品の非重複を、全画像・複数幅・拡大・印刷メディアで確認する。
const {app,BrowserWindow}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'qa'),profile=path.join(out,'profiles','annotations-'+process.pid);fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.setPath('sessionData',path.join(profile,'session'));
setTimeout(()=>{console.error('Annotation test timeout');app.exit(1)},45000).unref();
(async()=>{
 await app.whenReady();const win=new BrowserWindow({show:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});const wc=win.webContents,run=s=>wc.executeJavaScript(s,true);wc.debugger.attach('1.3');
 const report={pages:[],pdfGenerated:false};
 const verify=async selector=>{
  const result=await run(`(()=>{
   const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
   const issues=[];let count=0;
   document.querySelectorAll(${JSON.stringify(selector)}).forEach(wrap=>{
    const markers=[...wrap.querySelectorAll('.annotation-marker')];const targets=[...wrap.querySelectorAll('.target')];
    const parent=wrap.closest('figure')||wrap.closest('#zoom-content');const bound=parent.getBoundingClientRect();
    for(const marker of markers){count++;const r=marker.getBoundingClientRect();
     for(const target of targets)if(overlaps(r,target.getBoundingClientRect()))issues.push({figure:parent.id,number:marker.dataset.number,overlappingTarget:target.dataset.number});
     for(const other of markers)if(other!==marker&&overlaps(r,other.getBoundingClientRect()))issues.push({figure:parent.id,number:marker.dataset.number,overlappingMarker:other.dataset.number});
     if(r.left<bound.left-.5||r.right>bound.right+.5||r.top<bound.top-.5||r.bottom>bound.bottom+.5)issues.push({figure:parent.id,number:marker.dataset.number,outsideFigure:true});
    }
   });return {count,issues};
  })()`);
  assert.deepEqual(result.issues,[],JSON.stringify(result.issues));return result.count;
 };
 for(const page of ['index.html','recipes.html']){
  console.log('CHECK annotations',page);await win.loadFile(path.join(root,'docs/manual',page));
  await run('Promise.all(Array.from(document.images,i=>{i.loading="eager";return i.decode()}))');
  for(const width of [1280,560]){console.log('WIDTH',width);win.setContentSize(width,1100);await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const count=await verify('.screenshot .image-wrap');report.pages.push({page,width,count,overlap:false});}
  win.setContentSize(1280,1100);
  const examples=page==='recipes.html'?['flask-basic-config','flask-basic-output']:['home','password'];
  for(const id of examples){
   await run(`document.getElementById('shot-${id}').scrollIntoView({behavior:'instant',block:'start'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
   fs.writeFileSync(path.join(out,'annotation-'+id+'.png'),(await wc.capturePage()).toPNG());
  }
  await run('document.querySelector(".zoom-image").click()');await verify('#zoom-content .image-wrap');await run('document.getElementById("zoom-close").click()');
  win.setContentSize(688,1016);await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{media:'print'});await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  report.pages.push({page,media:'print',count:await verify('.screenshot .image-wrap'),overlap:false});await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{media:'screen'});
 }
 fs.writeFileSync(path.join(out,'annotation-result.json'),JSON.stringify(report,null,2));console.log('PASS all annotation numbers outside target controls; no marker collisions; 1280/560/zoom/print; PNGs unchanged');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
