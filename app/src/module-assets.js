/* モジュール固有の追加ファイルを共通モデルへ追加する。秘密値は許可リストで除外する。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ModuleAssets=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const httpPorts={nodejs:3000,'python-web':8000,laravel:8000,wordpress:80,redmine:3000,phpmyadmin:80,jenkins:8080,portainer:9000,ollama:11434};
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function httpPort(id,cfg={}){return id==='python-web'&&cfg.framework==='flask'?5000:httpPorts[id];}
  function fields(){return [
    {name:'reverseProxy',label:'リバースプロキシ',type:'select',default:'off',advanced:true,options:[{value:'off',label:'OFF（通常のWebサーバー）'},{value:'on',label:'ON'}]},
    {name:'proxyTarget',label:'転送先HTTPサービス',type:'select',default:'',advanced:true,httpTargets:true,visibleWhen:{field:'reverseProxy',equals:'on'}},
    {name:'proxyPath',label:'転送元パス（/ または /api/ など）',type:'text',default:'/',advanced:true,visibleWhen:{field:'reverseProxy',equals:'on'}},
  ];}
  function page(title,body){return '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>body{font:16px sans-serif;max-width:900px;margin:50px auto;padding:24px;color:#173b59;background:#f1f8ff}main{background:white;padding:28px;border-radius:12px}th,td{text-align:left;border-bottom:1px solid #ccddea;padding:10px;overflow-wrap:anywhere}table{width:100%;table-layout:fixed}</style></head><body><main>'+body+'</main></body></html>\n';}
  function apply({modules,configs,projectName,selected,services,files,volumes,notes,errors}){
    const add=(id,relativePath,content)=>{
      if(files.some(f=>f.relativePath.toLowerCase()===relativePath.toLowerCase())){errors.push('追加ファイルの保存パスが重複しています：'+relativePath);return;}
      files.push({moduleId:id,filename:relativePath.split('/').pop(),relativePath,content});
    };
    for(const mod of modules.filter(m=>['nginx','apache'].includes(m.id))){
      const id=mod.id,cfg=configs.get(id)||{},svc=services.find(s=>s.name===projectName+'-'+id);if(!svc)continue;
      const enabled=cfg.reverseProxy==='on';
      if(!enabled)notes.push(`${id}：リバースプロキシはOFFです。通常のWebサーバーとして初期ページを配信します。`);
      if(cfg.reverseProxy&&!['on','off'].includes(cfg.reverseProxy)){errors.push(mod.label+'：リバースプロキシ設定が不正です。');continue;}
      const target=modules.find(m=>m.id===cfg.proxyTarget&&httpPorts[m.id]);
      const prefix=cfg.proxyPath===undefined?'/':String(cfg.proxyPath);
      const backendPort=target?httpPort(target.id,configs.get(target.id)):null;
      const backend=target?target.buildCompose({...configs.get(target.id),projectName},{projectName}).services[0].name:null;
      if(enabled){
        if(!target){errors.push(mod.label+'：選択中のHTTP対応サービスを転送先に指定してください。');continue;}
        if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix)||prefix.length>200||prefix.toLowerCase().startsWith('/setting.html')){errors.push(mod.label+'：転送元パスは / または /api/ のように末尾を / にしてください。予約パス・特殊文字は使えません。');continue;}
        if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(backend)){errors.push('転送先サービス名が不正です。');continue;}
        const dest=services.find(s=>s.name===backend);
        if(!dest?.ports?.some(p=>p.endsWith(':'+backendPort)||p.endsWith(':'+backendPort+'/tcp'))){errors.push(mod.label+'：転送先の内部HTTPポートが一致しません。');continue;}
        const ownPort=id==='nginx'?'hostPortProtocol':'portProtocol';
        if(cfg[ownPort]==='udp'){errors.push(mod.label+'：HTTPプロキシにはTCPを指定してください。');continue;}
        svc.depends_on=[...new Set([...(svc.depends_on||[]),backend])];
        notes.push(`${id}：${prefix} を http://${backend}:${backendPort}/ へ転送します。転送元の接頭辞は除去します。転送先のアプリ・依存ファイル・DB設定は別途必要です。depends_onは応答準備を待ちません。`);
      }
      const docroot=id==='nginx'?'/usr/share/nginx/html':'/usr/local/apache2/htdocs';
      let htmlPath=id+'/html/index.html';
      if(cfg.dataStoreType==='bind'){
        const bind=String(cfg.dataStorePath||'./src').replaceAll('\\','/');
        if(['.','./','..','../','/'].includes(bind)||bind.split('/').includes('..')){errors.push(mod.label+'：公開ディレクトリには専用のサブフォルダを指定してください。管理用HTMLを含む親フォルダは公開できません。');continue;}
        if(/^\.\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(bind))htmlPath=bind.slice(2)+'/index.html';
        else notes.push(`${id}：公開コンテンツのバインド先 ${bind} は生成物の保存先外または自動配置対象外です。${htmlPath}を指定先のindex.htmlへ配置してください。未配置のまま初期ページを表示できません。`);
      }
      const index=page('構築完了テストページ','<h1>構築完了テストページ</h1><p>'+escape(mod.label)+' が正常に応答しています。</p>');
      add(id,htmlPath,index);
      const configName=id==='nginx'?'default.conf':'httpd-support.conf';
      let content;
      if(id==='nginx')content='server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n  location = /setting.html { return 404; }\n'+(enabled?`  location ${prefix} {\n    proxy_pass http://${backend}:${backendPort}/;\n    proxy_set_header Host $host;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n  }\n`:'')+'}\n';
      else content=(enabled?'LoadModule proxy_module modules/mod_proxy.so\nLoadModule proxy_http_module modules/mod_proxy_http.so\n':'')+'ServerName localhost\n<VirtualHost *:80>\n  DocumentRoot "/usr/local/apache2/htdocs"\n  <Directory "/usr/local/apache2/htdocs">\n    Require all granted\n    DirectoryIndex index.html\n  </Directory>\n  <Location "/setting.html">\n    Require all denied\n  </Location>\n'+(enabled?`  ProxyRequests Off\n  ProxyPass "/setting.html" "!"\n  ProxyPass "${prefix}" "http://${backend}:${backendPort}/"\n  ProxyPassReverse "${prefix}" "http://${backend}:${backendPort}/"\n`:'')+'</VirtualHost>\n';
      add(id,id+'/conf/'+configName,content);
      svc.volumes=[...(svc.volumes||[]),`./${id}/conf/${configName}:${id==='nginx'?'/etc/nginx/conf.d/default.conf':'/usr/local/apache2/conf/extra/web-support.conf'}:ro`];
      if(id==='apache')svc.command=['httpd-foreground','-c','Include /usr/local/apache2/conf/extra/web-support.conf'];
      // 名前付きボリュームは新規作成時だけイメージ内のHTMLで初期化。既存データは保持する。
      if(cfg.dataStoreType!=='bind'){
        svc.build={context:'./'+id,dockerfile:'Dockerfile.'+id};delete svc.image;
        add(id,id+'/Dockerfile.'+id,`FROM ${selected.get(id).image}\nCOPY html/ ${docroot}/\n`);
        add(id,id+'/Dockerfile.'+id+'.dockerignore','**\n!html/\n!html/index.html\n');
        notes.push(`${id}：新規の名前付きボリュームには初期ページを配置します。既存ボリュームの内容は上書きしません。更新する場合は利用者が内容を確認してください。`);
      }
      const rows=[['Webサーバー',mod.label],['イメージ',selected.get(id).image],['選択モジュール',modules.map(m=>m.label||m.id).join('、')],['公開ポート・内部ポート',(svc.ports||[]).join(', ')],['リバースプロキシ',enabled?'有効':'無効'],['転送元パス',enabled?prefix:'なし'],['転送先サービス',enabled?backend:'なし'],['転送先内部ポート',enabled?backendPort:'なし']];
      add(id,id+'/setting.html',page('構成確認', '<p><strong>※この内容は管理用です。外部公開しないでください。</strong></p><h1>生成時の構成情報</h1><table>'+rows.map(([k,v])=>'<tr><th>'+escape(k)+'</th><td>'+escape(v)+'</td></tr>').join('')+'</table>'));
      // 公開マウント元が管理HTMLの親にならないかを検査する（複数Webモジュールも含む）。
      notes.push(`${id}/setting.htmlは管理用のローカル確認ページです。公開ディレクトリへコピーしないでください。`);
    }
    const privatePaths=files.filter(f=>f.filename==='setting.html').map(f=>f.relativePath.toLowerCase());
    for(const svc of services)for(const mount of svc.volumes||[]){const source=mount.split(':')[0].replace(/^\.\//,'').replace(/\/$/,'').toLowerCase();if(privatePaths.some(p=>p===source||p.startsWith(source+'/')))errors.push('公開マウント元にsetting.htmlが含まれます。公開用サブフォルダを指定してください。');}
    for(const f of files){if(f.relativePath.split('/').some(p=>p==='..'||p==='.'||/[<>:"\\|?*]/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)||/[. ]$/.test(p)))errors.push('生成ファイルの保存パスが不正です：'+f.relativePath);}
  }
  return {apply,fields,httpPorts,httpPort};
});
