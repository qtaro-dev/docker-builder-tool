"""正規資料のリンク・配布構成と、旧docs一式の無変更退避を検査する。"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,hashlib,re
root=Path(__file__).resolve().parents[2];base=root/'docs/manual';qa=root/'tools/manual/qa'
class Page(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.links=[];self.images=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.append(a['id'])
  if tag=='a':self.links.append(a.get('href',''))
  if tag=='img':self.images.append(a['src'])
pages={}
for name in ['index.html','recipes.html']:
 s=(base/name).read_text(encoding='utf-8');p=Page();p.feed(s);pages[name]=p
 assert len(p.ids)==len(set(p.ids)),name
 for removed in ['32レシピ','32構成','32の構成例','過去に実動作確認','生成確認のみ','未検証 23','recipe-status','recipe-count','data-state=','class="status"','class="scope"']:
  assert removed not in s,(name,removed)
 for term in ['current-draft','初稿','ドラフト','撮影','制作記録','README','D:\\Dev\\','C:\\Users\\RDP','/actions/runs/']:
  assert term not in s,(name,term)
 for src in p.images:
  image=base/src;assert image.is_file(),src;assert image.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
 for figure in re.findall(r'<figure\b.*?</figure>',s,re.S):
  assert re.findall(r'<b class="annotation-marker" data-number="(\d+)"',figure)==re.findall(r'<li><b>(\d+)</b><span>',figure)
for removed in ['recipe-status','recipe-count','32件']:
 assert removed not in (base/'manual.js').read_text(encoding='utf-8'),removed
for name,p in pages.items():
 for link in p.links:
  url=urlsplit(link);assert not url.scheme and not url.netloc,link
  target=base/unquote(url.path) if url.path else base/name;assert target.is_file(),(name,link)
  if url.fragment:assert unquote(url.fragment)in pages[target.name].ids,(name,link)
assert sorted(p.name for p in(root/'docs').iterdir())==['OLD','manual']
assert sorted(p.name for p in base.iterdir())==sorted(['index.html','recipes.html','manual.css','manual.js','art','icons','images','examples'])
assert 'open-recipes'in pages['index.html'].ids and 'back-to-guide'in pages['recipes.html'].ids
assert 'art/carry.png'in pages['recipes.html'].images
manifest=json.loads((root/'docs/OLD/docs-archive-manifest-2026-10-27.json').read_text(encoding='utf-8-sig'))
for item in manifest:
 old=root/'docs/OLD'/item['path'];assert old.is_file(),str(old)
 assert hashlib.sha256(old.read_bytes()).hexdigest().lower()==item['sha256'].lower(),str(old)
# アプリ・テスト・設定等は前回の基準と同じ。docsは保存先を読み替えて照合する。
protected=json.loads((root/'docs/OLD/manual/tools/official-manual/qa/protected.json').read_text(encoding='utf-8-sig'))
for item in protected:
 rel=item['path'].replace('\\','/');p=root/('docs/OLD/'+rel[len('docs/'):] if rel.startswith('docs/') else rel)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'],rel
for href in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',(root/'README.md').read_text(encoding='utf-8')):
 if '://'not in href:assert (root/href.split('#')[0]).is_file(),('README broken',href)
result={'publicPages':2,'recipes':len(json.loads((root/'tools/manual/recipe-inputs.json').read_text(encoding='utf-8'))),'crossPageLinks':True,'recipeCharacter':True,'imageAssets':len({src for p in pages.values()for src in p.images}),'canonicalManualSeparatedFromArchive':True,'localLinksAndAnnotations':'PASS','archivedFilesByteIdentical':len(manifest),'appAndExistingStateUnchanged':True}
(qa/'static-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=True))
