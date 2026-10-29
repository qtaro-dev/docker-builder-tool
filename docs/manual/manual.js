// ローカルHTMLだけで動作する。通信・認証・送信は行わない。
const dialog=document.getElementById('image-dialog');
document.querySelectorAll('.zoom-image').forEach(button=>button.addEventListener('click',()=>{
 const content=document.getElementById('zoom-content');content.replaceChildren(button.querySelector('.image-wrap').cloneNode(true));dialog.showModal();
}));
document.getElementById('zoom-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>document.getElementById('zoom-content').replaceChildren());
document.getElementById('print-button').addEventListener('click',()=>window.print());
const search=document.getElementById('recipe-search'),level=document.getElementById('recipe-level');
function filterRecipes(){
 if(!search)return;
 const terms=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
 document.querySelectorAll('.recipe').forEach(recipe=>{
  const match=terms.every(term=>recipe.dataset.search.includes(term))&&(!level.value||recipe.dataset.level===level.value);
  recipe.hidden=!match;document.querySelector(`.recipe-card[data-ref="${recipe.id}"]`).hidden=!match;
 });
}
[search,level].filter(Boolean).forEach(input=>input.addEventListener(input===search?'input':'change',filterRecipes));
document.getElementById('recipe-reset')?.addEventListener('click',()=>{search.value='';level.value='';filterRecipes();});
function revealHash(){
 const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(!target)return;
 const recipe=target.closest('.recipe');if(recipe?.hidden){document.getElementById('recipe-reset').click();}
 // 目次のターゲットは本文内の要素。固定サイドバーへはスクロールしない。
 target.scrollIntoView({behavior:'instant',block:'start'});
}
window.addEventListener('hashchange',revealHash);if(location.hash)window.addEventListener('load',revealHash);
let printDetails=[];
window.addEventListener('beforeprint',()=>{printDetails=[...document.querySelectorAll('details')].map(el=>[el,el.open]);printDetails.forEach(([el])=>el.open=true);});
window.addEventListener('afterprint',()=>{printDetails.forEach(([el,open])=>el.open=open);printDetails=[];});
