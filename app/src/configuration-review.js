/* 設定確認の状態だけを管理する。入力値や秘密値はログ・永続設定へ出さない。 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ConfigurationReview=api;
})(typeof window==='object'?window:globalThis,function(){
  function isSecretField(field){
    return field.type==='password'||field.sensitive===true||/password|passwd|secret|token|api[_-]?key|private[_-]?key/i.test(field.name||'');
  }
  class ReviewState {
    constructor(){this.states=new Map();}
    clear(){this.states.clear();}
    sync(ids){
      for(const id of this.states.keys())if(!ids.includes(id))this.states.delete(id);
      for(const id of ids)if(!this.states.has(id))this.states.set(id,{expanded:this.states.size===0,confirmed:false,snapshot:null});
    }
    acknowledge(id,snapshot,checked){
      const state=this.states.get(id);if(!state)return;
      state.confirmed=Boolean(checked);state.snapshot=checked?snapshot:null;
    }
    refresh(id,snapshot){
      const state=this.states.get(id);
      if(state?.confirmed&&state.snapshot!==snapshot){state.confirmed=false;state.snapshot=null;}
      return Boolean(state?.confirmed);
    }
    ready(ids,fingerprint){return ids.length>0&&ids.map(id=>this.refresh(id,fingerprint(id))).every(Boolean);}
  }
  return {ReviewState,isSecretField};
});
