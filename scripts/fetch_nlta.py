from __future__ import annotations
import io, json, re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from pypdf import PdfReader

TIMETABLE_PAGE = 'https://nlta.govmu.org/Pages/Procedures/Bus-Timetable.aspx'
KNOWN_PDFS = [
    'https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/time2p.pdf',
    'https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/time3p.pdf',
    'https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/timer4.pdf',
    'https://nlta.govmu.org/Documents/Downloads/Procedures%20Forms/Bus-TimeTable/timer5.pdf',
]
OUT = Path('data/nlta-routes.json')

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.text=[]; self.capture=0
    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'a':
            a=dict(attrs); self.links.append((a.get('href',''), ''))
            self.capture=len(self.links)
    def handle_data(self, data):
        if self.links and self.capture:
            href,_=self.links[-1]; self.links[-1]=(href, (self.links[-1][1]+' '+data).strip())
    def handle_endtag(self, tag):
        if tag.lower() == 'a': self.capture=0

def fetch(url):
    req=Request(url, headers={'User-Agent':'MauriMove official NLTA data updater'})
    return urlopen(req, timeout=90).read()

def discover_pdfs():
    urls=[]
    try:
        html=fetch(TIMETABLE_PAGE).decode('utf-8','ignore')
        p=LinkParser(); p.feed(html)
        for href,text in p.links:
            u=urljoin(TIMETABLE_PAGE, href)
            label=(text+' '+href).lower()
            if '.pdf' in u.lower() and ('route' in label or 'download pdf' in label):
                urls.append(u)
    except Exception as e:
        print('NLTA page discovery failed:', e)
    # Keep only timetable PDFs and preserve the known working URLs as fallback.
    urls += KNOWN_PDFS
    out=[]
    for u in urls:
        if 'Bus-TimeTable' not in u and 'Bus-Timetable' not in u: continue
        if u not in out: out.append(u)
    return out

def clean(s):
    return re.sub(r'\s+', ' ', s.replace('\u00a0',' ')).strip(' -')

def extract(url):
    data=fetch(url)
    reader=PdfReader(io.BytesIO(data))
    return '\n'.join((p.extract_text() or '') for p in reader.pages)

def parse(text, source):
    lines=[clean(x) for x in text.splitlines() if clean(x)]
    routes=[]; in_table=False; current=None
    route_re=re.compile(r'^([0-9]{1,3}[A-Z]?)(?:\s+)(.+)$')
    ops=['NTC','UBS','TBS','RHT','MBT','IO','NTC/IO','UBS/IO','IO/NTC','BOCS(N)','BOCS(F)','BOCS(S)','QBBOCS','MFBOCS','EBOCS','PLBOCS','GPSBOCS','STHBOCS','CPEBOCS','GPFBOCS']
    for line in lines:
        if 'Route No' in line and 'Operator' in line and 'Route Description' in line:
            in_table=True; current=None; continue
        if not in_table: continue
        m=route_re.match(line)
        if m:
            rest=m.group(2)
            op=next((c for c in sorted(ops,key=len,reverse=True) if rest.startswith(c+' ')),None)
            if op:
                rest=rest[len(op):].strip()
                current={'route':m.group(1),'operator':op,'description':rest,'source':source}
                routes.append(current); continue
        if current and not line.startswith(('Route No','No. of fare','stages','licensed','Weekday frequency','DIRECTION')) and not re.match(r'^(Weekdays|Saturdays|Sundays|Direction|Fare Stage|Time of departure)',line) and len(line)<260 and not re.match(r'^\d{1,2}h\d{2}',line):
            current['description']=clean(current['description']+' '+line)
    return routes

all_routes=[]
urls=discover_pdfs()
print('NLTA timetable PDFs discovered:', len(urls))
for url in urls:
    try:
        all_routes.extend(parse(extract(url), url.rsplit('/',1)[-1]))
        print('Parsed', url)
    except Exception as e:
        print('Skipping', url, ':', e)

seen={}
for r in all_routes:
    r['description']=clean(r['description'])
    if len(r['description'])>=8:
        seen[r['route'].upper()]=r

payload={
    'source':'National Land Transport Authority (NLTA), Mauritius',
    'source_page':TIMETABLE_PAGE,
    'generated_utc':datetime.now(timezone.utc).isoformat(),
    'pdf_sources':urls,
    'route_count':len(seen),
    'routes':sorted(seen.values(),key=lambda r:(int(re.match(r'\d+',r['route']).group()),r['route']))
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Wrote {len(seen)} NLTA route records to {OUT}')
