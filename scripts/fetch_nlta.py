from __future__ import annotations
import json, re
from pathlib import Path
from urllib.request import Request, urlopen
from pypdf import PdfReader
PDFS=['https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/time2p.pdf','https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/time3p.pdf','https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/timer4.pdf','https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/timer5.pdf']
OUT=Path('data/nlta-routes.json')
def clean(s): return re.sub(r'\s+',' ',s.replace('\u00a0',' ')).strip(' -')
def extract(url):
 req=Request(url,headers={'User-Agent':'MauriMove NLTA data updater'}); data=urlopen(req,timeout=60).read(); reader=PdfReader(__import__('io').BytesIO(data)); return '\n'.join((p.extract_text() or '') for p in reader.pages)
def parse(text,source):
 lines=[clean(x) for x in text.splitlines() if clean(x)]; routes=[]; in_table=False; current=None
 route_re=re.compile(r'^([0-9]{1,3}[A-Z]?)(?:\s+)(.+)$'); ops=['NTC','UBS','TBS','RHT','MBT','IO','NTC/IO','UBS/IO','IO/NTC','BOCS(N)','BOCS(F)','BOCS(S)','QBBOCS','MFBOCS','EBOCS','PLBOCS','GPSBOCS','STHBOCS','CPEBOCS','GPFBOCS']
 for line in lines:
  if 'Route No' in line and 'Operator' in line and 'Route Description' in line: in_table=True; continue
  if not in_table: continue
  m=route_re.match(line)
  if m:
   rest=m.group(2); op=next((c for c in sorted(ops,key=len,reverse=True) if rest.startswith(c+' ')),None)
   if op:
    rest=rest[len(op):].strip(); current={'route':m.group(1),'operator':op,'description':rest,'source':source}; routes.append(current); continue
  if current and not line.startswith(('Route No','No. of fare','stages','licensed','Weekday frequency','DIRECTION')) and not re.match(r'^(Weekdays|Saturdays|Sundays|Direction|Fare Stage|Time of departure)',line) and len(line)<220 and not re.match(r'^\d{1,2}h\d{2}',line): current['description']=clean(current['description']+' '+line)
 out={}
 for r in routes:
  key=r['route'].upper()
  if key not in out or len(r['description'])>len(out[key]['description']): out[key]=r
 return list(out.values())
all_routes=[]
for url in PDFS: all_routes.extend(parse(extract(url),url.rsplit('/',1)[-1]))
seen={}
for r in all_routes:
 r['description']=clean(r['description'])
 if len(r['description'])>=8: seen[r['route']]=r
OUT.parent.mkdir(parents=True,exist_ok=True)
payload={'source':'National Land Transport Authority (NLTA), Mauritius','source_page':'https://nlta.govmu.org/Pages/Procedures/Bus-Timetable.aspx','generated_utc':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'routes':sorted(seen.values(),key=lambda r:(int(re.match(r'\d+',r['route']).group()),r['route']))}
OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Wrote {len(payload["routes"])} NLTA route records to {OUT}')
