import ast,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];base=root/'docs/manual/examples/nginx-flask-postgresql-redis/additions/python-web'
for p in base.glob('*.py'):ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
namespace={};exec(compile((base/'cache_service.py').read_text(encoding='utf-8-sig'),str(base/'cache_service.py'),'exec'),namespace)
value=[42];down=[False];clock=[0];items={}
class Cache:
 def get(self,key):
  if down[0]:raise RuntimeError('cache unavailable')
  item=items.get(key);return item[0]if item and item[1]>clock[0]else None
 def setex(self,key,ttl,data):
  if down[0]:raise RuntimeError('cache unavailable')
  assert ttl==10;items[key]=(data,clock[0]+ttl)
 def delete(self,key):
  if down[0]:raise RuntimeError('cache unavailable')
  items.pop(key,None)
def write(v):value[0]=v
service=namespace['CacheService'](lambda:value[0],write,Cache())
assert service.get_value()=={'value':42,'source':'database','cache':'available'}
assert service.get_value()['source']=='cache'
clock[0]=11;assert service.get_value()['source']=='database'
assert service.set_value(43)=={'value':43,'cache':'invalidated'}
assert service.get_value()['value']==43
for invalid in [True,None,'42;drop table',-1,1000001]:
 try:service.set_value(invalid);raise AssertionError('Invalid input accepted')
 except ValueError:pass
assert value[0]==43
down[0]=True;assert service.get_value()=={'value':43,'source':'database','cache':'unavailable'}
assert service.set_value(44)=={'value':44,'cache':'invalidation-failed'}
assert value[0]==44
(root/'tools/manual/qa/python-sample-result.json').write_text(json.dumps({'syntax':True,'mockedCacheControl':True,'flaskServerStarted':False,'dockerExecuted':False},indent=2),encoding='utf-8')
print('PASS Python sample syntax and mocked miss/hit/TTL/update/fallback/invalidation/input bounds; no Flask/DB/Redis process started')
