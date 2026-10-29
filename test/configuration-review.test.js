const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ReviewState,isSecretField}=require('../app/src/configuration-review');
const {loadModules}=require('../scripts/lib/headless-generation.cjs');

test('review starts closed except first, requires every selection, and drops removed/new state',()=>{
  const review=new ReviewState();review.sync(['nginx','mysql']);
  assert.equal(review.states.get('nginx').expanded,true);assert.equal(review.states.get('mysql').expanded,false);
  assert.equal(review.ready([],()=>''),false);assert.equal(review.ready(['nginx','mysql'],()=>''),false);
  review.acknowledge('nginx','n',true);review.acknowledge('mysql','m',true);
  assert.equal(review.ready(['nginx','mysql'],id=>id==='nginx'?'n':'m'),true);
  review.sync(['nginx','mysql','nodejs']);assert.equal(review.states.get('nodejs').confirmed,false);
  review.sync(['nginx']);review.sync(['nginx','mysql']);assert.equal(review.states.get('mysql').confirmed,false);
  review.clear();review.sync(['nginx']);assert.equal(review.states.get('nginx').confirmed,false);
});

test('changing a fingerprint invalidates only the affected module; UI-only state does not invalidate',()=>{
  const review=new ReviewState();review.sync(['nginx','mysql']);
  review.acknowledge('nginx','n',true);review.acknowledge('mysql','m',true);
  review.states.get('mysql').expanded=true;
  assert.equal(review.ready(['nginx','mysql'],id=>id==='nginx'?'n':'m'),true);
  assert.equal(review.ready(['nginx','mysql'],id=>id==='nginx'?'changed':'m'),false);
  assert.equal(review.states.get('mysql').confirmed,true);assert.equal(review.states.get('nginx').confirmed,false);
});

test('all actual secret inputs are identified by field definition, including fields not named password',()=>{
  const actual=loadModules().flatMap(m=>m.fields.filter(isSecretField).map(f=>m.id+'.'+f.name)).sort();
  assert.deepEqual(actual,['laravel.dbPassword','mariadb.password','mysql.password','phpmyadmin.dbPassword','postgres.password']);
  for(const field of [{name:'apiKey'},{name:'accessToken'},{name:'private_key'},{name:'opaque',sensitive:true},{name:'opaque',type:'password'}])assert.equal(isSecretField(field),true);
  for(const field of [{name:'dbHost'},{name:'appId'},{name:'hostPort'}])assert.equal(isSecretField(field),false);
});
